import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync
} from "@solana/spl-token";
import type { SpinWheel } from "../target/types/spin_wheel";

export interface TestStateOptions {
    useGloballySharedMint?: boolean;
    externalMintKeypair?: anchor.web3.Keypair;
}

export class TestState {
    provider: anchor.AnchorProvider;
    connection: anchor.web3.Connection;
    wallet: anchor.Wallet;
    program: Program<SpinWheel>;

    mintKeypair: anchor.web3.Keypair;

    recipientKeypair: anchor.web3.Keypair;
    houseWalletKeypair: anchor.web3.Keypair;
    player2Keypair: anchor.web3.Keypair;

    mintAuthorityPda: anchor.web3.PublicKey;
    gameStatePda: anchor.web3.PublicKey;

    senderTokenAccountAddress?: anchor.web3.PublicKey;
    recipientTokenAccountAddress?: anchor.web3.PublicKey;
    roundCashinoRewardsPotAta?: anchor.web3.PublicKey;

    currentRoundIdForSeed?: anchor.BN;
    roundStatePda?: anchor.web3.PublicKey;
    gamePotSolPda?: anchor.web3.PublicKey;
    roundCashinoRewardsPotAccountPda?: anchor.web3.PublicKey;
    userPlatformEscrowPda?: anchor.web3.PublicKey;
    player2PlatformEscrowPda?: anchor.web3.PublicKey;

    readonly CASHINO_REWARD_PER_ROUND_UNITS = new BN(1_000_000);
    readonly WITHDRAWAL_FEE_LAMPORTS = new BN(10_000_000);
    readonly RAW_SEED = "test_seed_commitment_for_round_1";
    readonly SEED_LEN = 32;
    seedCommitmentBuffer: Buffer;

    private static _globallySharedMintKeypair: anchor.web3.Keypair | undefined;

    constructor(options: TestStateOptions = {}) {
        this.provider = anchor.AnchorProvider.env();
        anchor.setProvider(this.provider);
        this.connection = this.provider.connection;
        this.wallet = this.provider.wallet as anchor.Wallet;
        this.program = anchor.workspace.SpinWheel as Program<SpinWheel>;

        if (options.externalMintKeypair) {
            this.mintKeypair = options.externalMintKeypair;
            console.log(`TestState: Using externally provided mintKeypair: ${this.mintKeypair.publicKey.toBase58()}`);
        } else if (options.useGloballySharedMint) {
            if (!TestState._globallySharedMintKeypair) {
                TestState._globallySharedMintKeypair = anchor.web3.Keypair.generate();
                console.log(`TestState: Generated and stored globally shared mintKeypair: ${TestState._globallySharedMintKeypair.publicKey.toBase58()}`);
            } else {
                console.log(`TestState: Reusing globally shared mintKeypair: ${TestState._globallySharedMintKeypair.publicKey.toBase58()}`);
            }
            this.mintKeypair = TestState._globallySharedMintKeypair;
        } else {
            this.mintKeypair = anchor.web3.Keypair.generate();
            console.log(`TestState: Generated local mintKeypair: ${this.mintKeypair.publicKey.toBase58()}`);
        }

        this.recipientKeypair = anchor.web3.Keypair.generate();
        this.houseWalletKeypair = anchor.web3.Keypair.generate();
        this.player2Keypair = anchor.web3.Keypair.generate();

        [this.mintAuthorityPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("mint_authority")],
            this.program.programId
        );
        [this.gameStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("game_state")],
            this.program.programId
        );

        [this.userPlatformEscrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("user_escrow"), this.wallet.publicKey.toBuffer()],
            this.program.programId
        );
        [this.player2PlatformEscrowPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("user_escrow"), this.player2Keypair.publicKey.toBuffer()],
            this.program.programId
        );

        this.seedCommitmentBuffer = Buffer.alloc(this.SEED_LEN);
        this.seedCommitmentBuffer.write(this.RAW_SEED, "ascii");
    }

    async confirmTx(txSignature: string): Promise<void> {
        const blockhash = await this.connection.getLatestBlockhash();
        await this.connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, "confirmed");
        console.log(`Transaction ${txSignature} confirmed.`);
    }

    get cashinoMintPublicKey(): anchor.web3.PublicKey {
        return this.mintKeypair.publicKey;
    }

    deriveRoundPdAs(): void {
        if (!this.currentRoundIdForSeed) {
            throw new Error("currentRoundIdForSeed is not set. Cannot derive round PDAs.");
        }

        [this.roundStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("round_state"), this.currentRoundIdForSeed.toBuffer("le", 8)],
            this.program.programId
        );

        [this.gamePotSolPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("sol_pot"), this.currentRoundIdForSeed.toBuffer("le", 8)],
            this.program.programId
        );

        [this.roundCashinoRewardsPotAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("cashino_round_pot"), this.currentRoundIdForSeed.toBuffer("le", 8)],
            this.program.programId
        );

        if (this.roundCashinoRewardsPotAccountPda && this.cashinoMintPublicKey) {
            this.roundCashinoRewardsPotAta = getAssociatedTokenAddressSync(
                this.cashinoMintPublicKey,
                this.roundCashinoRewardsPotAccountPda,
                true,
                TOKEN_2022_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );
            console.log(`Client derived roundCashinoRewardsPotAta for round ${this.currentRoundIdForSeed.toString()}: ${this.roundCashinoRewardsPotAta.toBase58()}`);
        } else {
            if (!this.roundCashinoRewardsPotAccountPda) {
                console.warn("deriveRoundPdAs: roundCashinoRewardsPotAccountPda is not set, cannot derive its ATA.");
            }
            if (!this.cashinoMintPublicKey) {
                console.warn("deriveRoundPdAs: cashinoMintPublicKey is not set, cannot derive roundCashinoRewardsPotAta.");
            }
        }
    }

    setTokenTestAtas(): void {
        if (!this.wallet || !this.recipientKeypair) {
            throw new Error("Required keypairs or wallet not initialized for setting token ATAs.");
        }
        this.senderTokenAccountAddress = getAssociatedTokenAddressSync(
            this.mintKeypair.publicKey,
            this.wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        this.recipientTokenAccountAddress = getAssociatedTokenAddressSync(
            this.mintKeypair.publicKey,
            this.recipientKeypair.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
    }
}