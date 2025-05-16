import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
    getAccount,
    getMint
} from "@solana/spl-token";
import type { SpinWheel } from "../target/types/spin_wheel";
import { assert, expect } from "chai";

const mintKeypair = new anchor.web3.Keypair();

const provider = anchor.AnchorProvider.env();
const connection = provider.connection;
const wallet = provider.wallet as anchor.Wallet;
anchor.setProvider(provider);

const program = anchor.workspace.SpinWheel as Program<SpinWheel>;

const recipientKeypair = new anchor.web3.Keypair(); // For user-to-user transfer tests

// PDA for mint authority
const [mintAuthorityPda] =
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


describe('Spin Wheel Game Setup', () => {
    const cashinoMintPublicKey = mintKeypair.publicKey;

    // GameState PDA
    let gameStatePda: anchor.web3.PublicKey;

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
        [gameStatePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("game_state")],
            program.programId
        );
        console.log(`GameState PDA: ${gameStatePda.toBase58()}`);

        console.log(`Using $CASHINO Mint for tests: ${cashinoMintPublicKey.toBase58()}`);
        console.log(`House wallet for tests: ${houseWalletKeypair.publicKey.toBase58()}`);
    });


    it("Initializes Game Settings", async () => {
        const initialHouseFeeBasisPoints = 10;

        console.log(`Test: Initializing GameState at PDA: ${gameStatePda.toBase58()}`);
        console.log(`Test: Authority (Payer): ${wallet.publicKey.toBase58()}`);
        console.log(`Test: House Wallet to be set: ${houseWalletKeypair.publicKey.toBase58()}`);
        console.log(`Test: House Fee Basis Points to set: ${initialHouseFeeBasisPoints.toString()}`);
        console.log(`Test: $CASHINO Mint to set: ${cashinoMintPublicKey.toBase58()}`);

        const transactionSignature = await program.methods
            .initializeGameSettings(initialHouseFeeBasisPoints)
            .accounts({
                authority: wallet.publicKey,
                gameState: gameStatePda,
                houseWallet: houseWalletKeypair.publicKey,
                cashinoTokenMint: cashinoMintPublicKey,
                token2022Program: TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(transactionSignature);
        console.log("Transaction for initializeGameSettings confirmed by client.");

        const gameStateAccount = await program.account.gameState.fetch(gameStatePda);
        console.log("Fetched GameState Account:", {
            authority: gameStateAccount.authority.toBase58(),
            houseWallet: gameStateAccount.houseWallet.toBase58(),
            houseFeeBasisPoints: gameStateAccount.houseFeeBasisPoints,
            roundCounter: gameStateAccount.roundCounter.toString(), // BN to string
            isInitialized: gameStateAccount.isInitialized,
            cashinoMint: gameStateAccount.cashinoMint.toBase58(),
        });

        assert.isTrue(gameStateAccount.authority.equals(wallet.publicKey), "GameState authority mismatch");
        assert.isTrue(gameStateAccount.houseWallet.equals(houseWalletKeypair.publicKey), "GameState houseWallet mismatch");
        assert.strictEqual(gameStateAccount.houseFeeBasisPoints, initialHouseFeeBasisPoints, "GameState houseFeeBasisPoints mismatch");
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

        const seedCommitment = Array.from(Buffer.from("test_seed_commitment_for_round_1".padEnd(32, '\0')));
        const seedCommitmentBuffer = Buffer.from(seedCommitment);

        const roundDuration = new BN(30);

        console.log(`Test: Calling startNewRound with roundIdForSeed: ${currentRoundIdForSeed.toString()}`);
        console.log(`Test: Seed Commitment (first 5): ${seedCommitment.slice(0, 5)}`);
        console.log(`Test: Round Duration: ${roundDuration.toString()}`);


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
        console.log("Fetched RoundState Account Data:", {
            id: roundStateAccount.id.toString(),
            isActive: roundStateAccount.isActive,
            playerCount: roundStateAccount.playerCount,
            totalSolPot: roundStateAccount.totalSolPot.toString(),
            seedCommitment: roundStateAccount.seedCommitment.toString(),
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

    before(async () => {
        player2Keypair = anchor.web3.Keypair.generate();
        console.log(`Airdropping SOL to Player 2 (${player2Keypair.publicKey.toBase58()})...`);
        const airdropSignature = await connection.requestAirdrop(
            player2Keypair.publicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL // Airdrop 2 SOL
        );
        await confirmTx(airdropSignature);
        console.log("Airdrop to Player 2 confirmed.");
    });

    it("Allows players to place SOL bets", async () => {

        assert.isDefined(currentRoundIdForSeed, "Round ID should be defined");
        assert.isDefined(roundStatePda, "Round state pda is not defined");
        assert.isDefined(gamePotSolPda, "gamePotSolPda is not defined");

        const player1 = wallet;
        const betAmountPlayer1Lamports = new BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

        console.log(`\n--- Player 1 (${player1.publicKey.toBase58()}) placing first bet ---`);
        console.log(`Target Round ID for PDAs: ${currentRoundIdForSeed.toString()}`);
        console.log(`Bet Amount (Lamports): ${betAmountPlayer1Lamports.toString()}`);

        const initialPlayer1Balance = await connection.getBalance(player1.publicKey);
        const initialGamePotBalance = await connection.getBalance(gamePotSolPda);
        let roundStateBeforeP1Bet = await program.account.roundState.fetch(roundStatePda);
        const initialRoundPotValue = roundStateBeforeP1Bet.totalSolPot;
        const initialPlayerCount = roundStateBeforeP1Bet.playerCount;

        const tx1Signature = await program.methods
            .placeSolBet(currentRoundIdForSeed, betAmountPlayer1Lamports)
            .accounts({
                player: player1.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda, // Matches 'game_pot' in Rust struct
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer]) // player1.payer is the Keypair for the wallet
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(tx1Signature);
        console.log("Player 1 bet transaction confirmed.");

        let roundStateAfterP1Bet = await program.account.roundState.fetch(roundStatePda);
        let gamePotBalanceAfterP1Bet = await connection.getBalance(gamePotSolPda);
        let player1BalanceAfterP1Bet = await connection.getBalance(player1.publicKey);

        assert.strictEqual(roundStateAfterP1Bet.playerCount, initialPlayerCount + 1, "Player count should increment for new player");
        assert.strictEqual(
            roundStateAfterP1Bet.totalSolPot.toString(),
            initialRoundPotValue.add(betAmountPlayer1Lamports).toString(),
            "RoundState totalSolPot incorrect after P1 first bet"
        );
        assert.isTrue(roundStateAfterP1Bet.players[initialPlayerCount].pubkey.equals(player1.publicKey), "Player 1 pubkey not recorded correctly");
        assert.strictEqual(
            roundStateAfterP1Bet.players[initialPlayerCount].amount.toString(),
            betAmountPlayer1Lamports.toString(),
            "Player 1 bet amount not recorded correctly"
        );
        assert.strictEqual(
            gamePotBalanceAfterP1Bet,
            initialGamePotBalance + betAmountPlayer1Lamports.toNumber(), // Balances are numbers
            "GamePot SOL balance incorrect after P1 first bet"
        );

        expect(player1BalanceAfterP1Bet).to.be.lessThan(initialPlayer1Balance - betAmountPlayer1Lamports.toNumber() + 10000);

        const betAmountPlayer2Lamports = new BN(0.05 * anchor.web3.LAMPORTS_PER_SOL); // 0.05 SOL
        console.log(`\n--- Player 2 (${player2Keypair.publicKey.toBase58()}) placing bet ---`);
        console.log(`Bet Amount (Lamports): ${betAmountPlayer2Lamports.toString()}`);

        const initialPlayer2Balance = await connection.getBalance(player2Keypair.publicKey);
        const initialGamePotBalanceP2 = await connection.getBalance(gamePotSolPda); // get current pot balance
        roundStateBeforeP1Bet = await program.account.roundState.fetch(roundStatePda); // Re-fetch for current player count
        const playerCountBeforeP2 = roundStateBeforeP1Bet.playerCount;


        const tx2Signature = await program.methods
            .placeSolBet(currentRoundIdForSeed, betAmountPlayer2Lamports)
            .accounts({
                player: player2Keypair.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player2Keypair])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(tx2Signature);
        console.log("Player 2 bet transaction confirmed.");

        let roundStateAfterP2Bet = await program.account.roundState.fetch(roundStatePda);
        let gamePotBalanceAfterP2Bet = await connection.getBalance(gamePotSolPda);
        let player2BalanceAfterP2Bet = await connection.getBalance(player2Keypair.publicKey);

        assert.strictEqual(roundStateAfterP2Bet.playerCount, playerCountBeforeP2 + 1, "Player count should increment for new player (P2)");
        const expectedTotalPotAfterP2 = roundStateAfterP1Bet.totalSolPot.add(betAmountPlayer2Lamports);
        assert.strictEqual(
            roundStateAfterP2Bet.totalSolPot.toString(),
            expectedTotalPotAfterP2.toString(),
            "RoundState totalSolPot incorrect after P2 bet"
        );
        assert.isTrue(roundStateAfterP2Bet.players[playerCountBeforeP2].pubkey.equals(player2Keypair.publicKey), "Player 2 pubkey not recorded correctly");
        assert.strictEqual(
            roundStateAfterP2Bet.players[playerCountBeforeP2].amount.toString(),
            betAmountPlayer2Lamports.toString(),
            "Player 2 bet amount not recorded correctly"
        );
        assert.strictEqual(
            gamePotBalanceAfterP2Bet,
            initialGamePotBalanceP2 + betAmountPlayer2Lamports.toNumber(),
            "GamePot SOL balance incorrect after P2 bet"
        );
        expect(player2BalanceAfterP2Bet).to.be.lessThan(initialPlayer2Balance - betAmountPlayer2Lamports.toNumber() + 10000);

        const additionalBetP1Lamports = new BN(0.02 * anchor.web3.LAMPORTS_PER_SOL); // 0.02 SOL
        console.log(`\n--- Player 1 (${player1.publicKey.toBase58()}) placing additional bet ---`);
        console.log(`Additional Bet Amount (Lamports): ${additionalBetP1Lamports.toString()}`);

        const initialPlayer1BalanceP3 = await connection.getBalance(player1.publicKey);
        const initialGamePotBalanceP3 = await connection.getBalance(gamePotSolPda);
        roundStateBeforeP1Bet = await program.account.roundState.fetch(roundStatePda); // Re-fetch
        const playerCountBeforeP1Add = roundStateBeforeP1Bet.playerCount;
        const player1DataIndex = roundStateBeforeP1Bet.players.findIndex(p => p.pubkey.equals(player1.publicKey));


        const tx3Signature = await program.methods
            .placeSolBet(currentRoundIdForSeed, additionalBetP1Lamports)
            .accounts({
                player: player1.publicKey,
                gameState: gameStatePda,
                roundState: roundStatePda,
                gamePot: gamePotSolPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await confirmTx(tx3Signature);
        console.log("Player 1 additional bet transaction confirmed.");

        // Verify state after Player 1's additional bet
        const roundStateAfterP1AddBet = await program.account.roundState.fetch(roundStatePda);
        const gamePotBalanceAfterP1AddBet = await connection.getBalance(gamePotSolPda);
        const player1BalanceAfterP1AddBet = await connection.getBalance(player1.publicKey);

        assert.strictEqual(roundStateAfterP1AddBet.playerCount, playerCountBeforeP1Add, "Player count should NOT change for existing player");
        const expectedTotalPotAfterP1Add = roundStateAfterP2Bet.totalSolPot.add(additionalBetP1Lamports);
        assert.strictEqual(
            roundStateAfterP1AddBet.totalSolPot.toString(),
            expectedTotalPotAfterP1Add.toString(),
            "RoundState totalSolPot incorrect after P1 additional bet"
        );

        assert.isTrue(player1DataIndex !== -1, "Player 1 should be found in players array");
        const expectedP1TotalBet = betAmountPlayer1Lamports.add(additionalBetP1Lamports);
        assert.strictEqual(
            roundStateAfterP1AddBet.players[player1DataIndex].amount.toString(),
            expectedP1TotalBet.toString(),
            "Player 1 total bet amount incorrect after additional bet"
        );
        assert.strictEqual(
            gamePotBalanceAfterP1AddBet,
            initialGamePotBalanceP3 + additionalBetP1Lamports.toNumber(),
            "GamePot SOL balance incorrect after P1 additional bet"
        );
        expect(player1BalanceAfterP1AddBet).to.be.lessThan(initialPlayer1BalanceP3 - additionalBetP1Lamports.toNumber() + 10000);

        console.log("placeSolBet test completed successfully.");
    });

    let roundCashinoRewardsPotAccountPda: anchor.web3.PublicKey;
    let roundCashinoRewardsPotAta: anchor.web3.PublicKey;

    const CASHINO_REWARD_PER_ROUND_UNITS_TS = new BN(1_000_000);

    it("Ends the game round, determines winner, pays fee, mints $CASHINO, and records entitlements", async () => {
        assert.isDefined(currentRoundIdForSeed, "currentRoundIdForSeed is not defined from previous tests.");
        assert.isDefined(roundStatePda, "roundStatePda is not defined.");
        assert.isDefined(gamePotSolPda, "gamePotSolPda is not defined.");
        assert.isDefined(gameStatePda, "gameStatePda is not defined.");
        assert.isDefined(cashinoMintPublicKey, "cashinoMintPublicKey is not defined.");
        assert.isDefined(houseWalletKeypair, "houseWalletKeypair is not defined.");

        console.log(`\n--- Ending game round ---`);
        console.log(`Target Round ID for PDAs: ${currentRoundIdForSeed.toString()}`);

        const seedCommittedInStartRound = "test_seed_happy_path".padEnd(32, '\0');
        const revealedSeedBuffer = Buffer.from(seedCommittedInStartRound, 'utf-8');
        const revealedSeedArrayForAssertion = Array.from(revealedSeedBuffer);

        console.log(`Revealed Seed (Buffer for instruction): [${revealedSeedBuffer.slice(0, 5).join(',')}]`);

        [roundCashinoRewardsPotAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("cashino_round_pot"), currentRoundIdForSeed.toBuffer("le", 8)],
            program.programId
        );

        roundCashinoRewardsPotAta = anchor.utils.token.associatedAddress({
            mint: cashinoMintPublicKey,
            owner: roundCashinoRewardsPotAccountPda,
        });

        roundCashinoRewardsPotAta = getAssociatedTokenAddressSync(
            cashinoMintPublicKey,
            roundCashinoRewardsPotAccountPda,
            true,
            TOKEN_2022_PROGRAM_ID,
            anchor.utils.token.ASSOCIATED_PROGRAM_ID
        );

        console.log(`Derived RoundCashinoRewardsPot PDA: ${roundCashinoRewardsPotAccountPda.toBase58()}`);
        console.log(`Derived RoundCashinoRewardsPot ATA: ${roundCashinoRewardsPotAta.toBase58()}`);
        const initialHouseWalletBalance = await connection.getBalance(houseWalletKeypair.publicKey);
        const initialGamePotSolBalance = await connection.getBalance(gamePotSolPda);
        const roundStateBeforeEnd = await program.account.roundState.fetch(roundStatePda);
        const totalSolPotInRound = roundStateBeforeEnd.totalSolPot;
        const playerCountInRound = roundStateBeforeEnd.playerCount;
        const playersInRoundBeforeEnd = roundStateBeforeEnd.players.slice(0, playerCountInRound); // Get only active players

        console.log(`Initial House Wallet Balance: ${initialHouseWalletBalance}`);
        console.log(`Initial GamePotSol Balance: ${initialGamePotSolBalance}`);
        console.log(`Total SOL in Pot (from RoundState): ${totalSolPotInRound.toString()}`);
        console.log(`Player count in round: ${playerCountInRound}`);

        const transaction = new anchor.web3.Transaction();
        transaction.add(
            anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }) // endRound is complex
        );
        transaction.add(
            await program.methods
                .endRound(
                    Array.from(revealedSeedBuffer),
                    currentRoundIdForSeed
                )
                .accounts({
                    authority: wallet.publicKey,
                    gameState: gameStatePda,
                    roundState: roundStatePda,
                    gamePotSol: gamePotSolPda,
                    houseWallet: houseWalletKeypair.publicKey,
                    cashinoTokenMint: cashinoMintPublicKey,
                    cashinoMintAuthorityPda: mintAuthorityPda,
                    roundCashinoRewardsPotAccount: roundCashinoRewardsPotAccountPda,
                    roundCashinoRewardsPotAta: roundCashinoRewardsPotAta,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                    spinWheelProgram: program.programId,
                })
                .instruction()
        );

        let txSignature: string | undefined = undefined;
        try {
            txSignature = await provider.sendAndConfirm(transaction, [wallet.payer], {
                skipPreflight: true,
                commitment: "confirmed",
            });
            console.log(`Transaction ${txSignature} for endRound confirmed.`);
        } catch (error) {
            console.error("Error during endRound transaction:", JSON.stringify(error, null, 2));
            if (txSignature) {
                console.log(`Failed tx: https://explorer.solana.com/tx/${txSignature}?cluster=custom&customUrl=${connection.rpcEndpoint}`);
            }
            throw error;
        }

        const gameStateAfterEnd = await program.account.gameState.fetch(gameStatePda);

        const roundStateAfterEnd = await program.account.roundState.fetch(roundStatePda);
        assert.isFalse(roundStateAfterEnd.isActive, "RoundState should be inactive after endRound");
        assert.isNotNull(roundStateAfterEnd.winnerIndex, "Winner index should be set");
        assert.isDefined(roundStateAfterEnd.winnerIndex, "Winner index should be defined");
        console.log(`Determined Winner Index: ${roundStateAfterEnd.winnerIndex}`);
        assert.deepStrictEqual(roundStateAfterEnd.revealedSeed, revealedSeedArrayForAssertion, "Revealed seed mismatch in RoundState");

        const expectedHouseFee = totalSolPotInRound
            .mul(new BN(gameStateAfterEnd.houseFeeBasisPoints))
            .div(new BN(10000));
        console.log(`Expected House Fee (calculated client-side): ${expectedHouseFee.toString()}`);
        assert.strictEqual(roundStateAfterEnd.houseSolFee.toString(), expectedHouseFee.toString(), "Stored houseSolFee in RoundState mismatch");

        const finalHouseWalletBalance = await connection.getBalance(houseWalletKeypair.publicKey);

        const expectedHouseWalletBalanceAfterFee = initialHouseWalletBalance + expectedHouseFee.toNumber();

        assert.strictEqual(finalHouseWalletBalance, expectedHouseWalletBalanceAfterFee, "House wallet balance did not increase by correct fee amount");

        const finalGamePotSolBalance = await connection.getBalance(gamePotSolPda);
        const expectedGamePotSolBalanceAfterFee = initialGamePotSolBalance - expectedHouseFee.toNumber();
        assert.strictEqual(finalGamePotSolBalance, expectedGamePotSolBalanceAfterFee, "GamePotSol balance after fee transfer is incorrect");

        const rewardsPotAccountData = await program.account.roundCashinoRewardsPot.fetch(roundCashinoRewardsPotAccountPda);
        assert.strictEqual(rewardsPotAccountData.roundId.toString(), currentRoundIdForSeed.toString(), "RoundCashinoRewardsPot roundId mismatch");
        assert.strictEqual(rewardsPotAccountData.totalMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundCashinoRewardsPot totalMinted mismatch");

        const rewardsPotAtaInfo = await anchor.utils.token.getAccount(connection, roundCashinoRewardsPotAta, "confirmed", TOKEN_2022_PROGRAM_ID);
        assert.strictEqual(rewardsPotAtaInfo.amount.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "$CASHINO in reward pot ATA mismatch");
        assert.strictEqual(roundStateAfterEnd.totalCashinoMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundState totalCashinoMinted mismatch");

        console.log("Verifying player $CASHINO reward entitlements...");
        assert.strictEqual(roundStateAfterEnd.playerCount, playerCountInRound, "Player count should remain same in RoundState entitlements section");

        let totalCalculatedCashinoRewardsFromEntitlements = new BN(0);
        for (let i = 0; i < playerCountInRound; i++) {
            const playerBetData = playersInRoundBeforeEnd.find(p => p.pubkey.equals(roundStateAfterEnd.playerCashinoRewards[i].player));
            assert.isDefined(playerBetData, `Player ${roundStateAfterEnd.playerCashinoRewards[i].player.toBase58()} not found in original bets for entitlement check`);

            const playerRewardEntitlement = roundStateAfterEnd.playerCashinoRewards[i];
            assert.isTrue(playerRewardEntitlement.player.equals(playerBetData.pubkey), `Player ${i} pubkey mismatch in rewards`);
            assert.strictEqual(playerRewardEntitlement.solBetAmount.toString(), playerBetData.amount.toString(), `Player ${i} SOL bet amount mismatch in rewards`);

            let expectedPlayerCashinoReward = new BN(0);
            if (totalSolPotInRound.gtn(0)) {
                expectedPlayerCashinoReward = playerBetData.amount
                    .mul(CASHINO_REWARD_PER_ROUND_UNITS_TS)
                    .div(totalSolPotInRound);
            }

            console.log(`  Player ${i} (${playerRewardEntitlement.player.toBase58()}): Bet ${playerBetData.amount.toString()}, Expected Reward ${expectedPlayerCashinoReward.toString()}, Actual Stored Reward ${playerRewardEntitlement.cashinoRewardAmount.toString()}`);
            assert.strictEqual(playerRewardEntitlement.cashinoRewardAmount.toString(), expectedPlayerCashinoReward.toString(), `Player ${i} $CASHINO reward amount mismatch`);
            assert.isFalse(playerRewardEntitlement.claimed, `Player ${i} $CASHINO reward should not be claimed yet`);
            totalCalculatedCashinoRewardsFromEntitlements = totalCalculatedCashinoRewardsFromEntitlements.add(playerRewardEntitlement.cashinoRewardAmount);
        }

        assert.isTrue(totalCalculatedCashinoRewardsFromEntitlements.lte(CASHINO_REWARD_PER_ROUND_UNITS_TS), "Total calculated rewards for players should not exceed total minted");
        if (totalSolPotInRound.gtn(0) && playerCountInRound > 0) {
            const difference = CASHINO_REWARD_PER_ROUND_UNITS_TS.sub(totalCalculatedCashinoRewardsFromEntitlements);
            assert.isTrue(difference.lt(new BN(playerCountInRound)), "Difference between total minted and sum of entitlements is too large (more than dust per player)");
        }


        console.log("endRound test completed successfully.");

    });
    // const CASHINO_REWARD_PER_ROUND_UNITS_TS = new BN(1_000_000);
    // let roundCashinoRewardsPotAccountPda: anchor.web3.PublicKey;
    // let roundCashinoRewardsPotAta: anchor.web3.PublicKey;
    // let initialHouseWalletBalance: bigint;
    // let initialGamePotSolBalance: bigint;

    // it("Ends the game round, pays house fee, mints $CASHINO, and records entitlements", async () => {
    //     console.log(`Test: Ending round with ID (for PDAs): ${currentRoundIdForSeed.toString()}`);
    //     const revealedSeedArray = Array.from(Buffer.from("test_seed_commitment_for_round_X".padEnd(32, '\0')));
    //     console.log(`Test: Using revealedSeed (first 5 bytes): ${revealedSeedArray.slice(0, 5)}`);

    //     const originalSeedString = "test_seed_commitment_for_round_X".padEnd(32, '\0');
    //     const seedBufferForReveal = Buffer.from(originalSeedString);
    //     const seedCommitment = Array.from(Buffer.from("test_seed_commitment_for_round_X".padEnd(32, '\0')));
    //     const seedCommitmentBuffer = Buffer.from(seedCommitment);
    //     const hashOfSeed = crypto.createHash('sha256').update(seedBufferForReveal).digest();
    //     const seedCommitmentForInstruction = Array.from(hashOfSeed);

    //     console.log(`Test: Original seed string for commit: "${originalSeedString}"`);
    //     console.log(`Test: Hash to be committed (first 5 bytes): ${seedCommitmentForInstruction.slice(0, 5)}`);

    //     [roundCashinoRewardsPotAccountPda] = anchor.web3.PublicKey.findProgramAddressSync(
    //         [Buffer.from("cashino_round_pot"), currentRoundIdForSeed.toBuffer("le", 8)],
    //         program.programId
    //     );

    //     console.log("CLIENT TEST (endRound): originalSeedStringForReveal:", originalSeedString);
    //     console.log("CLIENT TEST (endRound): seedBufferForReveal (first 5):", Array.from(seedBufferForReveal));

    //     roundCashinoRewardsPotAta = getAssociatedTokenAddressSync(
    //         mintKeypair.publicKey,
    //         roundCashinoRewardsPotAccountPda,
    //         true,
    //         TOKEN_2022_PROGRAM_ID,
    //         ASSOCIATED_TOKEN_PROGRAM_ID
    //     );
    //     console.log(`Test: Derived RoundCashinoRewardsPot PDA: ${roundCashinoRewardsPotAccountPda.toBase58()}`);
    //     console.log(`Test: Derived RoundCashinoRewardsPot ATA: ${roundCashinoRewardsPotAta.toBase58()}`);

    //     initialHouseWalletBalance = BigInt((await connection.getBalance(houseWalletKeypair.publicKey)).toString());
    //     initialGamePotSolBalance = BigInt((await connection.getBalance(gamePotSolPda)).toString());
    //     const roundStateBeforeEnd = await program.account.roundState.fetch(roundStatePda);
    //     const totalSolPotBeforeEnd = roundStateBeforeEnd.totalSolPot;

    //     console.log(`Test: Initial House Wallet Balance: ${initialHouseWalletBalance.toString()}`);
    //     console.log(`Test: Initial GamePotSol Balance: ${initialGamePotSolBalance.toString()}`);
    //     console.log(`Test: Total SOL in Pot (from RoundState): ${totalSolPotBeforeEnd.toString()}`);

    //     console.log("THE REVEALED SEED BEING SENT: ", revealedSeedArray);

    //     const endRoundIx = await program.methods
    //         .endRound(seedBufferForReveal, currentRoundIdForSeed)
    //         .accounts({
    //             authority: wallet.publicKey,
    //             gameState: gameStatePda,
    //             roundState: roundStatePda,
    //             gamePotSol: gamePotSolPda,
    //             houseWallet: houseWalletKeypair.publicKey,
    //             cashinoTokenMint: mintKeypair.publicKey,
    //             cashinoMintAuthorityPda: mintAuthorityPda,
    //             roundCashinoRewardsPotAccount: roundCashinoRewardsPotAccountPda,
    //             roundCashinoRewardsPotAta: roundCashinoRewardsPotAta,
    //             systemProgram: anchor.web3.SystemProgram.programId,
    //             tokenProgram: TOKEN_2022_PROGRAM_ID,
    //             associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    //             spinWheelProgram: program.programId,
    //         })
    //         .instruction();

    //     const transaction = new anchor.web3.Transaction();

    //     transaction.add(
    //         anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
    //             units: 400000,
    //         })
    //     );

    //     transaction.add(endRoundIx);

    //     let txSignature: string | undefined = undefined;
    //     try {
    //         txSignature = await provider.sendAndConfirm(transaction, [wallet.payer], {
    //             skipPreflight: true,
    //             commitment: "confirmed",
    //         });
    //         console.log(`Transaction ${txSignature} confirmed.`);
    //         console.log("Transaction for endGameRound confirmed by client.");

    //     } catch (error) {
    //         console.error("Error sending/confirming transaction:", error);
    //         if (txSignature) {
    //             console.log(`Failed tx: ${txSignature}. Check explorer or solana confirm -v ${txSignature}`);
    //         }
    //         throw error;
    //     }


    //     // const transactionSignature = await program.methods
    //     //     .endRound(seedBufferForReveal, currentRoundIdForSeed)
    //     //     .accounts({
    //     //         authority: wallet.publicKey,
    //     //         gameState: gameStatePda,
    //     //         roundState: roundStatePda,
    //     //         gamePotSol: gamePotSolPda,
    //     //         houseWallet: houseWalletKeypair.publicKey,
    //     //         cashinoTokenMint: mintKeypair.publicKey,
    //     //         cashinoMintAuthorityPda: mintAuthorityPda,
    //     //         roundCashinoRewardsPotAccount: roundCashinoRewardsPotAccountPda,
    //     //         roundCashinoRewardsPotAta: roundCashinoRewardsPotAta,
    //     //         systemProgram: anchor.web3.SystemProgram.programId,
    //     //         tokenProgram: TOKEN_2022_PROGRAM_ID,
    //     //         associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    //     //         spinWheelProgram: program.programId,
    //     //     })
    //     //     .rpc({ skipPreflight: true, commitment: "confirmed" });
    //     //
    //     // await confirmTx(transactionSignature);
    //     console.log("Transaction for endGameRound confirmed.");

    //     const gameStateAfter = await program.account.gameState.fetch(gameStatePda);
    //     const roundStateAfter = await program.account.roundState.fetch(roundStatePda);

    //     assert.isFalse(roundStateAfter.isActive, "RoundState should be inactive");
    //     assert.isNotNull(roundStateAfter.winnerIndex, "Winner index should be set");
    //     assert.isDefined(roundStateAfter.winnerIndex, "Winner index should be defined");
    //     console.log(`Test: Determined Winner Index: ${roundStateAfter.winnerIndex}`);
    //     assert.deepStrictEqual(roundStateAfter.revealedSeed, revealedSeedArray, "Revealed seed mismatch");

    //     const expectedHouseFee = totalSolPotBeforeEnd.mul(new BN(gameStateAfter.houseFeeBasisPoints)).div(new BN(10000));
    //     console.log(`Test: Expected House Fee: ${expectedHouseFee.toString()}`);
    //     assert.strictEqual(roundStateAfter.houseSolFee.toString(), expectedHouseFee.toString(), "Stored houseSolFee in RoundState mismatch");

    //     const finalHouseWalletBalance = BigInt((await connection.getBalance(houseWalletKeypair.publicKey)).toString());
    //     console.log(`Test: Final House Wallet Balance: ${finalHouseWalletBalance.toString()}`);
    //     assert.strictEqual(
    //         finalHouseWalletBalance.toString(),
    //         (initialHouseWalletBalance + BigInt(expectedHouseFee.toString())).toString(),
    //         "House wallet balance did not increase by correct fee amount"
    //     );

    //     const finalGamePotSolBalance = await connection.getBalance(gamePotSolPda);
    //     const expectedGamePotSolBalanceAfterFee = Number(initialGamePotSolBalance.toString()) - Number(expectedHouseFee.toString());
    //     console.log(`Test: Final GamePotSol Balance: ${finalGamePotSolBalance}, Expected after fee: ${expectedGamePotSolBalanceAfterFee}`);
    //     assert.strictEqual(finalGamePotSolBalance, expectedGamePotSolBalanceAfterFee, "GamePotSol balance after fee mismatch");

    //     const roundCashinoRewardsPotAccountData = await program.account.roundCashinoRewardsPot.fetch(roundCashinoRewardsPotAccountPda);
    //     assert.strictEqual(roundCashinoRewardsPotAccountData.roundId.toString(), currentRoundIdForSeed.toString(), "RoundCashinoRewardsPot roundId mismatch");
    //     assert.strictEqual(roundCashinoRewardsPotAccountData.totalMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundCashinoRewardsPot totalMinted mismatch");

    //     const rewardsPotAtaInfo = await getAccount(connection, roundCashinoRewardsPotAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    //     console.log(`Test: $CASHINO balance in Round's Reward Pot ATA: ${rewardsPotAtaInfo.amount.toString()}`);
    //     assert.strictEqual(rewardsPotAtaInfo.amount.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "$CASHINO in reward pot ATA mismatch");

    //     assert.strictEqual(roundStateAfter.totalCashinoMintedForRound.toString(), CASHINO_REWARD_PER_ROUND_UNITS_TS.toString(), "RoundState totalCashinoMinted mismatch");

    //     console.log("Test: Verifying player $CASHINO reward entitlements...");
    //     let totalCalculatedCashinoRewards = new BN(0);
    //     for (let i = 0; i < roundStateAfter.playerCount; i++) {
    //         const playerBetData = roundStateBeforeEnd.players[i];
    //         const playerRewardData = roundStateAfter.playerCashinoRewards[i];
    //         assert.isTrue(playerRewardData.player.equals(playerBetData.pubkey), `Player ${i} pubkey mismatch in rewards`);
    //         assert.strictEqual(playerRewardData.solBetAmount.toString(), playerBetData.amount.toString(), `Player ${i} SOL bet amount mismatch in rewards`);

    //         let expectedPlayerCashinoReward = new BN(0);
    //         if (totalSolPotBeforeEnd.gtn(0)) {
    //             expectedPlayerCashinoReward = playerBetData.amount
    //                 .mul(CASHINO_REWARD_PER_ROUND_UNITS_TS)
    //                 .div(totalSolPotBeforeEnd);
    //         }

    //         console.log(`  Player ${i} (${playerRewardData.player.toBase58()}): Bet ${playerBetData.amount.toString()}, Expected Reward ${expectedPlayerCashinoReward.toString()}, Actual Stored Reward ${playerRewardData.cashinoRewardAmount.toString()}`);
    //         assert.strictEqual(playerRewardData.cashinoRewardAmount.toString(), expectedPlayerCashinoReward.toString(), `Player ${i} $CASHINO reward amount mismatch`);
    //         assert.isFalse(playerRewardData.claimed, `Player ${i} $CASHINO reward should not be claimed yet`);
    //         totalCalculatedCashinoRewards = totalCalculatedCashinoRewards.add(playerRewardData.cashinoRewardAmount);
    //     }

    //     console.log(`Test: Total calculated $CASHINO rewards for players: ${totalCalculatedCashinoRewards.toString()}`);
    //     assert.isTrue(totalCalculatedCashinoRewards.lte(CASHINO_REWARD_PER_ROUND_UNITS_TS), "Total calculated rewards exceed total minted");

    //     console.log("endGameRound test completed successfully.");
    // });

    // it("Allows the correct winner to claim their SOL winnings", async () => {
    //     console.log(`Test: Claiming SOL winnings for round (PDA ID for PDAs): ${currentRoundIdForSeed.toString()}`);
    //     const roundStateInfo = await program.account.roundState.fetch(roundStatePda);

    //     assert.isFalse(roundStateInfo.isActive, "Round should be inactive to claim winnings.");
    //     assert.isNotNull(roundStateInfo.winnerIndex, "Winner index must be set in RoundState.");

    //     const winnerIndex = roundStateInfo.winnerIndex!; // Non-null assertion after check

    //     const winnerPlayerData = roundStateInfo.players[winnerIndex];
    //     const winnerPublicKey = winnerPlayerData.pubkey;

    //     console.log(`Test: Determined winner from RoundState: Pubkey ${winnerPublicKey.toBase58()} at index ${winnerIndex}`);

    //     // Determine the Keypair for the winner to sign the transaction
    //     let winnerSignerKeypair: anchor.web3.Keypair;
    //     const defaultWalletKeypair = (provider.wallet as anchor.Wallet).payer; // This is the Keypair for the default wallet

    //     if (defaultWalletKeypair.publicKey.equals(winnerPublicKey)) {
    //         winnerSignerKeypair = defaultWalletKeypair;
    //         console.log(`Test: Winner is the main provider wallet (${winnerPublicKey.toBase58()}).`);
    //     } else if (player2Keypair && player2Keypair.publicKey.equals(winnerPublicKey)) {
    //         winnerSignerKeypair = player2Keypair;
    //         console.log(`Test: Winner is Player 2 (${winnerPublicKey.toBase58()}), using player2Keypair to sign.`);
    //     } else {
    //         // This case implies the test doesn't have the private key for the determined winner.
    //         // For a positive test of claimSolWinnings, this is an issue.
    //         // Consider failing the test here or ensuring the test setup guarantees a known winner.
    //         throw new Error(
    //             `Winner ${winnerPublicKey.toBase58()} is not a controlled keypair in this test. Cannot sign claim transaction.`
    //         );
    //     }

    //     const calculatedWinningsBN = roundStateInfo.totalSolPot.sub(roundStateInfo.houseSolFee); // BN
    //     const calculatedWinningsBigInt = BigInt(calculatedWinningsBN.toString());
    //     console.log(`Test: Calculated SOL winnings for winner (BN): ${calculatedWinningsBN.toString()}`);
    //     console.log(`Test: Calculated SOL winnings for winner (BigInt): ${calculatedWinningsBigInt.toString()}`);

    //     // If winnings are zero or less, the behavior of balances will be different.
    //     // The claim might still proceed (e.g., to update some state if applicable) or might not change balances.
    //     if (calculatedWinningsBN.lten(0)) { // BN lten is less than or equal to zero
    //         console.warn(`Calculated winnings are ${calculatedWinningsBN.toString()}. The winner will only pay transaction fees.`);
    //     }

    //     const initialWinnerWalletBalance = BigInt(await connection.getBalance(winnerPublicKey));
    //     const initialGamePotSolBalanceOnChain = BigInt(await connection.getBalance(gamePotSolPda));
    //     console.log(`Test: Initial Winner (${winnerPublicKey.toBase58()}) Wallet Balance: ${initialWinnerWalletBalance.toString()}`);
    //     console.log(`Test: Initial GamePotSol PDA Balance (before claim): ${initialGamePotSolBalanceOnChain.toString()}`);

    //     // If the game pot is already zero and winnings are also zero (or less),
    //     // the claim instruction might not change balances or could even be uncallable if it expects funds.
    //     // Your Rust code allows claim even if winnings_amount is 0.
    //     if (initialGamePotSolBalanceOnChain === BigInt(0) && calculatedWinningsBN.lten(0)) {
    //         console.log("Game pot is empty and winnings are zero or less. Skipping balance change assertions for winner wallet related to winnings.");
    //         // You might still call claim if it has other effects or want to ensure it doesn't error.
    //     }

    //     const txBuilder = program.methods
    //         .claimSolWinnings(currentRoundIdForSeed) // currentRoundIdForSeed is BN, matches u64
    //         .accounts({
    //             winner: winnerPublicKey, // The Pubkey of the Signer
    //             roundState: roundStatePda,
    //             gamePotSol: gamePotSolPda,
    //             systemProgram: anchor.web3.SystemProgram.programId,
    //         });

    //     // Explicitly add the winnerSignerKeypair if it's not the default fee payer wallet.
    //     // Anchor automatically adds provider.wallet.payer if it's the fee payer.
    //     // Since `winner` is a Signer, if `winnerPublicKey` isn't the default wallet's,
    //     // we must explicitly provide its Keypair.
    //     if (!defaultWalletKeypair.publicKey.equals(winnerPublicKey)) {
    //         txBuilder.signers([winnerSignerKeypair]);
    //         console.log(`Test: Explicitly adding signer: ${winnerSignerKeypair.publicKey.toBase58()}`);
    //     }
    //     // If winnerSignerKeypair IS defaultWalletKeypair, Anchor handles its signature as it's the fee payer
    //     // AND its public key matches the `winner` account which is declared as Signer<'info>.

    //     const transactionSignature = await txBuilder.rpc({ skipPreflight: true, commitment: "confirmed" });

    //     await confirmTx(transactionSignature); // Uses global connection defined in the test setup
    //     console.log("Transaction for claimSolWinnings confirmed.");

    //     const finalWinnerWalletBalance = BigInt(await connection.getBalance(winnerPublicKey));
    //     const finalGamePotSolBalanceOnChain = BigInt(await connection.getBalance(gamePotSolPda));

    //     console.log(`Test: Final Winner Wallet Balance: ${finalWinnerWalletBalance.toString()}`);
    //     console.log(`Test: Final GamePotSol PDA Balance: ${finalGamePotSolBalanceOnChain.toString()}`);

    //     const expectedGamePotSolBalanceAfterClaim = initialGamePotSolBalanceOnChain - calculatedWinningsBigInt;

    //     assert.strictEqual(
    //         finalGamePotSolBalanceOnChain.toString(),
    //         expectedGamePotSolBalanceAfterClaim.toString(),
    //         "GamePotSol balance after claim mismatch"
    //     );

    //     // Calculate estimated transaction fee paid by the winner
    //     // This is an approximation as actual fees can vary slightly.
    //     // finalBalance = initialBalance + winnings - fee  => fee = initialBalance + winnings - finalBalance
    //     const estimatedFeePaidByWinner = initialWinnerWalletBalance + calculatedWinningsBigInt - finalWinnerWalletBalance;
    //     console.log(`Test: Estimated fee paid by winner: ${estimatedFeePaidByWinner.toString()} lamports.`);

    //     // Allow for a small discrepancy in fee calculation / other minor balance changes.
    //     const maxExpectedFee = BigInt(10000); // e.g., 0.00001 SOL, a typical fee for a simple transaction. Adjust if needed.

    //     if (calculatedWinningsBigInt > BigInt(0)) {
    //         assert.isTrue(
    //             finalWinnerWalletBalance >= initialWinnerWalletBalance + calculatedWinningsBigInt - maxExpectedFee,
    //             `Winner wallet balance should increase by approx winnings. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}, Winnings: ${calculatedWinningsBigInt}`
    //         );
    //         // Ensure it didn't increase by MORE than winnings significantly (e.g. some other source of funds)
    //         assert.isTrue(
    //             finalWinnerWalletBalance <= initialWinnerWalletBalance + calculatedWinningsBigInt,
    //             `Winner wallet balance increase too large. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}, Winnings: ${calculatedWinningsBigInt}`
    //         );

    //     } else { // Winnings were zero or negative
    //         assert.isTrue(
    //             finalWinnerWalletBalance <= initialWinnerWalletBalance, // Balance should decrease or stay same (if fee was 0, unlikely)
    //             `Winner wallet balance should decrease or stay same if no winnings. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}`
    //         );
    //         assert.isTrue(
    //             finalWinnerWalletBalance >= initialWinnerWalletBalance - maxExpectedFee,
    //             `Winner wallet balance decreased more than expected max fee. Final: ${finalWinnerWalletBalance}, Initial: ${initialWinnerWalletBalance}`
    //         );
    //     }

    //     console.log(`claimSolWinnings test for winner ${winnerPublicKey.toBase58()} completed successfully.`);
    // });

});