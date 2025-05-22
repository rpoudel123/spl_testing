import * as anchor from "@coral-xyz/anchor";
import { BN } from "bn.js";
import {
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    getAccount,
    getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { TestState } from "./state";

describe('Spin Wheel Game Setup', () => {
    let testState: TestState;

    before(async () => {
        testState = new TestState({ useGloballySharedMint: true });

        console.log(`Using $CASHINO Mint for game tests: ${testState.cashinoMintPublicKey.toBase58()} (this should be the shared mint)`);
        console.log(`House wallet for game tests: ${testState.houseWalletKeypair.publicKey.toBase58()}`);

        console.log(`Airdropping SOL to Player 2 (${testState.player2Keypair.publicKey.toBase58()})...`);
        const airdropSignature = await testState.connection.requestAirdrop(
            testState.player2Keypair.publicKey,
            2 * anchor.web3.LAMPORTS_PER_SOL
        );
        await testState.confirmTx(airdropSignature);
        console.log("Airdrop to Player 2 confirmed.");

        console.log(`Airdropping SOL to House Wallet (${testState.houseWalletKeypair.publicKey.toBase58()})...`);
        const houseAirdropSig = await testState.connection.requestAirdrop(
            testState.houseWalletKeypair.publicKey,
            1 * anchor.web3.LAMPORTS_PER_SOL
        );
        await testState.confirmTx(houseAirdropSig);
        console.log("Airdrop to House Wallet confirmed.");
    });

    it("Initializes Game Settings", async () => {
        const initialHouseFeeBasisPoints = 10;

        console.log(`Test: Initializing GameState at PDA: ${testState.gameStatePda.toBase58()}`);
        console.log(`Test: Authority (Payer): ${testState.wallet.publicKey.toBase58()}`);
        console.log(`Test: House Wallet to be set: ${testState.houseWalletKeypair.publicKey.toBase58()}`);
        console.log(`Test: House Fee Basis Points to set: ${initialHouseFeeBasisPoints.toString()}`);
        console.log(`Test: $CASHINO Mint to set: ${testState.cashinoMintPublicKey.toBase58()}`);

        const transactionSignature = await testState.program.methods
            .initializeGameSettings(initialHouseFeeBasisPoints)
            .accounts({
                authority: testState.wallet.publicKey,
                gameState: testState.gameStatePda,
                houseWallet: testState.houseWalletKeypair.publicKey,
                cashinoTokenMint: testState.cashinoMintPublicKey,
                token2022Program: TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        if (!transactionSignature) {
            throw new Error("initializeGameSettings RPC returned undefined transaction signature.");
        }
        await testState.confirmTx(transactionSignature);
        console.log("Transaction for initializeGameSettings confirmed by client.");

        const gameStateAccount = await testState.program.account.gameState.fetch(testState.gameStatePda);
        console.log("Fetched GameState Account:", {
            authority: gameStateAccount.authority.toBase58(),
            houseWallet: gameStateAccount.houseWallet.toBase58(),
            houseFeeBasisPoints: gameStateAccount.houseFeeBasisPoints,
            roundCounter: gameStateAccount.roundCounter.toString(),
            isInitialized: gameStateAccount.isInitialized,
            cashinoMint: gameStateAccount.cashinoMint.toBase58(),
        });

        assert.isTrue(gameStateAccount.authority.equals(testState.wallet.publicKey), "GameState authority mismatch");
        assert.isTrue(gameStateAccount.houseWallet.equals(testState.houseWalletKeypair.publicKey), "GameState houseWallet mismatch");
        assert.strictEqual(gameStateAccount.houseFeeBasisPoints, initialHouseFeeBasisPoints, "GameState houseFeeBasisPoints mismatch");
        assert.isTrue(gameStateAccount.cashinoMint.equals(testState.cashinoMintPublicKey), "GameState cashinoMint mismatch with shared mint");
        assert.strictEqual(gameStateAccount.isInitialized, true, "GameState should be initialized");
        assert.strictEqual(gameStateAccount.roundCounter.toNumber(), 0, "GameState roundCounter should be 0");

        console.log("GameState initialized and verified successfully.");
    });

    it("Deposits SOL to platform escrow for players", async () => {
        assert.isDefined(testState.userPlatformEscrowPda, "UserPlatformEscrow PDA for player 1 should be derived");
        assert.isDefined(testState.player2PlatformEscrowPda, "UserPlatformEscrow PDA for player 2 should be derived");

        const player1 = testState.wallet;
        const depositAmountPlayer1 = new BN(1 * anchor.web3.LAMPORTS_PER_SOL);

        console.log(`\n--- Player 1 (${player1.publicKey.toBase58()}) depositing SOL to escrow ---`);
        console.log(`Escrow PDA: ${testState.userPlatformEscrowPda!.toBase58()}`);
        console.log(`Deposit Amount: ${depositAmountPlayer1.toString()}`);

        const initialPlayer1WalletBalance = await testState.connection.getBalance(player1.publicKey);
        let initialEscrowPdaLamportsP1 = 0;
        let initialEscrowAccountDataP1;
        let p1EscrowExisted = true; // Assume it exists, try to fetch
        try {
            const fetchedAccount = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
            initialEscrowAccountDataP1 = fetchedAccount;
            initialEscrowPdaLamportsP1 = await testState.connection.getBalance(testState.userPlatformEscrowPda!);
            console.log("Player 1 escrow account already exists. Initial data balance:", initialEscrowAccountDataP1.balance.toString(), "PDA Lamports:", initialEscrowPdaLamportsP1);
        } catch (e) {
            p1EscrowExisted = false;
            console.log("Player 1 escrow account does not exist yet or failed to fetch, will be initialized.");
            initialEscrowAccountDataP1 = { balance: new BN(0) }; // Simulate for calculation if new
        }

        const tx1Signature = await testState.program.methods
            .depositSol(depositAmountPlayer1)
            .accounts({
                user: player1.publicKey,
                userPlatformEscrow: testState.userPlatformEscrowPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });
        await testState.confirmTx(tx1Signature);
        console.log("Player 1 deposit transaction confirmed.");

        const escrowAccountInfoAfterP1 = await testState.connection.getAccountInfo(testState.userPlatformEscrowPda!);
        assert.isNotNull(escrowAccountInfoAfterP1, "P1 Escrow PDA should exist after deposit.");
        const escrowPdaLamportsAfterP1 = escrowAccountInfoAfterP1!.lamports;
        const escrowAccountDataAfterP1 = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
        const player1WalletBalanceAfter = await testState.connection.getBalance(player1.publicKey);

        const expectedEscrowAccountDataBalanceP1 = (p1EscrowExisted ? initialEscrowAccountDataP1.balance : new BN(0)).add(depositAmountPlayer1);
        assert.strictEqual(escrowAccountDataAfterP1.balance.toString(), expectedEscrowAccountDataBalanceP1.toString(), "Player 1 escrow data balance mismatch");

        let expectedPdaLamportsP1;
        if (!p1EscrowExisted) {
            // Account was created. Its balance should be rent for its new size + deposit amount
            const rentForActualSize = await testState.connection.getMinimumBalanceForRentExemption(escrowAccountInfoAfterP1!.data.length);
            expectedPdaLamportsP1 = rentForActualSize + depositAmountPlayer1.toNumber();
        } else {
            expectedPdaLamportsP1 = initialEscrowPdaLamportsP1 + depositAmountPlayer1.toNumber();
        }
        assert.strictEqual(escrowPdaLamportsAfterP1, expectedPdaLamportsP1, "Player 1 escrow PDA lamports mismatch");
        expect(player1WalletBalanceAfter).to.be.lessThan(initialPlayer1WalletBalance - depositAmountPlayer1.toNumber() + (p1EscrowExisted ? 10000 : -1000000)); // Approx check, wider margin if rent was also paid


        // Player 2 deposit
        const player2 = testState.player2Keypair;
        const depositAmountPlayer2 = new BN(0.5 * anchor.web3.LAMPORTS_PER_SOL);

        console.log(`\n--- Player 2 (${player2.publicKey.toBase58()}) depositing SOL to escrow ---`);
        console.log(`Escrow PDA: ${testState.player2PlatformEscrowPda!.toBase58()}`);
        console.log(`Deposit Amount: ${depositAmountPlayer2.toString()}`);

        const initialPlayer2WalletBalance = await testState.connection.getBalance(player2.publicKey);
        let initialEscrowPdaLamportsP2 = 0;
        let initialEscrowAccountDataP2;
        let p2EscrowExisted = true;
        try {
            const fetchedAccount = await testState.program.account.userPlatformEscrow.fetch(testState.player2PlatformEscrowPda!);
            initialEscrowAccountDataP2 = fetchedAccount;
            initialEscrowPdaLamportsP2 = await testState.connection.getBalance(testState.player2PlatformEscrowPda!);
            console.log("Player 2 escrow account already exists. Initial data balance:", initialEscrowAccountDataP2.balance.toString(), "PDA Lamports:", initialEscrowPdaLamportsP2);
        } catch (e) {
            p2EscrowExisted = false;
            console.log("Player 2 escrow account does not exist yet or failed to fetch, will be initialized.");
            initialEscrowAccountDataP2 = { balance: new BN(0) };
        }

        const tx2Signature = await testState.program.methods
            .depositSol(depositAmountPlayer2)
            .accounts({
                user: player2.publicKey,
                userPlatformEscrow: testState.player2PlatformEscrowPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player2])
            .rpc({ skipPreflight: true, commitment: "confirmed" });
        await testState.confirmTx(tx2Signature);
        console.log("Player 2 deposit transaction confirmed.");

        const escrowAccountInfoAfterP2 = await testState.connection.getAccountInfo(testState.player2PlatformEscrowPda!);
        assert.isNotNull(escrowAccountInfoAfterP2, "P2 Escrow PDA should exist after deposit.");
        const escrowPdaLamportsAfterP2 = escrowAccountInfoAfterP2!.lamports;
        const escrowAccountDataAfterP2 = await testState.program.account.userPlatformEscrow.fetch(testState.player2PlatformEscrowPda!);
        const player2WalletBalanceAfter = await testState.connection.getBalance(player2.publicKey);

        const expectedEscrowAccountDataBalanceP2 = (p2EscrowExisted ? initialEscrowAccountDataP2.balance : new BN(0)).add(depositAmountPlayer2);
        assert.strictEqual(escrowAccountDataAfterP2.balance.toString(), expectedEscrowAccountDataBalanceP2.toString(), "Player 2 escrow data balance mismatch");

        let expectedPdaLamportsP2;
        if (!p2EscrowExisted) {
            const rentForActualSize = await testState.connection.getMinimumBalanceForRentExemption(escrowAccountInfoAfterP2!.data.length);
            expectedPdaLamportsP2 = rentForActualSize + depositAmountPlayer2.toNumber();
        } else {
            expectedPdaLamportsP2 = initialEscrowPdaLamportsP2 + depositAmountPlayer2.toNumber();
        }
        assert.strictEqual(escrowPdaLamportsAfterP2, expectedPdaLamportsP2, "Player 2 escrow PDA lamports mismatch");
        expect(player2WalletBalanceAfter).to.be.lessThan(initialPlayer2WalletBalance - depositAmountPlayer2.toNumber() + (p2EscrowExisted ? 10000 : -1000000));

        console.log("depositSol test completed successfully.");
    });

    it("Starts a new game round correctly", async () => {
        const gameStateAccountBefore = await testState.program.account.gameState.fetch(testState.gameStatePda);
        testState.currentRoundIdForSeed = gameStateAccountBefore.roundCounter;
        testState.deriveRoundPdAs();

        assert.isDefined(testState.roundStatePda, "RoundState PDA should be derived");
        assert.isDefined(testState.gamePotSolPda, "GamePotSol PDA should be derived");

        console.log(`Test: Current roundCounter from GameState (for PDA seed): ${testState.currentRoundIdForSeed.toString()}`);
        console.log(`Test: Derived RoundState PDA for new round: ${testState.roundStatePda!.toBase58()}`);
        console.log(`Test: Derived GamePotSol PDA for new round: ${testState.gamePotSolPda!.toBase58()}`);

        const roundDuration = new BN(10);

        console.log(`Test: Calling startNewRound with roundIdForSeed: ${testState.currentRoundIdForSeed.toString()}`);
        console.log(`Test: Round Duration: ${roundDuration.toString()}`);

        const transactionSignature = await testState.program.methods
            .startNewRound(
                testState.seedCommitmentBuffer,
                roundDuration,
                testState.currentRoundIdForSeed
            )
            .accounts({
                authority: testState.wallet.publicKey,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                gamePot: testState.gamePotSolPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(transactionSignature);
        console.log("Transaction for startNewRound confirmed.");

        const gameStateAccountAfter = await testState.program.account.gameState.fetch(testState.gameStatePda);
        const expectedNewRoundCounter = testState.currentRoundIdForSeed.add(new BN(1));
        console.log(`Test: GameState roundCounter after: ${gameStateAccountAfter.roundCounter.toString()}, Expected: ${expectedNewRoundCounter.toString()}`);
        assert.strictEqual(
            gameStateAccountAfter.roundCounter.toString(),
            expectedNewRoundCounter.toString(),
            "GameState roundCounter should be incremented"
        );

        const roundStateAccount = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        console.log("Fetched RoundState Account Data:", {
            id: roundStateAccount.id.toString(),
            status_discriminant: roundStateAccount.statusDiscriminant,
            playerCount: roundStateAccount.playerCount,
            totalSolPot: roundStateAccount.totalSolPot.toString(),
            seedCommitment: roundStateAccount.seedCommitment.toString(),
            revealed_seed_val: roundStateAccount.revealedSeed,
            startTime: roundStateAccount.startTime.toString(),
            endTime: roundStateAccount.endTime.toString(),
        });

        assert.strictEqual(
            roundStateAccount.id.toString(),
            expectedNewRoundCounter.toString(),
            "RoundState ID should match new game counter"
        );
        assert.strictEqual(roundStateAccount.statusDiscriminant, 0, "RoundState should be active (discriminant 0)");
        assert.strictEqual(roundStateAccount.totalSolPot.toNumber(), 0, "RoundState totalSolPot should be 0");
        assert.strictEqual(roundStateAccount.playerCount, 0, "RoundState playerCount should be 0");
        assert.isTrue(roundStateAccount.startTime.toNumber() > 0, "RoundState start time should be set");
        assert.isTrue(roundStateAccount.endTime.toNumber() > roundStateAccount.startTime.toNumber(), "RoundState end time should be after start time");
        expect(Buffer.from(roundStateAccount.seedCommitment)).to.deep.equal(testState.seedCommitmentBuffer, "Seed commitment mismatch");


        assert.strictEqual(roundStateAccount.hasRevealedSeedVal, 0, "has_revealed_seed_val should be 0 (false)");
        assert.strictEqual(roundStateAccount.hasWinnerVal, 0, "has_winner_val should be 0 (false)");
        assert.strictEqual(roundStateAccount.winnerIndexVal, 0, "winner_index_val should be 0 (or your sentinel for None)");


        const gamePotAccount = await testState.program.account.gamePotSol.fetch(testState.gamePotSolPda!);
        assert.isNotNull(gamePotAccount, "GamePotSol account should be created");
        console.log(`GamePotSol account ${testState.gamePotSolPda!.toBase58()} created successfully.`);

        console.log("startNewRound test completed successfully.");
    });

    it("Allows players to place SOL bets from escrow", async () => {
        assert.isDefined(testState.currentRoundIdForSeed, "Round ID should be defined");
        assert.isDefined(testState.roundStatePda, "Round state pda is not defined");
        assert.isDefined(testState.gamePotSolPda, "gamePotSolPda is not defined");
        assert.isDefined(testState.userPlatformEscrowPda, "Player 1 UserPlatformEscrow PDA should be derived");
        assert.isDefined(testState.player2PlatformEscrowPda, "Player 2 UserPlatformEscrow PDA should be derived");

        const player1 = testState.wallet;
        const betAmountPlayer1Lamports = new BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);

        console.log(`\n--- Player 1 (${player1.publicKey.toBase58()}) placing first bet from escrow ---`);
        console.log(`Target Round ID for PDAs: ${testState.currentRoundIdForSeed.toString()}`);
        console.log(`Bet Amount (Lamports): ${betAmountPlayer1Lamports.toString()}`);

        const initialP1EscrowAccount = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
        const initialP1EscrowLamports = await testState.connection.getBalance(testState.userPlatformEscrowPda!);
        const initialGamePotBalance = await testState.connection.getBalance(testState.gamePotSolPda!);
        let roundStateBeforeP1Bet = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const initialRoundPotValue = roundStateBeforeP1Bet.totalSolPot;
        const initialPlayerCount = roundStateBeforeP1Bet.playerCount;

        const tx1Signature = await testState.program.methods
            .placeSolBet(testState.currentRoundIdForSeed, betAmountPlayer1Lamports)
            .accounts({
                player: player1.publicKey,
                userPlatformEscrow: testState.userPlatformEscrowPda!,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                gamePot: testState.gamePotSolPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(tx1Signature);
        console.log("Player 1 bet transaction confirmed.");

        const roundStateAfterP1Bet = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const gamePotBalanceAfterP1Bet = await testState.connection.getBalance(testState.gamePotSolPda!);
        const p1EscrowAccountAfter = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
        const p1EscrowLamportsAfter = await testState.connection.getBalance(testState.userPlatformEscrowPda!);

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
            initialGamePotBalance + betAmountPlayer1Lamports.toNumber(),
            "GamePot SOL balance incorrect after P1 first bet"
        );
        assert.strictEqual(
            p1EscrowAccountAfter.balance.toString(),
            initialP1EscrowAccount.balance.sub(betAmountPlayer1Lamports).toString(),
            "Player 1 escrow data balance incorrect after bet"
        );
        assert.strictEqual(
            p1EscrowLamportsAfter,
            initialP1EscrowLamports - betAmountPlayer1Lamports.toNumber(),
            "Player 1 escrow PDA lamports incorrect after bet"
        );


        // Player 2 places bet
        const player2 = testState.player2Keypair;
        const betAmountPlayer2Lamports = new BN(0.05 * anchor.web3.LAMPORTS_PER_SOL);
        console.log(`\n--- Player 2 (${player2.publicKey.toBase58()}) placing bet from escrow ---`);
        console.log(`Bet Amount (Lamports): ${betAmountPlayer2Lamports.toString()}`);

        const initialP2EscrowAccount = await testState.program.account.userPlatformEscrow.fetch(testState.player2PlatformEscrowPda!);
        const initialP2EscrowLamports = await testState.connection.getBalance(testState.player2PlatformEscrowPda!);
        const initialGamePotBalanceP2 = await testState.connection.getBalance(testState.gamePotSolPda!);
        let roundStateBeforeP2Bet = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const playerCountBeforeP2 = roundStateBeforeP2Bet.playerCount;


        const tx2Signature = await testState.program.methods
            .placeSolBet(testState.currentRoundIdForSeed, betAmountPlayer2Lamports)
            .accounts({
                player: player2.publicKey,
                userPlatformEscrow: testState.player2PlatformEscrowPda!,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                gamePot: testState.gamePotSolPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player2])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(tx2Signature);
        console.log("Player 2 bet transaction confirmed.");

        const roundStateAfterP2Bet = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const gamePotBalanceAfterP2Bet = await testState.connection.getBalance(testState.gamePotSolPda!);
        const p2EscrowAccountAfter = await testState.program.account.userPlatformEscrow.fetch(testState.player2PlatformEscrowPda!);
        const p2EscrowLamportsAfter = await testState.connection.getBalance(testState.player2PlatformEscrowPda!);

        assert.strictEqual(roundStateAfterP2Bet.playerCount, playerCountBeforeP2 + 1, "Player count should increment for new player (P2)");
        const expectedTotalPotAfterP2 = roundStateAfterP1Bet.totalSolPot.add(betAmountPlayer2Lamports);
        assert.strictEqual(
            roundStateAfterP2Bet.totalSolPot.toString(),
            expectedTotalPotAfterP2.toString(),
            "RoundState totalSolPot incorrect after P2 bet"
        );
        assert.isTrue(roundStateAfterP2Bet.players[playerCountBeforeP2].pubkey.equals(player2.publicKey), "Player 2 pubkey not recorded correctly");
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
        assert.strictEqual(
            p2EscrowAccountAfter.balance.toString(),
            initialP2EscrowAccount.balance.sub(betAmountPlayer2Lamports).toString(),
            "Player 2 escrow data balance incorrect after bet"
        );
        assert.strictEqual(
            p2EscrowLamportsAfter,
            initialP2EscrowLamports - betAmountPlayer2Lamports.toNumber(),
            "Player 2 escrow PDA lamports incorrect after bet"
        );

        // Player 1 places an additional bet
        const additionalBetP1Lamports = new BN(0.02 * anchor.web3.LAMPORTS_PER_SOL);
        console.log(`\n--- Player 1 (${player1.publicKey.toBase58()}) placing additional bet from escrow ---`);
        console.log(`Additional Bet Amount (Lamports): ${additionalBetP1Lamports.toString()}`);

        const initialP1EscrowAccountAdd = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
        const initialP1EscrowLamportsAdd = await testState.connection.getBalance(testState.userPlatformEscrowPda!);
        const initialGamePotBalanceP3 = await testState.connection.getBalance(testState.gamePotSolPda!);
        let roundStateBeforeP1Add = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const playerCountBeforeP1Add = roundStateBeforeP1Add.playerCount;
        const player1DataIndex = roundStateBeforeP1Add.players.findIndex(p => p.pubkey.equals(player1.publicKey));

        const tx3Signature = await testState.program.methods
            .placeSolBet(testState.currentRoundIdForSeed, additionalBetP1Lamports)
            .accounts({
                player: player1.publicKey,
                userPlatformEscrow: testState.userPlatformEscrowPda!,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                gamePot: testState.gamePotSolPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([player1.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(tx3Signature);
        console.log("Player 1 additional bet transaction confirmed.");

        const roundStateAfterP1AddBet = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const gamePotBalanceAfterP1AddBet = await testState.connection.getBalance(testState.gamePotSolPda!);
        const p1EscrowAccountAfterAdd = await testState.program.account.userPlatformEscrow.fetch(testState.userPlatformEscrowPda!);
        const p1EscrowLamportsAfterAdd = await testState.connection.getBalance(testState.userPlatformEscrowPda!);

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
        assert.strictEqual(
            p1EscrowAccountAfterAdd.balance.toString(),
            initialP1EscrowAccountAdd.balance.sub(additionalBetP1Lamports).toString(),
            "Player 1 escrow data balance incorrect after additional bet"
        );
        assert.strictEqual(
            p1EscrowLamportsAfterAdd,
            initialP1EscrowLamportsAdd - additionalBetP1Lamports.toNumber(),
            "Player 1 escrow PDA lamports incorrect after additional bet"
        );

        console.log("placeSolBet from escrow test completed successfully.");

        const gracePeriodMs = 10000;
        console.log(`Client: Waiting ${gracePeriodMs / 1000}s for round to ensure it has ended...`);
        await new Promise(resolve => setTimeout(resolve, gracePeriodMs));
    });

    it("Finalizes the round (determines winner, pays fee, records winner details)", async () => {
        assert.isDefined(testState.currentRoundIdForSeed, "currentRoundIdForSeed must be set");
        assert.isDefined(testState.roundStatePda, "roundStatePda must be set");
        assert.isDefined(testState.gamePotSolPda, "gamePotSolPda must be set");
        assert.isDefined(testState.gameStatePda, "gameStatePda must be set");
        assert.isDefined(testState.houseWalletKeypair, "houseWalletKeypair must be set");

        const roundStateBeforeFinalize = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const initialHouseBal = await testState.connection.getBalance(testState.houseWalletKeypair.publicKey);
        const potBalBefore = await testState.connection.getBalance(testState.gamePotSolPda!); // Lamports in the pot PDA
        const totalSolPotInStateBefore = roundStateBeforeFinalize.totalSolPot; // Sum of bets from RoundState

        console.log("Pre-Finalize:", {
            roundId: roundStateBeforeFinalize.id.toString(),
            status: roundStateBeforeFinalize.statusDiscriminant,
            totalSolPotInState: totalSolPotInStateBefore.toString(),
            potPdaLamports: potBalBefore,
            initialHouseBal,
        });

        const revealBuf = testState.seedCommitmentBuffer;

        const ix = await testState.program.methods
            .finalizeRound(revealBuf, testState.currentRoundIdForSeed!)
            .accounts({
                authority: testState.wallet.publicKey,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                gamePotSol: testState.gamePotSolPda!,
                houseWallet: testState.houseWalletKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .instruction();

        const tx = new anchor.web3.Transaction()
            .add(anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })) // Slightly increased CU limit just in case
            .add(ix);
        tx.feePayer = testState.wallet.publicKey;
        const { blockhash } = await testState.connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;

        // Simulate first
        const sim = await testState.connection.simulateTransaction(tx, [testState.wallet.payer]);
        console.log("Simulation account order:", ix.keys.map(k => k.pubkey.toBase58()));
        console.log("Simulation logs:\n" + (sim.value.logs || []).join("\n"));
        if (sim.value.err) {
            console.warn("Simulation reported an error:", sim.value.err);
            // For easier debugging if simulation fails:
            const roundStateCheck = await testState.program.account.roundState.fetch(testState.roundStatePda!).catch(e => console.error("Error fetching round state after sim fail", e));
            if (roundStateCheck) console.log("Round state on sim error:", roundStateCheck.statusDiscriminant, roundStateCheck.endTime.toString());
        }


        try {
            const sig = await testState.provider.sendAndConfirm(tx, [testState.wallet.payer], {
                skipPreflight: false, // Already simulated
                commitment: "confirmed",
            });
            await testState.confirmTx(sig);
            console.log("finalizeRound transaction confirmed:", sig);
        } catch (err) {
            console.error("finalizeRound failed—see logs above.");
            if (err.logs) console.error("Program logs from error:", err.logs);
            throw err;
        }

        const roundAfter = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const gameStateAfter = await testState.program.account.gameState.fetch(testState.gameStatePda!); // Fetch to get current house_fee_basis_points
        const finalHouseBal = await testState.connection.getBalance(testState.houseWalletKeypair.publicKey);
        const finalPotPdaLamports = await testState.connection.getBalance(testState.gamePotSolPda!);

        console.log("Post-Finalize (RoundState Data):", {
            id: roundAfter.id.toString(),
            statusDiscriminant: roundAfter.statusDiscriminant,
            totalSolPot: roundAfter.totalSolPot.toString(), // Sum of bets
            playerCount: roundAfter.playerCount,
            hasWinnerVal: roundAfter.hasWinnerVal,
            winnerIndexVal: roundAfter.winnerIndexVal,
            houseSolFee: roundAfter.houseSolFee.toString(),
            hasRevealedSeedVal: roundAfter.hasRevealedSeedVal,
            winnerSolPubkey: roundAfter.winnerSolPubkey.toBase58(),
            winnerSolAmount: roundAfter.winnerSolAmount.toString(),
            winnerSolClaimed: roundAfter.winnerSolClaimed,
        });
        console.log("Post-Finalize (Balances):", {
            finalHouseBal,
            finalPotPdaLamports,
        });

        assert.strictEqual(roundAfter.hasWinnerVal, 1, "hasWinnerVal should be 1 (true)");
        assert.isTrue(roundAfter.winnerIndexVal < roundAfter.playerCount, "winnerIndexVal must be a valid index");
        assert.isFalse(roundAfter.winnerSolPubkey.equals(anchor.web3.PublicKey.default), "winnerSolPubkey should be set");
        assert.strictEqual(roundAfter.winnerSolClaimed, 0, "winnerSolClaimed should be 0 (false)");
        assert.strictEqual(roundAfter.statusDiscriminant, 1, "status_discriminant should be AwaitingSolClaim (1)"); // 1 is AwaitingSolClaim
        assert.strictEqual(roundAfter.hasRevealedSeedVal, 1, "hasRevealedSeedVal should be 1 (true)");

        // House fee calculation
        const expectedHouseFeeBN = new BN(totalSolPotInStateBefore as any) // Use the pot value from RoundState before finalize
            .mul(new BN(gameStateAfter.houseFeeBasisPoints))
            .div(new BN(10_000));

        assert.isTrue(
            roundAfter.houseSolFee.eq(expectedHouseFeeBN),
            `houseSolFee incorrect. Expected ${expectedHouseFeeBN.toString()}, got ${roundAfter.houseSolFee.toString()}`
        );
        assert.strictEqual(
            finalHouseBal,
            initialHouseBal + expectedHouseFeeBN.toNumber(),
            "House wallet balance should increase by exactly the fee"
        );

        // Winner SOL amount check in RoundState
        const expectedWinnerSolAmount = totalSolPotInStateBefore.sub(expectedHouseFeeBN);
        assert.isTrue(
            roundAfter.winnerSolAmount.eq(expectedWinnerSolAmount),
            `winnerSolAmount in RoundState incorrect. Expected ${expectedWinnerSolAmount.toString()}, got ${roundAfter.winnerSolAmount.toString()}`
        );

        // Pot PDA lamports should only decrease by the house fee at this stage
        const expectedFinalPotPdaLamports = potBalBefore - expectedHouseFeeBN.toNumber();
        assert.strictEqual(
            finalPotPdaLamports,
            expectedFinalPotPdaLamports,
            `Pot SOL PDA lamports incorrect. Should only decrease by fee. Expected ${expectedFinalPotPdaLamports}, got ${finalPotPdaLamports}`
        );

        const gamePotAccountInfo = await testState.connection.getAccountInfo(testState.gamePotSolPda!);
        assert.isNotNull(gamePotAccountInfo, "GamePotSol account should still exist.");
        const rentForPot = await testState.connection.getMinimumBalanceForRentExemption(gamePotAccountInfo!.data.length);
        assert.isTrue(
            finalPotPdaLamports >= rentForPot,
            `Pot must remain rent‐exempt (has ${finalPotPdaLamports}, needs ≥ ${rentForPot})`
        );

        console.log("finalizeRound (Step 1 - Record Winner & Pay Fee) test assertions passed.");
    });

    it("Winner claims SOL winnings", async () => {
        assert.isDefined(testState.currentRoundIdForSeed, "currentRoundIdForSeed must be set");
        assert.isDefined(testState.roundStatePda, "roundStatePda must be set");
        assert.isDefined(testState.gamePotSolPda, "gamePotSolPda must be set");

        const roundStateBeforeClaim = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(roundStateBeforeClaim.statusDiscriminant, 1, "Round status should be AwaitingSolClaim (1)");
        assert.strictEqual(roundStateBeforeClaim.winnerSolClaimed, 0, "SOL winnings should not be claimed yet");
        assert.isTrue(roundStateBeforeClaim.winnerSolAmount.gtn(0), "Winner SOL amount should be greater than 0 for a claim to be meaningful");

        const winnerPubkey = roundStateBeforeClaim.winnerSolPubkey;
        const winningsToClaim = roundStateBeforeClaim.winnerSolAmount;

        let winnerSigner: anchor.web3.Keypair;
        let winnerEscrowPda: anchor.web3.PublicKey;

        if (winnerPubkey.equals(testState.wallet.publicKey)) {
            winnerSigner = testState.wallet.payer;
            winnerEscrowPda = testState.userPlatformEscrowPda!;
            console.log(`Player 1 (Wallet: ${testState.wallet.publicKey.toBase58()}) is the winner.`);
        } else if (winnerPubkey.equals(testState.player2Keypair.publicKey)) {
            winnerSigner = testState.player2Keypair;
            winnerEscrowPda = testState.player2PlatformEscrowPda!;
            console.log(`Player 2 (Wallet: ${testState.player2Keypair.publicKey.toBase58()}) is the winner.`);
        } else {
            throw new Error(`Winner pubkey ${winnerPubkey.toBase58()} does not match Player 1 or Player 2 in test setup.`);
        }
        console.log(`Winner Escrow PDA: ${winnerEscrowPda.toBase58()}`);
        console.log(`Winnings to claim: ${winningsToClaim.toString()}`);

        const initialWinnerEscrowAccount = await testState.program.account.userPlatformEscrow.fetch(winnerEscrowPda);
        const initialWinnerEscrowLamports = await testState.connection.getBalance(winnerEscrowPda);
        const initialGamePotLamports = await testState.connection.getBalance(testState.gamePotSolPda!);

        console.log("Pre-Claim Balances:", {
            winnerEscrowAccountBalance: initialWinnerEscrowAccount.balance.toString(),
            winnerEscrowPdaLamports: initialWinnerEscrowLamports,
            gamePotPdaLamports: initialGamePotLamports,
        });

        const claimTx = await testState.program.methods
            .claimSolWinnings(testState.currentRoundIdForSeed!)
            .accounts({
                winnerSigner: winnerPubkey, // The winner's actual pubkey
                userPlatformEscrow: winnerEscrowPda,
                roundState: testState.roundStatePda!,
                gamePotSol: testState.gamePotSolPda!,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([winnerSigner]) // The winner signs
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(claimTx);
        console.log("claimSolWinnings transaction confirmed:", claimTx);

        const roundStateAfterClaim = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const finalWinnerEscrowAccount = await testState.program.account.userPlatformEscrow.fetch(winnerEscrowPda);
        const finalWinnerEscrowLamports = await testState.connection.getBalance(winnerEscrowPda);
        const finalGamePotLamports = await testState.connection.getBalance(testState.gamePotSolPda!);

        console.log("Post-Claim (RoundState Data):", {
            statusDiscriminant: roundStateAfterClaim.statusDiscriminant,
            winnerSolClaimed: roundStateAfterClaim.winnerSolClaimed,
        });
        console.log("Post-Claim Balances:", {
            winnerEscrowAccountBalance: finalWinnerEscrowAccount.balance.toString(),
            winnerEscrowPdaLamports: finalWinnerEscrowLamports,
            gamePotPdaLamports: finalGamePotLamports,
        });

        assert.strictEqual(roundStateAfterClaim.winnerSolClaimed, 1, "winnerSolClaimed should be 1 (true) after claim");
        assert.strictEqual(roundStateAfterClaim.statusDiscriminant, 2, "status_discriminant should be SolClaimed (2) after claim");

        const expectedEscrowBalance = initialWinnerEscrowAccount.balance.add(winningsToClaim);
        assert.strictEqual(
            finalWinnerEscrowAccount.balance.toString(),
            expectedEscrowBalance.toString(),
            "Winner escrow account data balance incorrect after claim"
        );
        assert.strictEqual(
            finalWinnerEscrowLamports,
            initialWinnerEscrowLamports + winningsToClaim.toNumber(),
            "Winner escrow PDA lamports incorrect after claim"
        );
        assert.strictEqual(
            finalGamePotLamports,
            initialGamePotLamports - winningsToClaim.toNumber(),
            "Game pot PDA lamports incorrect after claim"
        );
        console.log("Winner claims SOL winnings test completed successfully.");
    });

    it("Allows user to withdraw SOL from platform", async () => {
        assert.isDefined(testState.userPlatformEscrowPda, "UserPlatformEscrow PDA for player 1 should be derived");
        assert.isDefined(testState.gameStatePda, "GameState PDA must be set");
        assert.isDefined(testState.houseWalletKeypair, "House wallet keypair must be set");

        const userToWithdraw = testState.wallet; // Player 1 (main wallet) will withdraw
        const userEscrowPda = testState.userPlatformEscrowPda!;
        const amountToWithdraw = new BN(0.05 * anchor.web3.LAMPORTS_PER_SOL); // Withdraw 0.05 SOL

        console.log(`\n--- User (${userToWithdraw.publicKey.toBase58()}) withdrawing SOL from platform escrow ---`);
        console.log(`Escrow PDA: ${userEscrowPda.toBase58()}`);
        console.log(`Withdraw Amount: ${amountToWithdraw.toString()}`);

        const initialUserWalletBalance = await testState.connection.getBalance(userToWithdraw.publicKey);
        const initialEscrowAccount = await testState.program.account.userPlatformEscrow.fetch(userEscrowPda);
        const initialEscrowPdaLamports = await testState.connection.getBalance(userEscrowPda);
        const initialHouseWalletBalance = await testState.connection.getBalance(testState.houseWalletKeypair.publicKey);

        console.log("Initial balances:", {
            userWallet: initialUserWalletBalance,
            escrowPdaLamports: initialEscrowPdaLamports,
            escrowAccountBalance: initialEscrowAccount.balance.toString(),
            houseWallet: initialHouseWalletBalance,
        });

        const txSignature = await testState.program.methods
            .withdrawSolFromPlatform(amountToWithdraw)
            .accounts({
                user: userToWithdraw.publicKey,
                userPlatformEscrow: userEscrowPda,
                gameState: testState.gameStatePda,
                houseWallet: testState.houseWalletKeypair.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([userToWithdraw.payer])
            .rpc({ skipPreflight: true, commitment: "confirmed" });

        await testState.confirmTx(txSignature);
        console.log("Withdraw transaction confirmed.");

        const finalUserWalletBalance = await testState.connection.getBalance(userToWithdraw.publicKey);
        const finalEscrowAccount = await testState.program.account.userPlatformEscrow.fetch(userEscrowPda);
        const finalEscrowPdaLamports = await testState.connection.getBalance(userEscrowPda);
        const finalHouseWalletBalance = await testState.connection.getBalance(testState.houseWalletKeypair.publicKey);

        console.log("Final balances:", {
            userWallet: finalUserWalletBalance,
            escrowPdaLamports: finalEscrowPdaLamports,
            escrowAccountBalance: finalEscrowAccount.balance.toString(),
            houseWallet: finalHouseWalletBalance,
        });

        const withdrawalFee = testState.WITHDRAWAL_FEE_LAMPORTS;
        const totalDebitFromEscrow = amountToWithdraw.add(withdrawalFee);

        // User's wallet balance should increase by withdrawAmount (approx, due to tx fees)
        // For a more precise check, we can ensure it's greater than initial - totalDebit + amountToWithdraw, and less than initial
        expect(finalUserWalletBalance).to.be.gt(initialUserWalletBalance + amountToWithdraw.toNumber() - 20000); // Approx check allowing for tx fees
        expect(finalUserWalletBalance).to.be.lt(initialUserWalletBalance + amountToWithdraw.toNumber());


        // Escrow PDA's lamports should decrease by (withdrawAmount + fee)
        assert.strictEqual(
            finalEscrowPdaLamports,
            initialEscrowPdaLamports - totalDebitFromEscrow.toNumber(),
            "Escrow PDA lamports incorrect after withdrawal"
        );

        // Escrow account's balance field should decrease by (withdrawAmount + fee)
        assert.strictEqual(
            finalEscrowAccount.balance.toString(),
            initialEscrowAccount.balance.sub(totalDebitFromEscrow).toString(),
            "Escrow account data balance incorrect after withdrawal"
        );

        // House wallet should receive exactly the WITHDRAWAL_FEE_LAMPORTS
        assert.strictEqual(
            finalHouseWalletBalance,
            initialHouseWalletBalance + withdrawalFee.toNumber(),
            "House wallet balance incorrect after withdrawal fee collection"
        );

        console.log("withdrawSolFromPlatform test completed successfully.");
    });

    it("Creates reward pot accounts (RoundCashinoRewardsPot PDA and its ATA)", async () => {
        assert.isDefined(testState.currentRoundIdForSeed, "currentRoundIdForSeed must be set from previous tests");
        assert.isDefined(testState.roundStatePda, "roundStatePda must be set");
        assert.isDefined(testState.gameStatePda, "gameStatePda must be set");
        assert.isDefined(testState.cashinoMintPublicKey, "cashinoMintPublicKey must be set on testState");


        console.log(`\n--- Test: Step X - Creating Reward Pot Accounts for Round ${testState.currentRoundIdForSeed!.toString()} ---`);

        const roundStateBeforePotCreation = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(
            roundStateBeforePotCreation.statusDiscriminant,
            2, // Expect SolClaimed (2) before creating reward pots
            "Round status should be SolClaimed (2) before creating reward pots"
        );
        console.log(`Round status confirmed as SolClaimed.`);

        assert.isDefined(testState.roundCashinoRewardsPotAccountPda, "roundCashinoRewardsPotAccountPda should be derived");
        assert.isDefined(testState.roundCashinoRewardsPotAta, "roundCashinoRewardsPotAta should be derived");


        console.log(`Derived RoundCashinoRewardsPot PDA: ${testState.roundCashinoRewardsPotAccountPda!.toBase58()}`);
        console.log(`Derived RoundCashinoRewardsPot ATA: ${testState.roundCashinoRewardsPotAta!.toBase58()}`);

        let txSignature;
        try {
            txSignature = await testState.program.methods
                .createRewardPotAccounts(testState.currentRoundIdForSeed!)
                .accounts({
                    authority: testState.wallet.publicKey,
                    gameState: testState.gameStatePda,
                    roundState: testState.roundStatePda!,
                    cashinoTokenMint: testState.cashinoMintPublicKey,
                    roundCashinoRewardsPotAccount: testState.roundCashinoRewardsPotAccountPda!,
                    roundCashinoRewardsPotAta: testState.roundCashinoRewardsPotAta!,
                    systemProgram: anchor.web3.SystemProgram.programId,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .rpc({ skipPreflight: false, commitment: "confirmed" });

            await testState.confirmTx(txSignature);
            console.log("Transaction for createRewardPotAccounts confirmed by client.");

        } catch (error) {
            console.error("ERROR during createRewardPotAccounts RPC call:", JSON.stringify(error, null, 2));
            if (error.logs) {
                console.error("PROGRAM LOGS FROM ERROR OBJECT:", error.logs.join('\n'));
            }
            const roundStateCheck = await testState.program.account.roundState.fetch(testState.roundStatePda!).catch(() => null);
            console.error("RoundState status on error:", roundStateCheck?.statusDiscriminant);
            throw error;
        }

        const roundStateAfterPotCreation = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(
            roundStateAfterPotCreation.statusDiscriminant,
            3, // RewardPotAccountsCreated
            "Round status should be updated to RewardPotAccountsCreated (3)"
        );
        console.log("RoundState status updated to RewardPotAccountsCreated.");

        const potAccountData = await testState.program.account.roundCashinoRewardsPot.fetch(testState.roundCashinoRewardsPotAccountPda!);
        assert.isNotNull(potAccountData, "RoundCashinoRewardsPot account was not created/found.");
        assert.strictEqual(
            potAccountData.roundId.toString(),
            testState.currentRoundIdForSeed!.toString(),
            "RoundCashinoRewardsPot.roundId mismatch"
        );
        assert.strictEqual(
            potAccountData.totalMintedForRound.toNumber(),
            0,
            "RoundCashinoRewardsPot.totalMintedForRound should be 0 initially"
        );
        console.log("RoundCashinoRewardsPot account data verified.");

        const potAtaAccountInfo = await getAccount(
            testState.connection,
            testState.roundCashinoRewardsPotAta!,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        assert.isNotNull(potAtaAccountInfo, "RoundCashinoRewardsPot ATA was not created/found.");
        assert.isTrue(
            potAtaAccountInfo.mint.equals(testState.cashinoMintPublicKey),
            "Pot ATA created for the wrong mint"
        );
        assert.isTrue(
            potAtaAccountInfo.owner.equals(testState.roundCashinoRewardsPotAccountPda!),
            "Pot ATA has the wrong owner/authority (should be the RoundCashinoRewardsPot PDA)"
        );
        assert.strictEqual(
            potAtaAccountInfo.amount.toString(),
            "0",
            "Pot ATA should have 0 tokens initially"
        );
        console.log("RoundCashinoRewardsPot ATA verified.");
        console.log("Step 2: createRewardPotAccounts test completed successfully.");
    });

    it("Mints tokens to the reward pot ATA and updates state", async () => {
        assert.isDefined(testState.currentRoundIdForSeed, "currentRoundIdForSeed must be set");
        assert.isDefined(testState.roundStatePda, "roundStatePda must be set");
        assert.isDefined(testState.gameStatePda, "gameStatePda must be set");
        assert.isDefined(testState.roundCashinoRewardsPotAccountPda, "roundCashinoRewardsPotAccountPda must be set");
        assert.isDefined(testState.roundCashinoRewardsPotAta, "roundCashinoRewardsPotAta must be set");
        assert.isDefined(testState.mintAuthorityPda, "testState.mintAuthorityPda must be defined for minting");


        const before = await getAccount(
            testState.connection,
            testState.roundCashinoRewardsPotAta!,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        console.log("Pot ATA balance before mint:", before.amount.toString());

        const sig = await testState.program.methods
            .mintTokensToRewardPot(testState.currentRoundIdForSeed!)
            .accounts({
                authority: testState.wallet.publicKey,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!,
                cashinoTokenMint: testState.cashinoMintPublicKey,
                cashinoMintAuthorityPda: testState.mintAuthorityPda,
                roundCashinoRewardsPotAccount: testState.roundCashinoRewardsPotAccountPda!,
                roundCashinoRewardsPotAta: testState.roundCashinoRewardsPotAta!,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                spinWheelProgram: testState.program.programId,
            })
            .rpc({ skipPreflight: false, commitment: "confirmed" });
        await testState.confirmTx(sig);

        const after = await getAccount(
            testState.connection,
            testState.roundCashinoRewardsPotAta!,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        console.log("Pot ATA balance after mint:", after.amount.toString());

        assert.strictEqual(
            after.amount.toString(),
            testState.CASHINO_REWARD_PER_ROUND_UNITS.toString(),
            "Pot ATA should have received exactly the reward amount"
        );

        const potData = await testState.program.account.roundCashinoRewardsPot.fetch(
            testState.roundCashinoRewardsPotAccountPda!
        );
        console.log(
            "RoundCashinoRewardsPot.totalMintedForRound:",
            potData.totalMintedForRound.toString()
        );
        assert.strictEqual(
            potData.totalMintedForRound.toString(),
            testState.CASHINO_REWARD_PER_ROUND_UNITS.toString(),
            "RoundCashinoRewardsPot.totalMintedForRound should match reward units"
        );

        const roundAfter = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        console.log(
            "RoundState.totalCashinoMintedForRound:",
            roundAfter.totalCashinoMintedForRound.toString()
        );
        console.log("RoundState.statusDiscriminant:", roundAfter.statusDiscriminant);
        assert.strictEqual(
            roundAfter.totalCashinoMintedForRound.toString(),
            testState.CASHINO_REWARD_PER_ROUND_UNITS.toString(),
            "RoundState.totalCashinoMintedForRound should match reward units"
        );
        assert.strictEqual(
            roundAfter.statusDiscriminant,
            4, // TokensMintedForRewards
            "RoundState.statusDiscriminant should be TokensMintedForRewards (4)"
        );

        console.log("mintTokensToRewardPot test completed successfully.");
    });

    it("Calculates reward entitlements correctly", async () => {
        assert.isDefined(testState.roundStatePda, "RoundStatePda must be set");
        assert.isDefined(testState.gameStatePda, "GameStatePda must be set");
        assert.isDefined(testState.currentRoundIdForSeed, "currentRoundIdForSeed must be set");


        const roundStateBefore = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(roundStateBefore.statusDiscriminant, 4, "Round status should be TokensMintedForRewards (4) before calculating entitlements"); // TokensMintedForRewards

        const tx = await testState.program.methods
            .calculateRewardEntitlements(testState.currentRoundIdForSeed!)
            .accounts({
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda!
            })
            .rpc({ skipPreflight: false, commitment: "confirmed" });
        await testState.confirmTx(tx);

        const roundStateAfter = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(roundStateAfter.statusDiscriminant, 5, "Round status should be RewardsProcessed (5) after calculating entitlements"); // RewardsProcessed

        assert.strictEqual(
            roundStateAfter.totalCashinoMintedForRound.toString(),
            testState.CASHINO_REWARD_PER_ROUND_UNITS.toString(),
            `Total minted for round should be ${testState.CASHINO_REWARD_PER_ROUND_UNITS.toString()}`
        );

        assert.isTrue(roundStateAfter.playerCount > 0, "Should have players to calculate rewards for");
        assert.isTrue(roundStateAfter.playerCashinoRewards.length >= roundStateAfter.playerCount, "Player cashino rewards array should be populated");

        for (let i = 0; i < roundStateAfter.playerCount; i++) {
            const playerBetData = roundStateAfter.players[i];
            const playerRewardData = roundStateAfter.playerCashinoRewards[i];

            assert.isTrue(playerBetData.pubkey.equals(playerRewardData.player), `Player pubkey mismatch in rewards array at index ${i}`);

            const betAmount = playerBetData.amount;
            const actualReward = playerRewardData.cashinoRewardAmount;


            let expectedReward: BN;
            if (roundStateAfter.totalSolPot.isZero()) {
                expectedReward = new BN(0);
                if (!roundStateAfter.totalSolPot.isZero()) {
                    expectedReward = betAmount
                        .mul(roundStateAfter.totalCashinoMintedForRound)
                        .div(roundStateAfter.totalSolPot);
                }
            } else {
                expectedReward = betAmount
                    .mul(roundStateAfter.totalCashinoMintedForRound)
                    .div(roundStateAfter.totalSolPot);
            }


            console.log(`Player ${playerBetData.pubkey.toBase58()} bet: ${betAmount.toString()}, actual reward: ${actualReward.toString()}, expected reward: ${expectedReward.toString()}`);
            assert.strictEqual(actualReward.toString(), expectedReward.toString(), `Reward for player ${i} (${playerBetData.pubkey.toBase58()}) should be correct`);
        }
        console.log("calculateRewardEntitlements test completed successfully.");
    });

    it("Player claims CASHINO rewards", async () => {
        const roundStatePreClaimCheck = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(roundStatePreClaimCheck.statusDiscriminant, 5, "Round status must be RewardsProcessed (5) before claiming CASHINO rewards."); // RewardsProcessed

        const playerToClaim = testState.wallet.publicKey;
        const playerSigner = testState.wallet.payer;
        const roundId = testState.currentRoundIdForSeed!;

        assert.isDefined(testState.cashinoMintPublicKey, "Cashino mint public key must be defined on testState");
        assert.isDefined(testState.roundStatePda, "RoundStatePda must be defined on testState");
        assert.isDefined(testState.gameStatePda, "GameStatePda must be defined on testState");
        assert.isDefined(testState.roundCashinoRewardsPotAccountPda, "RoundCashinoRewardsPotAccountPda must be defined on testState");
        assert.isDefined(testState.roundCashinoRewardsPotAta, "RoundCashinoRewardsPotAta (the pot's token account) must be defined on testState");

        const playerCashinoAta = getAssociatedTokenAddressSync(
            testState.cashinoMintPublicKey,
            playerToClaim,
            false,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        await getOrCreateAssociatedTokenAccount(
            testState.connection,
            playerSigner,
            testState.cashinoMintPublicKey,
            playerToClaim,
            false,
            undefined,
            undefined,
            TOKEN_2022_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const potAtaBefore = await getAccount(testState.connection, testState.roundCashinoRewardsPotAta!, "confirmed", TOKEN_2022_PROGRAM_ID);
        const playerAtaBefore = await getAccount(testState.connection, playerCashinoAta, "confirmed", TOKEN_2022_PROGRAM_ID);

        console.log(`Claiming CASHINO for player: ${playerToClaim.toBase58()}`);
        console.log(`Round ID: ${roundId.toString()}`);
        console.log(`Pot ATA (${testState.roundCashinoRewardsPotAta!.toBase58()}) balance before claim: ${potAtaBefore.amount.toString()}`);
        console.log(`Player ATA (${playerCashinoAta.toBase58()}) balance before claim: ${playerAtaBefore.amount.toString()}`);

        const roundStateBeforeClaim = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        const rewardIndex = roundStateBeforeClaim.playerCashinoRewards.findIndex(r => r.player.equals(playerToClaim));

        assert.isTrue(rewardIndex !== -1, `Player ${playerToClaim.toBase58()} not found in reward entitlements.`);
        assert.strictEqual(roundStateBeforeClaim.playerCashinoRewards[rewardIndex].claimedVal, 0, "Reward should not have been claimed yet.");

        const rewardAmount = roundStateBeforeClaim.playerCashinoRewards[rewardIndex].cashinoRewardAmount;
        console.log(`Expected reward amount for player: ${rewardAmount.toString()}`);
        console.log("RECHECK ROUND CASHINO REWARDS POT ATA: ", testState.roundCashinoRewardsPotAta.toBase58());
        const tx = await testState.program.methods
            .claimCashinoRewards(roundId)
            .accounts({
                player: playerToClaim,
                gameState: testState.gameStatePda,
                roundState: testState.roundStatePda,
                roundCashinoRewardsPotAccount: testState.roundCashinoRewardsPotAccountPda,
                roundCashinoRewardsPotAta: testState.roundCashinoRewardsPotAta,
                cashinoTokenMint: testState.cashinoMintPublicKey,
                playerCashinoAta: playerCashinoAta,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([playerSigner])
            .rpc({ skipPreflight: false, commitment: "confirmed" });

        await testState.confirmTx(tx);

        const potAtaAfter = await getAccount(testState.connection, testState.roundCashinoRewardsPotAta!, "confirmed", TOKEN_2022_PROGRAM_ID);
        const playerAtaAfter = await getAccount(testState.connection, playerCashinoAta, "confirmed", TOKEN_2022_PROGRAM_ID);

        console.log(`Pot ATA balance after claim: ${potAtaAfter.amount.toString()}`);
        console.log(`Player ATA balance after claim: ${playerAtaAfter.amount.toString()}`);

        assert.strictEqual(
            potAtaAfter.amount.toString(),
            (BigInt(potAtaBefore.amount.toString()) - BigInt(rewardAmount.toString())).toString(),
            "Pot ATA balance incorrect after claim."
        );

        const transferFeeBp = 100;
        const netReward = BigInt(rewardAmount.toString()) * BigInt(10000 - transferFeeBp) / BigInt(10000);

        assert.strictEqual(
            playerAtaAfter.amount.toString(),
            (BigInt(playerAtaBefore.amount.toString()) + netReward).toString(),
            "Player ATA balance incorrect after claim (did not account for transfer fee)."
        );


        // assert.strictEqual(
        //     playerAtaAfter.amount.toString(),
        //     (BigInt(playerAtaBefore.amount.toString()) + BigInt(rewardAmount.toString())).toString(),
        //     "Player ATA balance incorrect after claim."
        // );

        const roundStateAfterClaim = await testState.program.account.roundState.fetch(testState.roundStatePda!);
        assert.strictEqual(
            roundStateAfterClaim.playerCashinoRewards[rewardIndex].claimedVal,
            1,
            "Reward claimed_val flag not set correctly."
        );
        console.log("Player claims CASHINO rewards test passed.");
    });

}); 