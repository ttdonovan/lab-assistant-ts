import { AnchorProvider, BN, Program, ProgramAccount, Wallet } from '@project-serum/anchor';
import { Account as TokenAccount } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import {
    CARGO_IDL,
    CargoIDLProgram,
    CargoType,
} from '@staratlas/cargo';
import {
    AsyncSigner,
    buildAndSignTransaction,
    getParsedTokenAccountsByOwner,
    InstructionReturn,
    keypairToAsyncSigner,
    readFromRPCOrError,
    sendTransaction,
    byteArrayToString,
    stringToByteArray,
    TransactionReturn,
} from '@staratlas/data-source';
import {
    PlayerProfileIDL,
    PLAYER_PROFILE_IDL,
} from '@staratlas/player-profile';
import {
    ProfileFactionAccount,
    ProfileFactionIDL,
    PROFILE_FACTION_IDL,
} from '@staratlas/profile-faction';
import {
    SAGE_IDL,
    SageIDLProgram,
    Fleet,
    Game,
    GameState,
    MineItem,
    PlanetType,
    Resource,
    SagePlayerProfile,
    Sector,
    Starbase,
    StarbasePlayer,
} from '@staratlas/sage';

const findGame = async (provider: AnchorProvider) => {
    const program = await sageProgram(provider);
    const game = await program.account.game.all();

    return game;
};

const findAllPlanets = async (provider: AnchorProvider) => {
    const program = await sageProgram(provider);
    const planets = await program.account.planet.all([
        // {
        //     memcmp: {
        //         offset: 9,
        //         bytes: bs58.encode(Buffer.from('UST-1-3')),
        //     },
        // },
    ]);

    return planets;
}

export const sageProgram = async (provider: AnchorProvider) => {
    return new Program(
        SAGE_IDL,
        new PublicKey(SageGameHandler.SAGE_PROGRAM_ID),
        provider,
    );
}

interface SagePlanetAddresses {
    [key: string]: PublicKey;
}

interface SageResourcesMints {
    [key: string]: PublicKey;
}

export class SageGameHandler {
    // https://build.staratlas.com/dev-resources/mainnet-program-ids
    static readonly SAGE_PROGRAM_ID = 'SAGEqqFewepDHH6hMDcmWy7yjHPpyKLDnRXKb3Ki8e6';
    static readonly CARGO_PROGRAM_ID = 'Cargo8a1e6NkGyrjy4BQEW4ASGKs9KSyDyUrXMfpJoiH';
    static readonly PLAYER_PROFILE_PROGRAM_ID = 'pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9';
    static readonly PROFILE_FACTION_PROGRAM_ID = 'pFACSRuobDmvfMKq1bAzwj27t6d2GJhSCHb1VcfnRmq';

    static readonly SAGE_RESOURCES_MINTS: SageResourcesMints = {
        'arco': new PublicKey('ARCoQ9dndpg6wE2rRexzfwgJR3NoWWhpcww3xQcQLukg'),
        'biomass': new PublicKey('MASS9GqtJz6ABisAxcUn3FeR4phMqH1XfG6LPKJePog'),
        'carbon': new PublicKey('CARBWKWvxEuMcq3MqCxYfi7UoFVpL9c4rsQS99tw6i4X'),
        'diamond': new PublicKey('DMNDKqygEN3WXKVrAD4ofkYBc4CKNRhFUbXP4VK7a944'),
        'hydrogen': new PublicKey('HYDR4EPHJcDPcaLYUcNCtrXUdt1PnaN4MvE655pevBYp'),
        'iron_ore': new PublicKey('FeorejFjRRAfusN9Fg3WjEZ1dRCf74o6xwT5vDt3R34J'),
        'lumanite': new PublicKey('LUMACqD5LaKjs1AeuJYToybasTXoYQ7YkxJEc4jowNj'),
        'rochinol': new PublicKey('RCH1Zhg4zcSSQK8rw2s6rDMVsgBEWa4kiv1oLFndrN5')
    };

    ready: Promise<string>;

    program: SageIDLProgram;
    playerProfileProgram: Program<PlayerProfileIDL>;
    profileFactionProgram: Program<ProfileFactionIDL>;
    cargoProgram: CargoIDLProgram;

    connection: Connection;
    provider: AnchorProvider;

    funder: AsyncSigner;
    gameId?: PublicKey;
    gameState?: PublicKey;
    cargoStatsDefinition?: PublicKey;
    cargoStatsDefinitionSeqId?: number;
    craftingDomain?: PublicKey;
    mints?: { [key: string]: PublicKey };

    game?: Game;
    planetLookup?: SagePlanetAddresses;

    constructor(funder: Keypair, connection: Connection) {
        this.connection = connection;
        this.provider = new AnchorProvider(
            connection,
            new Wallet(funder),
            AnchorProvider.defaultOptions(),
        );

        this.program = new Program(
            SAGE_IDL,
            new PublicKey(SageGameHandler.SAGE_PROGRAM_ID),
            this.provider,
        );
        this.cargoProgram = new Program(
            CARGO_IDL,
            new PublicKey(SageGameHandler.CARGO_PROGRAM_ID),
            this.provider,
        );
        this.playerProfileProgram = new Program(
            PLAYER_PROFILE_IDL,
            new PublicKey(SageGameHandler.PLAYER_PROFILE_PROGRAM_ID),
            this.provider,
        );
        this.profileFactionProgram = new Program(
            PROFILE_FACTION_IDL,
            new PublicKey(SageGameHandler.PROFILE_FACTION_PROGRAM_ID),
            this.provider,
        );

        this.funder = keypairToAsyncSigner(funder);

        this.ready = Promise.all([
            findGame(this.provider),
            findAllPlanets(this.provider),
        ]).then((result) => {
            const [game] = result[0];
            const planets = result[1];

            this.gameId = game.publicKey;
            this.gameState = game.account.gameState;
            this.cargoStatsDefinition = game.account.cargo.statsDefinition;
            this.cargoStatsDefinitionSeqId = 1; // TODO: note this could change if updated by team, would need to look-up new value in Cargo program
            this.craftingDomain = game.account.crafting.domain;
            this.mints = game.account.mints;

            this.planetLookup = planets.reduce((lookup, planetAccount) => {
                const pubkey = planetAccount.publicKey;
                const planet = planetAccount.account;

                if (planet.planetType === PlanetType.AsteroidBelt) {
                    const sector = planet.sector.toString();
                    lookup[sector] = pubkey
                }

                return lookup;
            }, {} as SagePlanetAddresses);

            return Promise.resolve("ready");
        });
    }

    async getPlanetAccount(planetName: string) {
        const program = await sageProgram(this.provider);

        const [planet] = await program.account.planet.all([
           {
                memcmp: {
                    offset: 9,
                    bytes: bs58.encode(Buffer.from(planetName)),
                },
            },
        ]);

        return planet;
    }

    async getPlayerProfileAddress(playerPubkey: PublicKey) {
        const [accountInfo] = await this.connection.getProgramAccounts(
            new PublicKey(SageGameHandler.PLAYER_PROFILE_PROGRAM_ID),
            {
                filters: [
                    {
                        memcmp: {
                            offset: 30,
                            bytes: playerPubkey.toBase58(),
                        },
                    },
                ],
            },
        );

        return accountInfo.pubkey;
    }

    getCargoTypeAddress(mint: PublicKey) {
        if (!this.cargoStatsDefinition || !this.cargoStatsDefinitionSeqId) {
            throw 'this.cargoStatsDefinition not set (or missing SeqId)';
        }

        const [cargoType] = CargoType.findAddress(
            this.cargoProgram,
            this.cargoStatsDefinition,
            mint,
            this.cargoStatsDefinitionSeqId,
        );

        return cargoType;
    }

    getFleetAddress(playerProfile: PublicKey, fleetName: string) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const fleetLabel = stringToByteArray(fleetName, 32);
        const [fleet] = Fleet.findAddress(
            this.program,
            this.gameId,
            playerProfile,
            fleetLabel,
        );

        return fleet;
    }

    getMineItemAddress(mint: PublicKey) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const [mineItem] = MineItem.findAddress(
            this.program,
            this.gameId,
            mint,
        );

        return mineItem;
    }

    async getPlanetAddress(coordinates: [BN, BN]) {
        if (!this.planetLookup) {
            throw 'this.planetLookup not set';
        }

        return this.planetLookup[coordinates.toString()];      
    }

    getResrouceAddress(mineItem: PublicKey, planet: PublicKey) {
        const [resource] = Resource.findAddress(
            this.program,
            mineItem,
            planet,
        );

        return resource;
    }

    getResourceMintAddress(resource: string) {
        return SageGameHandler.SAGE_RESOURCES_MINTS[resource];
    }

    getSectorAddress(coordinates: [BN, BN]) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const [sector] = Sector.findAddress(
            this.program,
            this.gameId,
            coordinates
        );

        return sector;
    }

    getStarbaseAddress(coordinates: [BN, BN]) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const [starbase] = Starbase.findAddress(
            this.program,
            this.gameId,
            coordinates
        );

        return starbase;
    }

    getStarbasePlayerAddress(starbase: PublicKey, sagePlayerProfile: PublicKey, starbaseSeqId: number) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const [starbasePlayer] = StarbasePlayer.findAddress(
            this.program,
            starbase,
            sagePlayerProfile,
            starbaseSeqId,
        );

        return starbasePlayer;
    }

    getSagePlayerProfileAddress(playerProfile: PublicKey) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const [sagePlayerProfile] = SagePlayerProfile.findAddress(
            this.program,
            playerProfile,
            this.gameId,
        );

        return sagePlayerProfile;
    }

    getProfileFactionAddress(playerProfile: PublicKey) {
        const [profileFaction] = ProfileFactionAccount.findAddress(
            this.profileFactionProgram,
            playerProfile,
        );

        return profileFaction;
    }

    async loadPlayerProfileFleets(playerProfile: PublicKey) {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        const program = await sageProgram(this.provider);
        const fleets = await program.account.fleet.all([
            {
                memcmp: {
                    offset: 41,
                    bytes: playerProfile.toBase58(),
                }
            }
        ]);

        return fleets;
    }

    async loadGame() {
        if (!this.gameId) {
            throw 'this.gameId not set';
        }

        this.game = await readFromRPCOrError(
            this.connection,
            this.program,
            this.gameId,
            Game,
            'confirmed',
        );

        return this.game;
    }

    async loadGameState() {
        if (!this.gameState) {
            throw 'this.gameState not set';
        }
        return await readFromRPCOrError(
            this.connection,
            this.program,
            this.gameState,
            GameState,
            'confirmed',
        );
    }

    async getParsedTokenAccountsByOwner(owner: PublicKey): Promise<TokenAccount[]> {
        return await getParsedTokenAccountsByOwner(this.connection, owner);
    }

    async buildAndSignTransaction(instructions: InstructionReturn | InstructionReturn[]) {
        return await buildAndSignTransaction(instructions, this.funder, { connection: this.connection });
    }

    async sendTransaction(tx: TransactionReturn) {
        // TODO: handle errors
        // https://build.staratlas.com/dev-resources/apis-and-data/data-source
        //
        // Convert the error code from Hex to decimal so 0xbc4 becomes 3012.
        // Any error code <6000 is an anchor error and can use anchor.so/errors
        // to see what the error is. Any error code >=6000 is a Sage error and
        // can be found in the IDL
        //
        // const hexString = '0x1782';
        // const decimal = parseInt(hexString, 16)
        // console.log('Error:', decimal);
        return await sendTransaction(tx, this.connection);
    }
}
