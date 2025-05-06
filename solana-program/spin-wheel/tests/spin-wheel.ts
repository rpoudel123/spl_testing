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
import { assert } from "chai";

describe('spin-wheel token tests with PDA mint authority', () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  anchor.setProvider(provider);

  const program = anchor.workspace.SpinWheel as Program<SpinWheel>;

  const mintKeypair = new anchor.web3.Keypair();
  const recipientKeypair = new anchor.web3.Keypair(); // For user-to-user transfer tests

  // PDA for mint authority
  const [mintAuthorityPda, mintAuthorityPdaBump] =
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority")],
      program.programId
    );

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

    assert.isTrue(mintInfo.mintAuthority.equals(mintAuthorityPda), "Mint authority should be the PDA");
    assert.isTrue(mintInfo.freezeAuthority.equals(mintAuthorityPda), "Freeze authority should be the PDA");
    assert.strictEqual(mintInfo.decimals, 2, "Decimals should be 2");

    // You can also fetch the mint account directly and check extensions if needed,
    // but getMint already gives key authorities.
    // const mintAccountData = await connection.getAccountInfo(mintKeypair.publicKey);
    // console.log("Raw mint account data:", mintAccountData);
    // Here you could use @solana/spl-token- következő functions to parse TransferFeeConfig if needed

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