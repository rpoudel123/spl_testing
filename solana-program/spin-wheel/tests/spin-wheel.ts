import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    getMint
} from "@solana/spl-token";
import { assert } from "chai";
import { TestState } from "./state";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

describe('spin-wheel token tests with PDA mint authority', () => {
    let testState: TestState;

    before(async () => {
        testState = new TestState({ useGloballySharedMint: true });
    });

    const confirmTx = async (txSignature: string) => {
        if (!testState || !testState.connection) {
            console.error("confirmTx called when testState.connection is not available.");
            const blockhash = await testState.connection.getLatestBlockhash();
            await testState.connection.confirmTransaction({
                signature: txSignature,
                blockhash: blockhash.blockhash,
                lastValidBlockHeight: blockhash.lastValidBlockHeight
            }, "confirmed");
            console.log(`Transaction ${txSignature} (using fallback connection) confirmed.`);
            return;
        }
        const blockhash = await testState.connection.getLatestBlockhash();
        await testState.connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, "confirmed");
        console.log(`Transaction ${txSignature} confirmed.`);
    };

    it("Create Mint with Transfer Fee and PDA Mint Authority", async () => {
        const transferFeeBasisPoints = 100; // 1%
        const maximumFee = new BN(1_000_000);

        console.log(`Test: Mint Account Keypair Pubkey: ${testState.mintKeypair.publicKey.toBase58()}`);
        console.log(`Test: Payer Pubkey: ${testState.wallet.publicKey.toBase58()}`);
        console.log(`Test: Client-derived Mint Authority PDA: ${testState.mintAuthorityPda.toBase58()}`);

        const transactionSignature = await testState.program.methods
            .initializeToken2022(transferFeeBasisPoints, maximumFee)
            .accounts({
                payer: testState.wallet.publicKey,
                mintAccount: testState.mintKeypair.publicKey,
                mintAuthorityPda: testState.mintAuthorityPda,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([testState.mintKeypair])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log("Transaction for initializeToken2022 confirmed.");

        const mintInfo = await getMint(
            testState.connection,
            testState.mintKeypair.publicKey,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );

        assert.isTrue(mintInfo.mintAuthority?.equals(testState.mintAuthorityPda), "Mint authority should be the PDA");
        assert.isTrue(mintInfo.freezeAuthority?.equals(testState.mintAuthorityPda), "Freeze authority should be the PDA");
        assert.strictEqual(mintInfo.decimals, 2, "Decimals should be 2");

        console.log(`Mint ${testState.mintKeypair.publicKey.toBase58()} created successfully with PDA mint authority.`);

        testState.setTokenTestAtas();
        assert.ok(testState.senderTokenAccountAddress, "Sender ATA should be set");
        assert.ok(testState.recipientTokenAccountAddress, "Recipient ATA should be set");
    });

    it("Mint Tokens to Sender's Account via Program Instruction", async () => {
        const amountToMint = new BN(50000);

        assert.ok(testState.senderTokenAccountAddress, "Sender ATA must be set before minting");

        await getOrCreateAssociatedTokenAccount(
            testState.connection,
            testState.wallet.payer,
            testState.mintKeypair.publicKey,
            testState.wallet.publicKey,
            false,
            undefined,
            undefined,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log(`Ensured sender ATA ${testState.senderTokenAccountAddress!.toBase58()} exists.`);

        const transactionSignature = await testState.program.methods
            .mintTokensToAccount(amountToMint)
            .accounts({
                mintAuthorityPda: testState.mintAuthorityPda,
                mintAccount: testState.mintKeypair.publicKey,
                recipientTokenAccount: testState.senderTokenAccountAddress!,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log(`Minted ${amountToMint.toString()} tokens to ${testState.senderTokenAccountAddress!.toBase58()}`);

        const accountInfo = await getAccount(testState.connection, testState.senderTokenAccountAddress!, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.strictEqual(accountInfo.amount.toString(), amountToMint.toString(), "Sender account balance should match minted amount");
    });

    it("Transfer tokens from sender to recipient", async () => {
        const amountToTransfer = new BN(10000); // 100.00 tokens

        assert.ok(testState.recipientTokenAccountAddress, "Recipient ATA must be set before transfer");
        assert.ok(testState.senderTokenAccountAddress, "Sender ATA must be set before transfer");

        await getOrCreateAssociatedTokenAccount(
            testState.connection,
            testState.wallet.payer,
            testState.mintKeypair.publicKey,
            testState.recipientKeypair.publicKey,
            false, undefined, undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log(`Ensured recipient ATA ${testState.recipientTokenAccountAddress!.toBase58()} exists.`);

        const transactionSignature = await testState.program.methods
            .transfer(amountToTransfer)
            .accounts({
                sender: testState.wallet.publicKey,
                recipient: testState.recipientKeypair.publicKey,
                mintAccount: testState.mintKeypair.publicKey,
                senderTokenAccount: testState.senderTokenAccountAddress!,
                recipientTokenAccount: testState.recipientTokenAccountAddress!,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([testState.wallet.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log(`Transferred ${amountToTransfer.toString()} tokens.`);
    });

    it('Transfer Again, fee might be limited by maximumFee', async () => {
        const amountToTransfer = new BN(20000);

        assert.ok(testState.recipientTokenAccountAddress, "Recipient ATA must be set before transfer");
        assert.ok(testState.senderTokenAccountAddress, "Sender ATA must be set before transfer");

        const transactionSignature = await testState.program.methods
            .transfer(amountToTransfer)
            .accounts({
                sender: testState.wallet.publicKey,
                recipient: testState.recipientKeypair.publicKey,
                mintAccount: testState.mintKeypair.publicKey,
                senderTokenAccount: testState.senderTokenAccountAddress!,
                recipientTokenAccount: testState.recipientTokenAccountAddress!,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([testState.wallet.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log(`Transferred again ${amountToTransfer.toString()} tokens.`);
    });

    it('Harvest Transfer Fees to Mint Account', async () => {
        assert.ok(testState.recipientTokenAccountAddress, "Recipient ATA must be set before harvest");
        assert.ok(testState.senderTokenAccountAddress, "Sender ATA must be set before harvest");

        const transactionSignature = await testState.program.methods
            .harvest()
            .accounts({
                mintAccount: testState.mintKeypair.publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts([
                { pubkey: testState.senderTokenAccountAddress!, isSigner: false, isWritable: true },
                { pubkey: testState.recipientTokenAccountAddress!, isSigner: false, isWritable: true },
            ])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log('Harvested transfer fees.');
    });

    it('Withdraw Transfer Fees from Mint Account to Sender ATA', async () => {
        assert.ok(testState.senderTokenAccountAddress, "Sender ATA must be set before withdraw");

        const transactionSignature = await testState.program.methods
            .withdraw()
            .accounts({
                authority: testState.wallet.publicKey,
                mintAccount: testState.mintKeypair.publicKey,
                tokenAccount: testState.senderTokenAccountAddress!,
                destinationTokenAccount: testState.senderTokenAccountAddress!,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([testState.wallet.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log('Withdrew transfer fees from mint to sender ATA.');
    });

    it('Update Transfer Fee to zero', async () => {
        const newTransferFeeBasisPoints = 0;
        const newMaximumFee = new BN(0);

        const transactionSignature = await testState.program.methods
            .updateFee(newTransferFeeBasisPoints, newMaximumFee)
            .accounts({
                authority: testState.wallet.publicKey,
                mintAccount: testState.mintKeypair.publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([testState.wallet.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log('Updated transfer fee to zero.');
    });
});