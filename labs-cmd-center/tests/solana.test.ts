import { describe, expect, test, beforeAll } from 'bun:test';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { SageGameHandler } from '../src/sageGameHandler';
import { SageProfileHandler } from '../src/sageProfileHandler';
import { SageFleetHandler } from '../src/sageFleetHandler';

let playerPubkey: PublicKey;
let playerProfilePubkey: PublicKey;
let sageGameHandler: SageGameHandler;

beforeAll(async () => {
    const rpc_url = Bun.env.SOLANA_RPC_URL || "http://localhost:8899";

    const connection = new Connection(rpc_url, 'confirmed');
    const walletKeypair = Keypair.generate();

    playerPubkey = new PublicKey(Bun.env.STAR_ATLAS_PLAYER_PROFILE || walletKeypair);

    sageGameHandler = new SageGameHandler(walletKeypair, connection);    
    await sageGameHandler.ready;

    playerProfilePubkey = await sageGameHandler.getPlayerProfileAddress(playerPubkey);
})

describe('SAGE Labs', () => {
    test('GameHandler', async () => {
        let profileFactionPubkey = sageGameHandler.getProfileFactionAddress(playerProfilePubkey);
        // console.log("profileFaction", profileFactionPubkey.toBase58());
        expect(profileFactionPubkey.toBase58()).toBeTypeOf('string');

        let fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, "MINING#1");
        console.log("fleet", fleetPubkey.toBase58());

        let _ = await sageGameHandler.loadGame();
        expect(sageGameHandler.gameId).toBe(sageGameHandler.game?.key as PublicKey);
    })

    test('ProfileHandler', async () => {
        const sageProfileHandler = new SageProfileHandler(sageGameHandler);
        const playerProfile = await sageProfileHandler.getPlayerProfile(playerProfilePubkey);

        expect(playerProfile.key).toBe(playerProfilePubkey);
    })

    test('FleetHandler', async () => {
        await sageGameHandler.loadGame();

        const fleetPubkey = sageGameHandler.getFleetAddress(playerProfilePubkey, "MINING#1");
        const sageFleetHandler = new SageFleetHandler(sageGameHandler);
        const fleetAccount = await sageFleetHandler.getFleetAccount(fleetPubkey);

        // console.log("fleet - key", fleetAccount.key.toBase58());
        // console.log("fleet - data", fleetAccount.data);
        // console.log("fleet - state", fleetAccount.state);
        expect(fleetAccount.key).toBe(fleetPubkey);
    })
})