import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import type { SpinWheel } from "../target/types/spin_wheel";

describe('transfer-fee', () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  anchor.setProvider(provider);

  const program = anchor.workspace.SpinWheel as Program<SpinWheel>;

  const mintKeypair = new anchor.web3.Keypair();
  const recipient = new anchor.web3.Keypair();

  const senderTokenAccountAddress = getAssociatedTokenAddressSync(mintKeypair.publicKey, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const recipientTokenAccountAddress = getAssociatedTokenAddressSync(mintKeypair.publicKey, recipient.publicKey, false, TOKEN_2022_PROGRAM_ID);

  it("Create Mint with Transfer Fee", async () => {
    const transferFeeBasisPoints = 100;
    const maximumFee = 1;

    const transactionSignature = await program.methods
      .initializeToken2022(transferFeeBasisPoints, new anchor.BN(maximumFee))
      .accounts({ mintAccount: mintKeypair.publicKey })
      .signers([mintKeypair])
      .rpc({ skipPreflight: true });
    console.log("Transaction Signature: ", transactionSignature);
  });

  it("Mint Tokens", async () => {
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mintKeypair.publicKey,
      wallet.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID,
    );

    await mintTo(connection, wallet.payer, mintKeypair.publicKey, senderTokenAccountAddress, wallet.payer, 300, [], undefined, TOKEN_2022_PROGRAM_ID);
  });

  it("Transfer", async () => {
    const transactionSignature = await program.methods
      .transfer(new anchor.BN(100))
      .accounts({
        sender: wallet.publicKey,
        recipient: recipient.publicKey,
        mintAccount: mintKeypair.publicKey
      })
      .rpc({ skipPreflight: true });
    console.log("Your transaction signature", transactionSignature);
  });

  it('Transfer Again, fee limit by maximumFee', async () => {
    const transactionSignature = await program.methods
      .transfer(new anchor.BN(200))
      .accounts({
        sender: wallet.publicKey,
        recipient: recipient.publicKey,
        mintAccount: mintKeypair.publicKey
      })
      .rpc({ skipPreflight: true });
    console.log('Your transaction signature', transactionSignature);
  });

  it('Harvest Transfer Fees to Mint Account', async () => {
    const transactionSignature = await program.methods
      .harvest()
      .accounts({ mintAccount: mintKeypair.publicKey })
      .remainingAccounts([
        {
          pubkey: recipientTokenAccountAddress,
          isSigner: false,
          isWritable: true,
        },
      ])
      .rpc({ skipPreflight: true });
    console.log('Your transaction signature', transactionSignature);
  });

  it('Withdraw Transfer Fees from Mint Account', async () => {
    const transactionSignature = await program.methods
      .withdraw()
      .accounts({
        mintAccount: mintKeypair.publicKey,
        tokenAccount: senderTokenAccountAddress,
      })
      .rpc({ skipPreflight: true });
    console.log('Your transaction signature', transactionSignature);
  });

  it('Update Transfer Fee', async () => {
    const transferFeeBasisPoints = 0;
    const maximumFee = 0;

    const transactionSignature = await program.methods
      .updateFee(transferFeeBasisPoints, new anchor.BN(maximumFee))
      .accounts({ mintAccount: mintKeypair.publicKey })
      .rpc({ skipPreflight: true });
    console.log('Your transaction signature', transactionSignature);
  });


})
// import * as anchor from '@coral-xyz/anchor';
// import { Program } from '@coral-xyz/anchor';
// import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
// import { assert } from 'chai';
// import * as crypto from 'crypto';

// describe('spin-wheel', () => {
//   // Configure the client to use the devnet cluster
//   const provider = anchor.AnchorProvider.env();
//   anchor.setProvider(provider);

//   const program = anchor.workspace.SpinWheel as Program;
//   const programId = new PublicKey('EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn');

//   // Generate a new keypair for the house wallet
//   const houseWallet = Keypair.generate();

//   // Find PDA for game state
//   const [gameStatePda] = PublicKey.findProgramAddressSync(
//     [Buffer.from('game-state')],
//     programId
//   );

//   it('Initializes the game', async () => {
//     // Initialize the game with a 3% house fee
//     const tx = await program.methods
//       .initialize(3)
//       .accounts({
//         authority: provider.wallet.publicKey,
//         gameState: gameStatePda,
//         houseWallet: houseWallet.publicKey,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     console.log('Game initialized with transaction signature', tx);

//     // Fetch the game state to verify initialization
//     const gameState = await program.account.gameState.fetch(gameStatePda);
//     assert.equal(gameState.isInitialized, true);
//     assert.equal(gameState.houseFeePercentage, 3);
//     assert.ok(gameState.authority.equals(provider.wallet.publicKey));
//     assert.ok(gameState.houseWallet.equals(houseWallet.publicKey));
//   });

//   it('Starts a new round', async () => {
//     const seed = crypto.randomBytes(32);
//     const gameState = await program.account.gameState.fetch(gameStatePda);
//     const [roundStatePda] = PublicKey.findProgramAddressSync([
//       Buffer.from('round-state'),
//       Buffer.from(gameState.roundCounter.toString()),
//     ], programId);

//     const tx = await program.methods.startRound(Array.from(seed), 60).accounts({
//       authority: provider.wallet.publicKey,
//       gameState: gameStatePda,
//       roundState: roundStatePda,
//       systemProgram: SystemProgram.programId,
//     })
//       .rpc();

//     console.log('Round started with transaction signature', tx);

//     const roundState = await program.account.roundState.fetch(roundStatePda);
//     assert.equal(roundState.isActive, true);
//     assert.equal(roundState.id.toString(), gameState.roundCounter.toString());

//     console.log("Seed for ending the round:", Array.from(seed));

//   });


// }); 