import { describe, expect, test, beforeAll } from 'bun:test';
import { BN } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import { byteArrayToString } from '@staratlas/data-source';
import { Fleet } from '@staratlas/sage';

import { SageGameHandler } from '../src/sageGameHandler';
import { SageFleetHandler } from '../src/sageFleetHandler';

let playerPubkey: PublicKey;
let playerProfilePubkey: PublicKey;
let sageGameHandler: SageGameHandler;

// Warning: This function will send transactions to the Solana network (if ENABLED_TX = true)
const sendSageGameTx = async (gameHander: SageGameHandler, tx: any) => {
    const ENABLED_TX = false;

    console.log('--- [tx (build): start] ---')
    console.log(tx);
    console.log('--- [tx (build): end] ---')

    if (ENABLED_TX) {
        console.log('--- [rx (send): start] ---')
        let rx = await sageGameHandler.sendTransaction(tx);
        console.log(rx);
        expect(rx.value.isOk()).toBe(true);
        console.log('--- [rx (send): start] ---');
    }

    // const hexString = '0x17b4';
    // const decimal = parseInt(hexString, 16);
    // console.log('Error:', decimal);
}

beforeAll(async () => {
    const rpc_url = Bun.env.SOLANA_RPC_URL || 'http://localhost:8899';

    const connection = new Connection(rpc_url, 'confirmed');

    const secretKey = Bun.env.SOLANA_WALLET_SECRET_KEY;
    if (!secretKey) {
        throw new Error('SOLANA_WALLET_SECRET_KEY environent variable is not set');
    }

    const secretKeyBytes = bs58.decode(secretKey);
    const walletKeypair = Keypair.fromSecretKey(secretKeyBytes);

    playerPubkey = new PublicKey(Bun.env.STAR_ATLAS_PLAYER_PROFILE || walletKeypair);

    sageGameHandler = new SageGameHandler(walletKeypair, connection);

    if (!PublicKey.isOnCurve(sageGameHandler.funder.publicKey().toBytes())) {
        throw 'Funder public key is not on curve';
    }

    await sageGameHandler.ready;
    playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
    await sageGameHandler.loadGame();
})

describe('SAGE Labs (tx)', () => {
    let fleetAccount: Fleet;
    let fleetPubkey: PublicKey;
    let sageFleetHandler: SageFleetHandler;

    beforeAll(async () => {
        sageFleetHandler = new SageFleetHandler(sageGameHandler);
    });

    describe.skip('Fleet Handler - Docking Actions', () => {
        beforeAll(async () => {
            const cargoFleetName = 'CARGO#1';
            fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, cargoFleetName);
            fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
        });

        // TODO: dock/undock `fleetCRUD.test.tx` - 'undock then dock fleet'

        // error: failed to send transaction: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1770
        test.skip('Dock to Starbase', async () => {
            if (fleetAccount.state.Idle) {
                let ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey);
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });

        test.skip('Undock from Starbase', async () => {
            if (fleetAccount.state.StarbaseLoadingBay) {
                let ix = await sageFleetHandler.ixUndockFromStarbase(fleetPubkey);
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });
    })

    describe.skip('Fleet Handler - Mining Actions', () => {
        beforeAll(async () => {
            const miningFleetName = 'MINING#1';
            fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, miningFleetName);
            fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
            // console.log(fleetAccount);
        });

        test.skip('Start Mining', async () => {
            if (fleetAccount.state.Idle) {
                let ix = await sageFleetHandler.ixStartMining(fleetPubkey, 'hydrogen');
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });

        test.skip('Stop Mining', async () => {
            if (fleetAccount.state.MineAsteroid) {
                let ix = await sageFleetHandler.ixStopMining(fleetPubkey);
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });
    });

    describe.skip('Fleet Handler - Cargo Actions', () => {
        beforeAll(async () => {
            const cargoFleetName = 'CARGO#1';
            fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, cargoFleetName);
            fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
        });

        test.skip('Depost Cargo to Fleet', async () => {
            if (fleetAccount.state.StarbaseLoadingBay) {
                const mintToken = sageGameHandler.mints?.food as PublicKey;
                const cargoPodToKey = fleetAccount.data.cargoHold;

                let ix = await sageFleetHandler.ixDepositCargoToFleet(fleetPubkey, cargoPodToKey, mintToken, new BN(100));
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });

        test.skip('Withdraw Cargo from Fleet', async () => {
            if (fleetAccount.state.StarbaseLoadingBay) {
                // note if amount is greater than the amount in the fleet's cargo,
                // the balance of the token account's amount will be used instead
                const mintToken = sageGameHandler.getResourceMintAddress('hydrogen');
                let ix = await sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, mintToken, new BN(9_999_999));
                let tx = await sageGameHandler.buildAndSignTransaction(ix);
                await sendSageGameTx(sageGameHandler, tx);
            }
        });
    });

    describe.skip('Fleet Handler - Movement/Warp Actions', () => {
        beforeAll(async () => {
            const cargoFleetName = 'MOVE#1';
            fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, cargoFleetName);
            fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
        });

        test.skip('Warp to Coordinate', async () => {
            const sector = fleetAccount.state.Idle?.sector as [BN, BN];
            const coordinates: [BN, BN] = [sector[0].add(new BN(1)), sector[1].add(new BN(1))];

            expect(`X: ${sector[0]} | Y: ${sector[1]}`).toBe(`X: 40 | Y: 30`);
            expect(`X: ${coordinates[0]} | Y: ${coordinates[1]}`).toBe(`X: 41 | Y: 31`);

            let ix = await sageFleetHandler.ixWarpToCoordinate(fleetPubkey, coordinates);
            let tx = await sageGameHandler.buildAndSignTransaction(ix);
            await sendSageGameTx(sageGameHandler, tx);
        });
    })
})
