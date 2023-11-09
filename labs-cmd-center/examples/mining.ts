import { BN } from '@project-serum/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import { SageGameHandler } from '../src/sageGameHandler';
import { SageFleetHandler } from '../src/sageFleetHandler';

const FLEETNAME = 'MINING#1';
const RESOURCE = 'hydrogen';
const MINING_MINUTES = 1;

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

const run = async () => {
    console.log(`<!-- Start Mining (${RESOURCE}) with ${FLEETNAME} -->`);

    // Setup wallet and SAGE game handler
    const { connection, walletKeypair } = await setupWallet();
    const { sageGameHandler, playerPubkey } = await setupSageGameHandlerReadyAndLoadGame(walletKeypair, connection);

    // Setup fleet handler
    const sageFleetHandler = new SageFleetHandler(sageGameHandler);

    // Get the player profile and fleet addresses (public keys)
    const playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
    const fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, FLEETNAME);
    console.log(`Fleet address: ${fleetPubkey.toBase58()}`);

    // Get the fleet account
    let fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);

    // Check that the fleet is idle, abort if not
    if (!fleetAccount.state.Idle) {
        throw 'fleet is expected to be idle before mining';
    }

    // Instruct the fleet to start mining
    let ix = await sageFleetHandler.ixStartMining(fleetPubkey, RESOURCE);
    let tx = await sageGameHandler.buildAndSignTransaction(ix);
    let rx = await sageGameHandler.sendTransaction(tx);

    // Check that the transaction was a success, if not abort
    if (!rx.value.isOk()) {
        throw 'fleet failed to start mining';
    }

    // Refresh the fleet account
    fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);
    console.log(`Fleet state: ${JSON.stringify(fleetAccount.state)}`);

    // Wait for n minutes
    console.log(`Waiting for ${MINING_MINUTES} minutes...`);
    await new Promise(resolve => setTimeout(resolve, MINING_MINUTES * 60 * 1000));

    // Instruct the fleet to stop mining
    console.log('Prepare to stopping mining...');
    ix = await sageFleetHandler.ixStopMining(fleetPubkey);
    tx = await sageGameHandler.buildAndSignTransaction(ix);
    rx = await sageGameHandler.sendTransaction(tx);

    // Check that the transaction was a success, if not abort
    if (!rx.value.isOk()) {
        throw 'fleet failed to stop mining';
    }

    // Instruct the fleet to dock to the starbase
    console.log('Prepare to dock to starbase...');
    ix = await sageFleetHandler.ixDockToStarbase(fleetPubkey);
    tx = await sageGameHandler.buildAndSignTransaction(ix);
    rx = await sageGameHandler.sendTransaction(tx);

    // Check that the transaction was a success, if not abort
    if (!rx.value.isOk()) {
        throw 'fleet failed to dock to starbase';
    }

    // Instruct the fleet to deposit the mined resources (note, use very large amount to depsit all)
    console.log('Prepare to deposit mined resources...');
    const resourceToken = sageGameHandler.getResourceMintAddress(RESOURCE);
    ix = await sageFleetHandler.ixWithdrawCargoFromFleet(fleetPubkey, resourceToken, new BN(9_999_999));
    tx = await sageGameHandler.buildAndSignTransaction(ix);
    rx = await sageGameHandler.sendTransaction(tx);

    // Check that the transaction was a success, if not abort
    if (!rx.value.isOk()) {
        throw 'fleet failed to deposit mined resources';
    }

    console.log(`<!-- Stop Mining (${RESOURCE}) with ${FLEETNAME} -->`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});