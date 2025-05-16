import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import crypto from "crypto";
import {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    getMint
} from "@solana/spl-token";
import type { SpinWheel } from "../target/types/spin_wheel";
import { assert } from "chai";
import { describe } from "node:test";

const mintKeypair = new anchor.web3.Keypair();

const provider = anchor.AnchorProvider.env();
const connection = provider.connection;
const wallet = provider.wallet as anchor.Wallet;
anchor.setProvider(provider);

const program = anchor.workspace.SpinWheel as Program<SpinWheel>;

const recipientKeypair = new anchor.web3.Keypair(); // For user-to-user transfer tests

// PDA for mint authority
const [mintAuthorityPda, mintAuthorityPdaBump] =
    anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint_authority")],
        program.programId
    );

describe('spin-wheel token tests with PDA mint authority', () => {

    let senderTokenAccountAddress: anchor.web3.PublicKey; // Wallet's ATA for the new mint
    let recipientTokenAccountAddress: anchor.web3.PublicKey; // RecipientKeypair's ATA for the new mint

    const confirmTx = async (txSignature: string) => {
        const blockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, "confirmed");
        console.log(`Transaction ${txSignature} confirmed.`);
    };

    it("Create Mint with Transfer Fee and PDA Mint Authority", async () => {
        const transferFeeBasisPoints = 100; // 1%
        const maximumFee = new BN(1_000_000);

        console.log(`Test: Mint Account Keypair Pubkey: ${mintKeypair.publicKey.toBase58()}`);
        console.log(`Test: Payer Pubkey: ${wallet.publicKey.toBase58()}`);
        console.log(`Test: Client-derived Mint Authority PDA: ${mintAuthorityPda.toBase58()}`);

        const transactionSignature = await program.methods
            .initializeToken2022(transferFeeBasisPoints, maximumFee)
            .accounts({
                payer: wallet.publicKey,
                mintAccount: mintKeypair.publicKey, // The account to be initialized as a mint
                mintAuthorityPda: mintAuthorityPda, // The PDA that WILL BE the authority
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([mintKeypair]) // mintKeypair signs because it's the mintAccount being created
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log("Transaction for initializeToken2022 confirmed.");

        // Assertions to verify the mint was created correctly
        const mintInfo = await getMint(
            connection,
            mintKeypair.publicKey, // Address of the mint account
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );

        assert.isTrue(mintInfo.mintAuthority?.equals(mintAuthorityPda), "Mint authority should be the PDA");
        assert.isTrue(mintInfo.freezeAuthority?.equals(mintAuthorityPda), "Freeze authority should be the PDA");
        assert.strictEqual(mintInfo.decimals, 2, "Decimals should be 2");

        console.log(`Mint ${mintKeypair.publicKey.toBase58()} created successfully with PDA mint authority.`);

        // Get ATAs after mint is created and verified
        senderTokenAccountAddress = getAssociatedTokenAddressSync(
            mintKeypair.publicKey,
            wallet.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        recipientTokenAccountAddress = getAssociatedTokenAddressSync(
            mintKeypair.publicKey,
            recipientKeypair.publicKey,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
    });

    it("Mint Tokens to Sender's Account via Program Instruction", async () => {
        const amountToMint = new BN(50000); // Example: 500.00 tokens , 2 decimals

        await getOrCreateAssociatedTokenAccount(
            connection,
            wallet.payer, // Payer for ATA creation if needed
            mintKeypair.publicKey,
            wallet.publicKey, // Owner of the ATA
            false, // Allow owner off curve
            undefined,
            undefined,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log(`Ensured sender ATA ${senderTokenAccountAddress.toBase58()} exists.`);

        const transactionSignature = await program.methods
            .mintTokensToAccount(amountToMint)
            .accounts({
                mintAuthorityPda: mintAuthorityPda,
                mintAccount: mintKeypair.publicKey,
                recipientTokenAccount: senderTokenAccountAddress, // Minting to the wallet's ATA
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            // No explicit .signers() needed for the PDA, Anchor handles CPI signing
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log(`Minted ${amountToMint.toString()} tokens to ${senderTokenAccountAddress.toBase58()}`);

        const accountInfo = await getAccount(connection, senderTokenAccountAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.strictEqual(accountInfo.amount.toString(), amountToMint.toString(), "Sender account balance should match minted amount");
    });

    it("Transfer tokens from sender to recipient", async () => {
        const amountToTransfer = new BN(10000); // 100.00 tokens

        await getOrCreateAssociatedTokenAccount(
            connection,
            wallet.payer, // Payer for ATA creation
            mintKeypair.publicKey,
            recipientKeypair.publicKey, // Owner of the ATA
            false, undefined, undefined, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log(`Ensured recipient ATA ${recipientTokenAccountAddress.toBase58()} exists.`);

        const transactionSignature = await program.methods
            .transfer(amountToTransfer)
            .accounts({
                sender: wallet.publicKey,
                recipient: recipientKeypair.publicKey, // The actual recipient's main system account
                mintAccount: mintKeypair.publicKey,

                senderTokenAccount: senderTokenAccountAddress,
                recipientTokenAccount: recipientTokenAccountAddress,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId, // Needed for init_if_needed in transfer.rs
            })
            .signers([wallet.payer]) // Signed by the sender wallet
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log(`Transferred ${amountToTransfer.toString()} tokens.`);
    });

    it('Transfer Again, fee might be limited by maximumFee', async () => {
        const amountToTransfer = new BN(20000); // 200.00 tokens

        const transactionSignature = await program.methods
            .transfer(amountToTransfer)
            .accounts({
                sender: wallet.publicKey,
                recipient: recipientKeypair.publicKey,
                mintAccount: mintKeypair.publicKey,

                senderTokenAccount: senderTokenAccountAddress,
                recipientTokenAccount: recipientTokenAccountAddress,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([wallet.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log(`Transferred again ${amountToTransfer.toString()} tokens.`);
    });

    it('Harvest Transfer Fees to Mint Account', async () => {
        // Harvests fees from specified token accounts back to the mint
        const transactionSignature = await program.methods
            .harvest()
            .accounts({
                mintAccount: mintKeypair.publicKey,

                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts([ // Accounts to harvest from
                { pubkey: senderTokenAccountAddress, isSigner: false, isWritable: true },
                { pubkey: recipientTokenAccountAddress, isSigner: false, isWritable: true },
            ])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log('Harvested transfer fees.');
    });

    it('Withdraw Transfer Fees from Mint Account to Sender ATA', async () => {
        // Withdraw_withheld_authority (currently payer/wallet) withdraw fees accumulated on the mint account to a specified token account.
        const transactionSignature = await program.methods
            .withdraw()
            .accounts({
                authority: wallet.publicKey, // Payer is the withdraw authority
                mintAccount: mintKeypair.publicKey,
                tokenAccount: senderTokenAccountAddress,
                destinationTokenAccount: senderTokenAccountAddress, // Withdrawing to sender's ATA
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([wallet.payer]) // Authority must sign
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log('Withdrew transfer fees from mint to sender ATA.');
    });

    it('Update Transfer Fee to zero', async () => {
        const newTransferFeeBasisPoints = 0;
        const newMaximumFee = new BN(0);

        const transactionSignature = await program.methods
            .updateFee(newTransferFeeBasisPoints, newMaximumFee)
            .accounts({
                authority: wallet.publicKey, // Payer is the fee update authority
                mintAccount: mintKeypair.publicKey,

                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([wallet.payer]) // Authority must sign
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log('Updated transfer fee to zero.');
    });
});


describe('spin wheel game logic tests', () => {
    const cashinoMintPublicKey = mintKeypair.publicKey;

    // GameState PDA
    let gameStatePda: anchor.web3.PublicKey;
    let gameStatePdaBump: number;

    // House wallet for SOL game fees
    const houseWalletKeypair = anchor.web3.Keypair.generate();

    const confirmTx = async (txSignature: string) => {
        const blockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            signature: txSignature,
            blockhash: blockhash.blockhash,
            lastValidBlockHeight: blockhash.lastValidBlockHeight
        }, 'confirmed');
        console.log(`Transaction ${txSignature} confirmed.`);
    };

    before(async () => {
        [gameStatePda, gameStatePdaBump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("game_state")],
            program.programId
        );
        console.log(`GameState PDA: ${gameStatePda.toBase58()}`);

        console.log(`Using $CASHINO Mint for tests: ${cashinoMintPublicKey.toBase58()}`);
        console.log(`House wallet for tests: ${houseWalletKeypair.publicKey.toBase58()}`);
    });


    it("Initializes Game Settings", async () => {
        const initialHouseFeeBasisPoints = new BN(10);

        console.log(`Test: Initializing GameState at PDA: ${gameStatePda.toBase58()}`);
        console.log(`Test: Authority (Payer): ${wallet.publicKey.toBase58()}`);
        console.log(`Test: House Wallet to be set: ${houseWalletKeypair.publicKey.toBase58()}`);
        console.log(`Test: House Fee Basis Points to set: ${initialHouseFeeBasisPoints.toString()}`);
        console.log(`Test: $CASHINO Mint to set: ${cashinoMintPublicKey.toBase58()}`);

        const transactionSignature = await program.methods
            .initializeGameSettings(initialHouseFeeBasisPoints, cashinoMintPublicKey)
            .accounts({
                authority: wallet.publicKey,
                gameState: gameStatePda,
                houseWallet: houseWalletKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log("Transaction for initializeGameSettings confirmed by client.");

        const gameStateAccount = await program.account.gameState.fetch(gameStatePda);
        console.log("Fetched GameState Account:", gameStateAccount);

        assert.isTrue(gameStateAccount.authority.equals(wallet.publicKey), "GameState authority mismatch");
        assert.isTrue(gameStateAccount.houseWallet.equals(houseWalletKeypair.publicKey), "GameState houseWallet mismatch");
        assert.strictEqual(gameStateAccount.houseFeeBasisPoints, initialHouseFeeBasisPoints.toNumber(), "GameState houseFeeBasisPoints mismatch");
        assert.isTrue(gameStateAccount.cashinoMint.equals(cashinoMintPublicKey), "GameState cashinoMint mismatch");
        assert.strictEqual(gameStateAccount.isInitialized, true, "GameState should be initialized");
        assert.strictEqual(gameStateAccount.roundCounter.toNumber(), 0, "GameState roundCounter should be 0");

        console.log("GameState initialized and verified successfully.");

    });

    let currentRoundIdForSeed: anchor.BN;
    let roundStatePda: anchor.web3.PublicKey;
    let gamePotSolPda: anchor.web3.PublicKey;

    it("Starts a new game round correctly", async () => {
        const gameStateAccountBefore = await program.account.gameState.fetch(gameStatePda);
        currentRoundIdForSeed = gameStateAccountBefore.roundCounter;
        console.log(`Test: Current roundCounter from GameState (for PDA seed): ${currentRoundIdForSeed.toString()}`);

        [roundStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("round_state"), currentRoundIdForSeed.toBuffer("le", 8)],
            program.programId
        );
        [gamePotSolPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("sol_pot"), currentRoundIdForSeed.toBuffer("le", 8)],
            program.programId
        );

        console.log(`Test: Derived RoundState PDA for new round: ${roundStatePda.toBase58()}`);
        console.log(`Test: Derived GamePotSol PDA for new round: ${gamePotSolPda.toBase58()}`);

        const seedCommitment = Array.from(Buffer.from("test_seed_commitment_for_round_X".padEnd(32, '\0')));
        const seedCommitmentBuffer = Buffer.from(seedCommitment);

        const roundDuration = new BN(30);

        console.log(`Test: Calling startNewRound with roundIdForSeed: ${currentRoundIdForSeed.toString()}`);

        const transactionSignature = await program.methods
            .startNewRound(
                seedCommitmentBuffer,
                roundDuration,
                currentRoundIdForSeed
            )
            .accounts({
                authority: wallet.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log("Transaction for startNewRound confirmed.");

        const gameStateAccountAfter = await program.account.gameState.fetch(gameStatePda);
        const expectedNewRoundCounter = currentRoundIdForSeed.add(new BN(1));
        console.log(`Test: GameState roundCounter after: ${gameStateAccountAfter.roundCounter.toString()}, Expected: ${expectedNewRoundCounter.toString()}`);
        assert.strictEqual(
            gameStateAccountAfter.roundCounter.toString(),
            expectedNewRoundCounter.toString(),
            "GameState roundCounter should be incremented"
        );

        const roundStateAccount = await program.account.roundState.fetch(roundStatePda);
        console.log("Fetched RoundState Account:", {
            id: roundStateAccount.id.toString(),
            isActive: roundStateAccount.isActive,
            totalSolPot: roundStateAccount.totalSolPot.toString(),
            playerCount: roundStateAccount.playerCount,
            startTime: roundStateAccount.startTime.toString(),
            endTime: roundStateAccount.endTime.toString(),
        });
        assert.strictEqual(
            roundStateAccount.id.toString(),
            expectedNewRoundCounter.toString(),
            "RoundState ID should match new game counter"
        );
        assert.isTrue(roundStateAccount.isActive, "RoundState should be active");
        assert.deepStrictEqual(roundStateAccount.seedCommitment, seedCommitment, "Seed commitment mismatch");
        assert.strictEqual(roundStateAccount.totalSolPot.toNumber(), 0, "RoundState totalSolPot should be 0");
        assert.strictEqual(roundStateAccount.playerCount, 0, "RoundState playerCount should be 0");
        assert.isTrue(roundStateAccount.startTime.toNumber() > 0, "RoundState start time should be set");
        assert.isTrue(roundStateAccount.endTime.toNumber() > roundStateAccount.startTime.toNumber(), "RoundState end time should be after start time");

        const gamePotAccount = await program.account.gamePotSol.fetch(gamePotSolPda);
        assert.isNotNull(gamePotAccount, "GamePotSol account should be created");
        console.log(`GamePotSol account ${gamePotSolPda.toBase58()} created successfully.`);
        console.log("startNewRound test completed successfully.");


    });

    let player2Keypair: anchor.web3.Keypair;
    let initialPlayer1Balance: bigint;
    let initialPlayer2Balance: bigint;
    let initialGamePotBalance: number;

    it("Allows players to place SOL bets", async () => {
        const player1 = wallet;
        const betAmountPlayer1 = new BN(1 * anchor.web3.LAMPORTS_PER_SOL);

        player2Keypair = anchor.web3.Keypair.generate();
        console.log(`Test: Airdropping SOL to Player 2 (${player2Keypair.publicKey.toBase58()})...`);
        const airdropSignature = await connection.requestAirdrop(
            player2Keypair.publicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL
        );
        await confirmTx(airdropSignature);
        console.log(`Test: Airdrop to Player 2 confirmed.`);
        const betAmountPlayer2 = new BN(0.5 * anchor.web3.LAMPORTS_PER_SOL);

        initialPlayer1Balance = BigInt((await connection.getBalance(player1.publicKey)).toString());
        initialPlayer2Balance = BigInt((await connection.getBalance(player2Keypair.publicKey)).toString());
        initialGamePotBalance = await connection.getBalance(gamePotSolPda);
        console.log(`Test: Initial Player 1 Balance: ${initialPlayer1Balance}`);
        console.log(`Test: Initial Player 2 Balance: ${initialPlayer2Balance}`);
        console.log(`Test: Initial GamePotSol PDA Balance: ${initialGamePotBalance}`);

        // --- Player 1 places a bet ---
        console.log(`Test: Player 1 (${player1.publicKey.toBase58()}) placing bet of ${betAmountPlayer1.toString()}`);
        const tx1Signature = await program.methods
            .placeSolBet(currentRoundIdForSeed, betAmountPlayer1)
            .accounts({
                player: player1.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });
        await confirmTx(tx1Signature);
        console.log("Player 1 bet transaction confirmed.");

        let roundStateAccount = await program.account.roundState.fetch(roundStatePda);
        let gamePotBalance = await connection.getBalance(gamePotSolPda);

        console.log("State after Player 1 bet:");
        console.log(`  RoundState.totalSolPot: ${roundStateAccount.totalSolPot.toString()}`);
        console.log(`  RoundState.playerCount: ${roundStateAccount.playerCount}`);
        console.log(`  RoundState.players[0]:`, roundStateAccount.players[0]);
        console.log(`  GamePotSol PDA Balance: ${gamePotBalance}`);

        assert.strictEqual(roundStateAccount.totalSolPot.toString(), betAmountPlayer1.toString(), "Total SOL pot after P1 bet mismatch");
        assert.strictEqual(roundStateAccount.playerCount, 1, "Player count after P1 bet mismatch");
        assert.isTrue(roundStateAccount.players[0].pubkey.equals(player1.publicKey), "P1 pubkey mismatch");
        assert.strictEqual(roundStateAccount.players[0].amount.toString(), betAmountPlayer1.toString(), "P1 amount mismatch");
        assert.strictEqual(gamePotBalance, initialGamePotBalance + Number(betAmountPlayer1.toString()), "GamePot balance after P1 bet mismatch");

        // --- Player 2 places a bet ---
        console.log(`Test: Player 2 (${player2Keypair.publicKey.toBase58()}) placing bet of ${betAmountPlayer2.toString()}`);
        const tx2Signature = await program.methods
            .placeSolBet(currentRoundIdForSeed, betAmountPlayer2)
            .accounts({
                player: player2Keypair.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player2Keypair]) // Player 2 signs for their own bet
            .rpc({ skipPreflight: true, commitment: "confirmed" });
        await confirmTx(tx2Signature);
        console.log("Player 2 bet transaction confirmed.");

        // Fetch RoundState and GamePotSol again for final assertions
        roundStateAccount = await program.account.roundState.fetch(roundStatePda);
        gamePotBalance = await connection.getBalance(gamePotSolPda);
        const finalPlayer1Balance = BigInt((await connection.getBalance(player1.publicKey)).toString());
        const finalPlayer2Balance = BigInt((await connection.getBalance(player2Keypair.publicKey)).toString());


        console.log("State after Player 2 bet:");
        console.log(`  RoundState.totalSolPot: ${roundStateAccount.totalSolPot.toString()}`);
        console.log(`  RoundState.playerCount: ${roundStateAccount.playerCount}`);
        console.log(`  RoundState.players[0]:`, roundStateAccount.players[0]);
        console.log(`  RoundState.players[1]:`, roundStateAccount.players[1]);
        console.log(`  GamePotSol PDA Balance: ${gamePotBalance}`);
        console.log(`  Final Player 1 Balance: ${finalPlayer1Balance.toString()}`);
        console.log(`  Final Player 2 Balance: ${finalPlayer2Balance.toString()}`);

        const totalBetAmount = betAmountPlayer1.add(betAmountPlayer2);
        assert.strictEqual(roundStateAccount.totalSolPot.toString(), totalBetAmount.toString(), "Final total SOL pot mismatch");
        assert.strictEqual(roundStateAccount.playerCount, 2, "Final player count mismatch");

        // Check player 1 data (order might vary if players can rejoin, but here assuming new entries)
        assert.isTrue(roundStateAccount.players[0].pubkey.equals(player1.publicKey), "P1 pubkey in array mismatch");
        assert.strictEqual(roundStateAccount.players[0].amount.toString(), betAmountPlayer1.toString(), "P1 amount in array mismatch");

        // Check player 2 data
        assert.isTrue(roundStateAccount.players[1].pubkey.equals(player2Keypair.publicKey), "P2 pubkey in array mismatch");
        assert.strictEqual(roundStateAccount.players[1].amount.toString(), betAmountPlayer2.toString(), "P2 amount in array mismatch");

        assert.strictEqual(gamePotBalance, initialGamePotBalance + Number(totalBetAmount.toString()), "Final GamePot balance mismatch");

        assert.isTrue(finalPlayer1Balance < initialPlayer1Balance, "Player 1 balance should decrease");
        assert.isTrue(finalPlayer2Balance < initialPlayer2Balance, "Player 2 balance should decrease");

        console.log("placeSolBet test completed successfully with two players.");

    });

    const CASHINO_REWARD_PER_ROUND_UNITS_TS = new BN(1_000_000);
    let roundCashinoRewardsPotAccountPda: anchor.web3.PublicKey;
    let roundCashinoRewardsPotAta: anchor.web3.PublicKey;
    let initialHouseWalletBalance: bigint;
    let initialGamePotSolBalance: bigint;

    it("Ends the game round, pays house fee, mints $CASHINO, and records entitlements", async () => {
        console.log(`Test: Ending round with ID (for PDAs): ${currentRoundIdForSeed.toString()}`);
        const revealedSeedArray = Array.from(Buffer.from("test_seed_commitment_for_round_X".padEnd(32, '\0')));
        console.log(`Test: Using revealedSeed (first 5 bytes): ${revealedSeedArray.slice(0, 5)}`);

        const originalSeedString = "test_seed_commitment_for_round_X".padEnd(32, '\0');
        const seedBufferForReveal = Buffer.from(originalSeedString);
        const seedCommitment = Array.from(Buffer.from("test_seed_commitment_for_round_X".padEnd(32, '\0')));
        const seedCommitmentBuffer = Buffer.from(seedCommitment);
        const hashOfSeed = crypto.createHash('sha256').update(seedBufferForReveal).digest();
        const seedCommitmentForInstruction = Array.from(hashOfSeed);

        console.log(`Test: Original seed string for commit: "${originalSeedString}"`);
        console.log(`Test: Hash to be committed (first 5 bytes): ${seedCommitmentForInstruction.slice(0, 5)}`);

        [roundCashinoRewardsPotAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("cashino_round_pot"), currentRoundIdForSeed.toBuffer("le", 8)],
            program.programId
        );

        console.log("CLIENT TEST (endRound): originalSeedStringForReveal:", originalSeedString);
        console.log("CLIENT TEST (endRound): seedBufferForReveal (first 5):", Array.from(seedBufferForReveal));

        roundCashinoRewardsPotAta = getAssociatedTokenAddressSync(
            mintKeypair.publicKey,
            roundCashinoRewardsPotAccountPda,
            true,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log(`Test: Derived RoundCashinoRewardsPot PDA: ${roundCashinoRewardsPotAccountPda.toBase58()}`);
        console.log(`Test: Derived RoundCashinoRewardsPot ATA: ${roundCashinoRewardsPotAta.toBase58()}`);

        initialHouseWalletBalance = BigInt((await connection.getBalance(houseWalletKeypair.publicKey)).toString());
        initialGamePotSolBalance = BigInt((await connection.getBalance(gamePotSolPda)).toString());
        const roundStateBeforeEnd = await program.account.roundState.fetch(roundStatePda);
        const totalSolPotBeforeEnd = roundStateBeforeEnd.totalSolPot;

        console.log(`Test: Initial House Wallet Balance: ${initialHouseWalletBalance.toString()}`);
        console.log(`Test: Initial GamePotSol Balance: ${initialGamePotSolBalance.toString()}`);
        console.log(`Test: Total SOL in Pot (from RoundState): ${totalSolPotBeforeEnd.toString()}`);

        console.log("THE REVEALED SEED BEING SENT: ", revealedSeedArray);

        const endRoundIx = await program.methods
            .endRound(seedBufferForReveal, currentRoundIdForSeed)
            .accounts({
                authority: wallet.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePotSol: gamePotSolPda,
                houseWallet: houseWalletKeypair.publicKey,
                cashinoTokenMint: mintKeypair.publicKey,
                cashinoMintAuthorityPda: mintAuthorityPda,
                roundCashinoRewardsPotAccount: roundCashinoRewardsPotAccountPda,
                roundCashinoRewardsPotAta: roundCashinoRewardsPotAta,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                spinWheelProgram: program.programId,
            })
            .instruction();

        const transaction = new anchor.web3.Transaction();

        transaction.add(
            anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
                units: 400000,
            })
        );

        transaction.add(endRoundIx);

        let txSignature: string | undefined = undefined;
        try {
            txSignature = await provider.sendAndConfirm(transaction, [wallet.payer], {
                skipPreflight: true,
                commitment: "confirmed",
            });
            console.log(`Transaction ${txSignature} confirmed.`);
            console.log("Transaction for endGameRound confirmed by client.");

        } catch (error) {
            console.error("Error sending/confirming transaction:", error);
            if (txSignature) {
                console.log(`Failed tx: ${txSignature}. Check explorer or solana confirm -v ${txSignature}`);
            }
            throw error;
        }


        // const transactionSignature = await program.methods
        //     .endRound(seedBufferForReveal, currentRoundIdForSeed)
        //     .accounts({
        //         authority: wallet.publicKey,
        //         gameState: gameStatePda,
        //         roundState: roundStatePda,
        //         gamePotSol: gamePotSolPda,
        //         houseWallet: houseWalletKeypair.publicKey,
        //         cashinoTokenMint: mintKeypair.publicKey,
        //         cashinoMintAuthorityPda: mintAuthorityPda,
        //         roundCashinoRewardsPotAccount: roundCashinoRewardsPotAccountPda,
        //         roundCashinoRewardsPotAta: roundCashinoRewardsPotAta,
        //         systemProgram: anchor.web3.SystemProgram.programId,
        //         tokenProgram: TOKEN_2022_PROGRAM_ID,
        //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        //         spinWheelProgram: program.programId,
        //     })
        //     .rpc({ skipPreflight: true, commitment: "confirmed" });
        //
        // await confirmTx(transactionSignature);
        console.log("Transaction for endGameRound confirmed.");

        const gameStateAfter = await program.account.gameState.fetch(gameStatePda);
        const roundStateAfter = await program.account.roundState.fetch(roundStatePda);

        assert.isFalse(roundStateAfter.isActive, "RoundState should be inactive");
        assert.isNotNull(roundStateAfter.winnerIndex, "Winner index should be set");
        assert.isDefined(roundStateAfter.winnerIndex, "Winner index should be defined");
        console.log(`Test: Determined Winner Index: ${roundStateAfter.winnerIndex}`);
        assert.deepStrictEqual(roundStateAfter.revealedSeed, revealedSeedArray, "Revealed seed mismatch");

        const expectedHouseFee = totalSolPotBeforeEnd.mul(new BN(gameStateAfter.houseFeeBasisPoints)).div(new BN(10000));
        console.log(`Test: Expected House Fee: ${expectedHouseFee.toString()}`);
        assert.strictEqual(roundStateAfter.houseSolFee.toString(), expectedHouseFee.toString(), "Stored houseSolFee in RoundState mismatch");

        const finalHouseWalletBalance = BigInt((await connection.getBalance(houseWalletKeypair.publicKey)).toString());
        console.log(`Test: Final House Wallet Balance: ${finalHouseWalletBalance.toString()}`);
        assert.strictEqual(
            finalHouseWalletBalance.toString(),
            (initialHouseWalletBalance + BigInt(expectedHouseFee.toString())).toString(),
            "House wallet balance did not increase by correct fee amount"
        );

        const finalGamePotSolBalance = await connection.getBalance(gamePotSolPda);
        const expectedGamePotSolBalanceAfterFee = Number(initialGamePotSolBalance.toString()) - Number(expectedHouseFee.toString());
        console.log(`Test: Final GamePotSol Balance: ${finalGamePotSolBalance}, Expected after fee: ${expectedGamePotSolBalanceAfterFee}`);
        assert.strictEqual(finalGamePotSolBalance, expectedGamePotSolBalanceAfterFee, "GamePotSol balance after fee mismatch");

        const roundCashinoRewardsPotAccountData = await program.account.roundCashinoRewardsPot.fetch(roundCashinoRewardsPotAccountPda);
        assert.strictEqual(roundCashinoRewardsPotAccountData.roundId.toString(), currentRoundIdForSeed.toString(), "RoundCashinoRewardsPot roundId mismatch");
        assert.strictEqual(roundCashinoRewardsPotAccountData.totalMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundCashinoRewardsPot totalMinted mismatch");

        const rewardsPotAtaInfo = await getAccount(connection, roundCashinoRewardsPotAta, "confirmed", TOKEN_2022_PROGRAM_ID);
        console.log(`Test: $CASHINO balance in Round's Reward Pot ATA: ${rewardsPotAtaInfo.amount.toString()}`);
        assert.strictEqual(rewardsPotAtaInfo.amount.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "$CASHINO in reward pot ATA mismatch");

        assert.strictEqual(roundStateAfter.totalCashinoMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundState totalCashinoMinted mismatch");

        console.log("Test: Verifying player $CASHINO reward entitlements...");
        let totalCalculatedCashinoRewards = new BN(0);
        for (let i = 0; i < roundStateAfter.playerCount; i++) {
            const playerBetData = roundStateBeforeEnd.players[i];
            const playerRewardData = roundStateAfter.playerCashinoRewards[i];
            assert.isTrue(playerRewardData.player.equals(playerBetData.pubkey), `Player ${i} pubkey mismatch in rewards`);
            assert.strictEqual(playerRewardData.solBetAmount.toString(), playerBetData.amount.toString(), `Player ${i} SOL bet amount mismatch in rewards`);

            let expectedPlayerCashinoReward = new BN(0);
            if (totalSolPotBeforeEnd.gtn(0)) {
                expectedPlayerCashinoReward = playerBetData.amount
                    .mul(CASHINO_REWARD_PER_ROUND_UNITS_TS)
                    .div(totalSolPotBeforeEnd);
            }

            console.log(`  Player ${i} (${playerRewardData.player.toBase58()}): Bet ${playerBetData.amount.toString()}, Expected Reward ${expectedPlayerCashinoReward.toString()}, Actual Stored Reward ${playerRewardData.cashinoRewardAmount.toString()}`);
            assert.strictEqual(playerRewardData.cashinoRewardAmount.toString(), expectedPlayerCashinoReward.toString(), `Player ${i} $CASHINO reward amount mismatch`);
            assert.isFalse(playerRewardData.claimed, `Player ${i} $CASHINO reward should not be claimed yet`);
            totalCalculatedCashinoRewards = totalCalculatedCashinoRewards.add(playerRewardData.cashinoRewardAmount);
        }

        console.log(`Test: Total calculated $CASHINO rewards for players: ${totalCalculatedCashinoRewards.toString()}`);
        assert.isTrue(totalCalculatedCashinoRewards.lte(CASHINO_REWARD_PER_ROUND_UNITS_TS), "Total calculated rewards exceed total minted");

        console.log("endGameRound test completed successfully.");
    });

    it("Allows the correct winner to claim their SOL winnings", async () => {
        console.log(`Test: Claiming SOL winnings for round (PDA ID for PDAs): ${currentRoundIdForSeed.toString()}`);
        const roundStateInfo = await program.account.roundState.fetch(roundStatePda);

        assert.isFalse(roundStateInfo.isActive, "Round should be inactive to claim winnings.");
        assert.isNotNull(roundStateInfo.winnerIndex, "Winner index must be set in RoundState.");

        const winnerIndex = roundStateInfo.winnerIndex!; // Non-null assertion after check

        const winnerPlayerData = roundStateInfo.players[winnerIndex];
        const winnerPublicKey = winnerPlayerData.pubkey;

        console.log(`Test: Determined winner from RoundState: Pubkey ${winnerPublicKey.toBase58()} at index ${winnerIndex}`);

        // Determine the Keypair for the winner to sign the transaction
        let winnerSignerKeypair: anchor.web3.Keypair;
        const defaultWalletKeypair = (provider.wallet as anchor.Wallet).payer; // This is the Keypair for the default wallet

        if (defaultWalletKeypair.publicKey.equals(winnerPublicKey)) {
            winnerSignerKeypair = defaultWalletKeypair;
            console.log(`Test: Winner is the main provider wallet (${winnerPublicKey.toBase58()}).`);
        } else if (player2Keypair && player2Keypair.publicKey.equals(winnerPublicKey)) {
            winnerSignerKeypair = player2Keypair;
            console.log(`Test: Winner is Player 2 (${winnerPublicKey.toBase58()}), using player2Keypair to sign.`);
        } else {
            // This case implies the test doesn't have the private key for the determined winner.
            // For a positive test of claimSolWinnings, this is an issue.
            // Consider failing the test here or ensuring the test setup guarantees a known winner.
            throw new Error(
                `Winner ${winnerPublicKey.toBase58()} is not a controlled keypair in this test. Cannot sign claim transaction.`
            );
        }

        const calculatedWinningsBN = roundStateInfo.totalSolPot.sub(roundStateInfo.houseSolFee); // BN
        const calculatedWinningsBigInt = BigInt(calculatedWinningsBN.toString());
        console.log(`Test: Calculated SOL winnings for winner (BN): ${calculatedWinningsBN.toString()}`);
        console.log(`Test: Calculated SOL winnings for winner (BigInt): ${calculatedWinningsBigInt.toString()}`);

        // If winnings are zero or less, the behavior of balances will be different.
        // The claim might still proceed (e.g., to update some state if applicable) or might not change balances.
        if (calculatedWinningsBN.lten(0)) { // BN lten is less than or equal to zero
            console.warn(`Calculated winnings are ${calculatedWinningsBN.toString()}. The winner will only pay transaction fees.`);
        }

        const initialWinnerWalletBalance = BigInt(await connection.getBalance(winnerPublicKey));
        const initialGamePotSolBalanceOnChain = BigInt(await connection.getBalance(gamePotSolPda));
        console.log(`Test: Initial Winner (${winnerPublicKey.toBase58()}) Wallet Balance: ${initialWinnerWalletBalance.toString()}`);
        console.log(`Test: Initial GamePotSol PDA Balance (before claim): ${initialGamePotSolBalanceOnChain.toString()}`);

        // If the game pot is already zero and winnings are also zero (or less),
        // the claim instruction might not change balances or could even be uncallable if it expects funds.
        // Your Rust code allows claim even if winnings_amount is 0.
        if (initialGamePotSolBalanceOnChain === BigInt(0) && calculatedWinningsBN.lten(0)) {
            console.log("Game pot is empty and winnings are zero or less. Skipping balance change assertions for winner wallet related to winnings.");
            // You might still call claim if it has other effects or want to ensure it doesn't error.
        }

        const txBuilder = program.methods
            .claimSolWinnings(currentRoundIdForSeed) // currentRoundIdForSeed is BN, matches u64
            .accounts({
                winner: winnerPublicKey, // The Pubkey of the Signer
                roundState: roundStatePda,
                gamePotSol: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            });

        // Explicitly add the winnerSignerKeypair if it's not the default fee payer wallet.
        // Anchor automatically adds provider.wallet.payer if it's the fee payer.
        // Since `winner` is a Signer, if `winnerPublicKey` isn't the default wallet's,
        // we must explicitly provide its Keypair.
        if (!defaultWalletKeypair.publicKey.equals(winnerPublicKey)) {
            txBuilder.signers([winnerSignerKeypair]);
            console.log(`Test: Explicitly adding signer: ${winnerSignerKeypair.publicKey.toBase58()}`);
        }
        // If winnerSignerKeypair IS defaultWalletKeypair, Anchor handles its signature as it's the fee payer
        // AND its public key matches the `winner` account which is declared as Signer<'info>.

        const transactionSignature = await txBuilder.rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature); // Uses global connection defined in the test setup
        console.log("Transaction for claimSolWinnings confirmed.");

        const finalWinnerWalletBalance = BigInt(await connection.getBalance(winnerPublicKey));
        const finalGamePotSolBalanceOnChain = BigInt(await connection.getBalance(gamePotSolPda));

        console.log(`Test: Final Winner Wallet Balance: ${finalWinnerWalletBalance.toString()}`);
        console.log(`Test: Final GamePotSol PDA Balance: ${finalGamePotSolBalanceOnChain.toString()}`);

        const expectedGamePotSolBalanceAfterClaim = initialGamePotSolBalanceOnChain - calculatedWinningsBigInt;

        assert.strictEqual(
            finalGamePotSolBalanceOnChain.toString(),
            expectedGamePotSolBalanceAfterClaim.toString(),
            "GamePotSol balance after claim mismatch"
        );

        // Calculate estimated transaction fee paid by the winner
        // This is an approximation as actual fees can vary slightly.
        // finalBalance = initialBalance + winnings - fee  => fee = initialBalance + winnings - finalBalance
        const estimatedFeePaidByWinner = initialWinnerWalletBalance + calculatedWinningsBigInt - finalWinnerWalletBalance;
        console.log(`Test: Estimated fee paid by winner: ${estimatedFeePaidByWinner.toString()} lamports.`);

        // Allow for a small discrepancy in fee calculation / other minor balance changes.
        const maxExpectedFee = BigInt(10000); // e.g., 0.00001 SOL, a typical fee for a simple transaction. Adjust if needed.

        if (calculatedWinningsBigInt > BigInt(0)) {
            assert.isTrue(
                finalWinnerWalletBalance >= initialWinnerWalletBalance + calculatedWinningsBigInt - maxExpectedFee,
                `Winner wallet balance should increase by approx winnings. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}, Winnings: ${calculatedWinningsBigInt}`
            );
            // Ensure it didn't increase by MORE than winnings significantly (e.g. some other source of funds)
            assert.isTrue(
                finalWinnerWalletBalance <= initialWinnerWalletBalance + calculatedWinningsBigInt,
                `Winner wallet balance increase too large. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}, Winnings: ${calculatedWinningsBigInt}`
            );

        } else { // Winnings were zero or negative
            assert.isTrue(
                finalWinnerWalletBalance <= initialWinnerWalletBalance, // Balance should decrease or stay same (if fee was 0, unlikely)
                `Winner wallet balance should decrease or stay same if no winnings. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}`
            );
            assert.isTrue(
                finalWinnerWalletBalance >= initialWinnerWalletBalance - maxExpectedFee,
                `Winner wallet balance decreased more than expected max fee. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}`
            );
        }

        console.log(`claimSolWinnings test for winner ${winnerPublicKey.toBase58()} completed successfully.`);
    });

});