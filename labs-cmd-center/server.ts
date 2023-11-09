import { BN } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import { InstructionReturn } from '@staratlas/data-source';

import { SageGameHandler } from './src/sageGameHandler';
import { SageFleetHandler } from './src/sageFleetHandler';

const setupWallet = async () => {
    const rpc_url = Bun.env.SOLANA_RPC_URL || 'http://localhost:8899';
    const connection = new Connection(rpc_url, 'confirmed');
    const secretKey = Bun.env.SOLANA_WALLET_SECRET_KEY;

    if (!secretKey) {
        throw new Error('SOLANA_WALLET_SECRET_KEY environent variable is not set');
    }

    const walletKeypair = Keypair.fromSecretKey(bs58.decode(secretKey));

    if (!PublicKey.isOnCurve(walletKeypair.publicKey.toBytes())) {
        throw 'wallet keypair is not on curve';
    }

    return { connection, walletKeypair };
};


const setupSageGameHandlerReadyAndLoadGame = async (walletKeypair: Keypair, connection: Connection) => {
    const sageGameHandler = new SageGameHandler(walletKeypair, connection);
    await sageGameHandler.ready;
    await sageGameHandler.loadGame();

    const playerPubkey = new PublicKey(Bun.env.STAR_ATLAS_PLAYER_PROFILE || walletKeypair);

    return { sageGameHandler, playerPubkey };
}

const { connection, walletKeypair } = await setupWallet();
const { sageGameHandler, playerPubkey } = await setupSageGameHandlerReadyAndLoadGame(walletKeypair, connection);
const sageFleetHandler = new SageFleetHandler(sageGameHandler);
const playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);

interface FleetMiningOpsStart {
    pubkey: string;
    resource: string;
    resourceToken: string;
};

const handlerFleetMiningOpsStart = async (cmds: FleetMiningOpsStart[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);
        // const resourceToken = new PublicKey(cmd.resourceToken);

        const ix = await sageFleetHandler.ixStartMining(fleetPubkey, cmd.resource);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface FleetMiningOpsStop {
    pubkey: string;
};

const handlerFleetMiningOpsStop = async (cmds: FleetMiningOpsStop[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        const ix = await sageFleetHandler.ixStopMining(fleetPubkey);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface FleetMovementWarp {
    pubkey: string;
    x: number;
    y: number;
};

const handlerFleetMovementWarp = async (cmds: FleetMovementWarp[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);
        const coordinates = [new BN(cmd.x), new BN(cmd.y)];

        const ix = await sageFleetHandler.ixWarpToCoordinate(fleetPubkey, coordinates as [BN, BN]);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface FleetMovementExitWarp {
    pubkey: string;
};

const handlerFleetMovementExitWarp = async (cmds: FleetMovementExitWarp[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        const ix = await sageFleetHandler.ixReadyToExitWarp(fleetPubkey);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface StarbaseDockFleet {
    pubkey: string;
};

const handlerStarbaseDockFleet = async (cmds: StarbaseDockFleet[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        const ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface StarbaseUndockFleet {
    pubkey: string;
};

const handlerStarbaseUndockFleet = async (cmds: StarbaseUndockFleet[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        const ix = await sageFleetHandler.ixUndockFromStarbase(fleetPubkey);
        ixs.push(ix);
    }

    return ixs.flat();
}

interface StarbaseHangarSupplyCargo {
    pubkey: string;
    cargo: {
        cargoPod: string,
        tokenMint: String,
        amount: Number,
    }[];
};

const handlerStarbaseHangarSupplyCargo = async (cmds: StarbaseHangarSupplyCargo[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        for (let j = 0; j < cmd.cargo.length; j++) {
            const cargo = cmd.cargo[j];
            const cargoPodToKey = new PublicKey(cargo.cargoPod);
            const tokenMint = new PublicKey(cargo.tokenMint);
            const amount = new BN(cargo.amount);

            const ix = await sageFleetHandler.ixDepositCargoToFleet(fleetPubkey, cargoPodToKey, tokenMint, amount);
            ixs.push(ix);
        }
    }

    return ixs.flat();
}

interface StarbaseHangarUnloadCargo {
    pubkey: string;
    cargo: {
        tokenMint: String,
        amount: Number,
    }[];
};

const handlerStarbaseHangarUnloadCargo = async (cmds: StarbaseHangarUnloadCargo[]) => {
    const ixs = [];

    for (let i = 0; i < cmds.length; i++) {
        const cmd = cmds[i];
        const fleetPubkey = new PublicKey(cmd.pubkey);

        for (let j = 0; j < cmd.cargo.length; j++) {
            const cargo = cmd.cargo[j];
            const tokenMint = new PublicKey(cargo.tokenMint);
            const amount = new BN(cargo.amount);

            const ix = await sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, tokenMint, amount);
            ixs.push(ix);
        }
    }

    return ixs.flat();
}

const server = Bun.serve({
    port: Bun.env.PORT || 8080,
    fetch(req) {
        const url = new URL(req.url);
        const path = url.pathname;
        const params = url.searchParams;
        let json;

        // console.log(`Path: ${path}`);
        // console.log(`Params: ${params.toString()}`);

        switch (true) {
            case path === '/heartbeat':
                json = JSON.stringify({ status: 'Ok', playerPubkey });
                return new Response(json);
            case path === '/fleet':
                let fleetName = params.get('name');

                if (fleetName) {
                    fleetName = decodeURIComponent(fleetName);
                    const getFleetAccountByFleetName = async (fleetName: string) => {
                        const fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, fleetName);
                        const account = await sageFleetHandler.getFleetAccount(fleetPubkey);

                        const json = JSON.stringify(account);
                        return new Response(json);
                    };

                    return getFleetAccountByFleetName(fleetName);
                } else {
                    const getPlayerProfileFleets = async () => {
                        const fleets = await sageGameHandler.loadPlayerProfileFleets(playerProfilePubkey);
                        json = JSON.stringify(fleets);
                        return new Response(json);
                    };

                    return getPlayerProfileFleets();
                }
            case path === '/game-mints':
                const gameMints = sageGameHandler.mints

                json = JSON.stringify(gameMints);
                return new Response(json);
            case path === '/resource-mints':
                const resourceMints = SageGameHandler.SAGE_RESOURCES_MINTS;

                json = JSON.stringify(resourceMints);
                return new Response(json);
            case path === '/cmd':
                if (req.method === 'POST') {
                    const parseSageCmd = async () => {
                        let ixs: InstructionReturn[] = [];
                        const jsonCmd = await req.json();

                        switch (true) {
                            case jsonCmd.FleetMiningOpsStart !== undefined:
                                ixs = await handlerFleetMiningOpsStart(jsonCmd.FleetMiningOpsStart);
                                break;
                            case jsonCmd.FleetMiningOpsStop !== undefined:
                                ixs = await handlerFleetMiningOpsStop(jsonCmd.FleetMiningOpsStop);
                                break;
                            case jsonCmd.FleetMovementWarp !== undefined:
                                ixs = await handlerFleetMovementWarp(jsonCmd.FleetMovementWarp);
                                break;
                            case jsonCmd.FleetMovementExitWarp !== undefined:
                                ixs = await handlerFleetMovementExitWarp(jsonCmd.FleetMovementExitWarp);
                                break;
                            case jsonCmd.StarbaseDockFleet !== undefined:
                                ixs = await handlerStarbaseDockFleet(jsonCmd.StarbaseDockFleet);
                                break;
                            case jsonCmd.StarbaseUndockFleet !== undefined:
                                ixs = await handlerStarbaseUndockFleet(jsonCmd.StarbaseUndockFleet);
                                break;
                            case jsonCmd.StarbaseHangarSupplyCargo !== undefined:
                                ixs = await handlerStarbaseHangarSupplyCargo(jsonCmd.StarbaseHangarSupplyCargo);
                                break;
                            case jsonCmd.StarbaseHangarUnloadCargo !== undefined:
                                ixs = await handlerStarbaseHangarUnloadCargo(jsonCmd.StarbaseHangarUnloadCargo);
                                break;
                            default:
                                return new Response(null, { status: 406 });
                        }

                        if (ixs.length) {
                            let tx = await sageGameHandler.buildAndSignTransaction(ixs);
                            let rx = await sageGameHandler.sendTransaction(tx);

                            if (rx.value.isOk()) {
                                return new Response(null, { status: 200 });
                            }
                        }

                        return new Response(null, { status: 202 });
                    }

                    return parseSageCmd();
                } else {
                    return new Response(null, { status: 405 });
                }
            default:
                return new Response(null, { status: 404 });
        }
    }
});

console.log("  _         _           _          _    _            _   ");
console.log(" | |   __ _| |__ ___   /_\\   _____(_)__| |_ __ _ _ _| |  ");
console.log(" | |__/ _` | '_ (_-<  / _ \\ (_-<_-< (_-<  _/ _` | ' \\  _|");
console.log(" |____\\__,_|_.__/__/ /_/ \\_\\/__/__/_/__/\\__\\__,_|_||_\\__|");
console.log("  / __|___ _ __  _ __  __ _ _ _  __| |___ _ _            ");
console.log(" | (__/ _ \\ '  \\| '  \\/ _` | ' \\/ _` / -_) '_|           ");
console.log("  \\___\\___/_|_|_|_|_|_\\__,_|_||_\\__,_\\___|_|             ");

console.log('\nA Local HTTP Service to issue Sage Labs Commands!\n');

console.log('------------------------------------------------------------');
console.log('--> Donate! 2yodqKtkdNJXxJv21s5YMVG8bjscaezLVFRfnWra5D77 <--');
console.log('------------------------------------------------------------');

console.log(`\nPlayer Pubkey: ${playerPubkey.toBase58()}`);
console.log(`Listening on port ${server.port}...\n`);
