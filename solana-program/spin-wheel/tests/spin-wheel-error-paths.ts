import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { SpinWheel } from "../target/types/spin_wheel";
import { TestState, expectError } from "./state";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

// Constants from lib.rs (or a shared constants file if you have one)
const MAX_FEE_BASIS_POINTS_FOR_TOKEN = 500; // Corresponds to MAX_HOUSE_FEE_PERCENTAGE in lib.rs for token transfer fee
const MINT_AUTHORITY_SEED_BYTES = Buffer.from("mint_authority");


describe("Spin Wheel - Error Path Tests", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.SpinWheel as Program<SpinWheel>;
    const testState = new TestState();

    console.log("Test code is trying to use Program ID:", program.programId.toString());

    let mintAuthorityPda: PublicKey;
    let mintAuthorityPdaBump: number;

    before(async () => {
        const payerBalance = await testState.connection.getBalance(testState.wallet.publicKey);
        if (payerBalance < 0.5 * LAMPORTS_PER_SOL) {
            const sig = await testState.connection.requestAirdrop(testState.wallet.publicKey, 1 * LAMPORTS_PER_SOL);
            await testState.confirmTx(sig);
        }

        [mintAuthorityPda, mintAuthorityPdaBump] = PublicKey.findProgramAddressSync(
            [MINT_AUTHORITY_SEED_BYTES],
            program.programId
        );
    });

    describe("initializeToken2022 - Error Paths", () => {
        it("should fail with InvalidHouseFeeConfig if transfer_fee_basis_points > MAX_FEE_BASIS_POINTS_FOR_TOKEN", async () => {
            const invalidFeeBasisPoints = MAX_FEE_BASIS_POINTS_FOR_TOKEN + 1;
            const validMaximumFee = new BN(1000);
            const mintKeypairForTest = Keypair.generate();

            await expectError(
                program.methods
                    .initializeToken2022(invalidFeeBasisPoints, validMaximumFee)
                    .accounts({
                        payer: testState.wallet.publicKey,
                        mintAccount: mintKeypairForTest.publicKey,
                        mintAuthorityPda: mintAuthorityPda,
                        tokenProgram: TOKEN_2022_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([mintKeypairForTest])
                    .rpc(),
                "InvalidHouseFeeConfig",
                6020
            );

            const mintAccountInfo = await testState.connection.getAccountInfo(mintKeypairForTest.publicKey);
            assert.isNull(mintAccountInfo, "Mint account should not have been created on error");
        });

        it("should fail with FeeCalculationFailed if maximum_fee is too low (e.g., 0 when fee > 0) - (Review if applicable at init)", async () => {
            const validFeeBasisPoints = 100;
            const invalidMaximumFee = new BN(0);
            const mintKeypairForTest = Keypair.generate();

            await expectError(
                program.methods
                    .initializeToken2022(validFeeBasisPoints, invalidMaximumFee)
                    .accounts({
                        payer: testState.wallet.publicKey,
                        mintAccount: mintKeypairForTest.publicKey,
                        mintAuthorityPda: mintAuthorityPda,
                        tokenProgram: TOKEN_2022_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([mintKeypairForTest])
                    .rpc(),
                "FeeCalculationFailed",
                6003
            );
            const mintAccountInfo = await testState.connection.getAccountInfo(mintKeypairForTest.publicKey);
            assert.isNull(mintAccountInfo, "Mint account should not have been created on error");
        });

        it("should fail with InvalidMintAuthorityPDA for wrong mintAuthorityPda seed", async () => {
            const wrongSeed = Buffer.from("wrong_mint_authority");
            const [incorrectMintAuthorityPda, _bump] = PublicKey.findProgramAddressSync(
                [wrongSeed],
                program.programId
            );
            const validFeeBasisPoints = 100;
            const validMaximumFee = new BN(1000);
            const mintKeypairForTest = Keypair.generate();

            await expectError(
                program.methods
                    .initializeToken2022(validFeeBasisPoints, validMaximumFee)
                    .accounts({
                        payer: testState.wallet.publicKey,
                        mintAccount: mintKeypairForTest.publicKey,
                        mintAuthorityPda: incorrectMintAuthorityPda,
                        tokenProgram: TOKEN_2022_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([mintKeypairForTest])
                    .rpc(),
                "ConstraintSeeds"
            );
            const mintAccountInfo = await testState.connection.getAccountInfo(mintKeypairForTest.publicKey);
            assert.isNull(mintAccountInfo, "Mint account should not have been created on error");
        });

        it("should fail if the wrong token program ID (e.g. spl-token instead of token-2022) is passed for tokenProgram", async () => {
            const validFeeBasisPoints = 100;
            const validMaximumFee = new BN(1000);
            const mintKeypairForTest = Keypair.generate();

            await expectError(
                program.methods
                    .initializeToken2022(validFeeBasisPoints, validMaximumFee)
                    .accounts({
                        payer: testState.wallet.publicKey,
                        mintAccount: mintKeypairForTest.publicKey,
                        mintAuthorityPda: mintAuthorityPda,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([mintKeypairForTest])
                    .rpc(),
                "InvalidProgramId"
            );

            const mintAccountInfo = await testState.connection.getAccountInfo(mintKeypairForTest.publicKey);
            assert.isNull(mintAccountInfo, "Mint account should not have been created on error");
        });

        it("should fail with InvalidTokenProgram if a non-program account is passed as tokenProgram", async () => {
            const validFeeBasisPoints = 100;
            const validMaximumFee = new BN(1000);
            const mintKeypairForTest = Keypair.generate();
            const nonProgramAccount = Keypair.generate().publicKey;

            await expectError(
                program.methods
                    .initializeToken2022(validFeeBasisPoints, validMaximumFee)
                    .accounts({
                        payer: testState.wallet.publicKey,
                        mintAccount: mintKeypairForTest.publicKey,
                        mintAuthorityPda: mintAuthorityPda,
                        tokenProgram: nonProgramAccount,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([mintKeypairForTest])
                    .rpc(),
                "InvalidProgramId"
            );
            const mintAccountInfo = await testState.connection.getAccountInfo(mintKeypairForTest.publicKey);
            assert.isNull(mintAccountInfo, "Mint account should not have been created on error");
        });

    });

    // ... other describe blocks ...
}); 