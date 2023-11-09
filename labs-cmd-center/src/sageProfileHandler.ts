import { PublicKey } from '@solana/web3.js';
import { readFromRPCOrError } from '@staratlas/data-source';
import { PlayerProfile } from '@staratlas/player-profile';

import { SageGameHandler } from './sageGameHandler';

export class SageProfileHandler {
    constructor(
        private _gameHandler: SageGameHandler,
    ) {}

    async getPlayerProfile(playerProfilePubkey: PublicKey): Promise<PlayerProfile> {
        const playerProfile = readFromRPCOrError(
            this._gameHandler.provider.connection,
            this._gameHandler.playerProfileProgram,
            playerProfilePubkey,
            PlayerProfile,
            'confirmed',
        );

        return playerProfile;
    }
}