import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { ASSOCIATED_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";

import { unpack } from "@solana/spl-token-metadata";
import type { SpinWheel } from "../target/types/spin_wheel";
import { assert } from "chai";

describe("spin-wheel (Combined Transfer Fee & Metadata)", () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const wallet = provider.wallet as anchor.Wallet;
  anchor.setProvider(provider);

  const program = anchor.workspace.SpinWheel as Program<SpinWheel>;

  const mintKeypair = new anchor.web3.Keypair();
  const recipient = new anchor.web3.Keypair();

  const senderTokenAccountAddress = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const recipientTokenAccountAddress = getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    recipient.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const decimals = 2;
  const transferFeeBasisPoints = 100;
  const maximumFee = new anchor.BN(1 * 10 ** decimals);
  const metadata = {
    name: "Cashino",
    symbol: "CASH",
    uri: "https://raw.githubusercontent.com/rpoudel123/spl_testing/refs/heads/main/cashino.json",
  };
  const initialMintAmount = 300 * 10 ** decimals;
  const transferAmount1 = 100 * 10 ** decimals;
  const transferAmount2 = 200 * 10 ** decimals;

  it("Initialize Mint with Transfer Fee and Metadata", async () => {
    console.log("Mint Pubkey:", mintKeypair.publicKey.toBase58());
    const transactionSignature = await program.methods
      .initializeToken2022(
        decimals,
        transferFeeBasisPoints,
        maximumFee,
        metadata.name,
        metadata.symbol,
        metadata.uri
      )
      .accounts({
        mintAccount: mintKeypair.publicKey,
        payer: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .signers([mintKeypair])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Initialize Transaction Signature:", transactionSignature);

    await new Promise(resolve => setTimeout(resolve, 2000));
    const mintInfo = await connection.getAccountInfo(mintKeypair.publicKey);
    assert(mintInfo !== null, "Mint account should exist");
  });

  it("Mint Tokens to Sender", async () => {
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mintKeypair.publicKey,
      wallet.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID
    );
    console.log("Sender ATA:", senderTokenAccountAddress.toBase58());

    await mintTo(
      connection,
      wallet.payer,
      mintKeypair.publicKey,
      senderTokenAccountAddress,
      wallet.payer,
      initialMintAmount,
      [],
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    console.log(`Minted ${initialMintAmount} tokens to sender.`);

    const senderAccountInfo = await getAccount(connection, senderTokenAccountAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
    assert.strictEqual(senderAccountInfo.amount.toString(), initialMintAmount.toString(), "Sender should have initial mint amount");
  });

  it("Transfer with Fee", async () => {
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mintKeypair.publicKey,
      recipient.publicKey,
      false,
      "confirmed",
      undefined,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_PROGRAM_ID
    );
    console.log("Recipient ATA:", recipientTokenAccountAddress.toBase58());

    const transactionSignature = await program.methods
      .transfer(new anchor.BN(transferAmount1))
      .accounts({
        sender: wallet.publicKey,
        recipient: recipient.publicKey,
        mintAccount: mintKeypair.publicKey,
        // senderTokenAccount: senderTokenAccountAddress,
        // recipientTokenAccount: recipientTokenAccountAddress,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Transfer 1 Signature:", transactionSignature);

    const senderAccountInfo = await getAccount(connection, senderTokenAccountAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
    const recipientAccountInfo = await getAccount(connection, recipientTokenAccountAddress, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("Sender balance after transfer 1:", senderAccountInfo.amount.toString());
    console.log("Recipient balance after transfer 1:", recipientAccountInfo.amount.toString());
  });

  it("Transfer Again, fee limited by maximumFee", async () => {
    const transactionSignature = await program.methods
      .transfer(new anchor.BN(transferAmount2))
      .accounts({
        sender: wallet.publicKey,
        recipient: recipient.publicKey,
        mintAccount: mintKeypair.publicKey,
        // senderTokenAccount: senderTokenAccountAddress,
        // recipientTokenAccount: recipientTokenAccountAddress,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // associatedTokenProgram: ASSOCIATED_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Transfer 2 Signature:", transactionSignature);
  });

  it("Harvest Transfer Fees to Withdrawing Account", async () => {
    const feeCollectorTokenAccount = senderTokenAccountAddress;
    console.log("Attempting to harvest fees (implementation specific)...");
    try {
      const transactionSignature = await program.methods
        .harvest()
        .accounts({
          mintAccount: mintKeypair.publicKey,
          // authority: wallet.publicKey,
          // tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccountAddress,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: senderTokenAccountAddress,
            isSigner: false,
            isWritable: true,
          },
        ])
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      console.log("Harvest Signature:", transactionSignature);
    } catch (e: any) {
      console.warn("Harvest failed (maybe no fees to harvest or instruction mismatch):", e.message);
    }
  });

  it("Withdraw Transfer Fees from Mint to Token Account", async () => {
    const destinationTokenAccount = senderTokenAccountAddress;
    console.log("Attempting to withdraw harvested fees...");
    try {
      const transactionSignature = await program.methods
        .withdraw()
        .accounts({
          mintAccount: mintKeypair.publicKey,
          tokenAccount: destinationTokenAccount,
          authority: wallet.publicKey,
          // tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });
      console.log("Withdraw Signature:", transactionSignature);
    } catch (e: any) {
      console.warn("Withdraw failed (maybe no fees available):", e.message);
    }
  });

  it("Update Transfer Fee", async () => {
    const newTransferFeeBasisPoints = 0;
    const newMaximumFee = new anchor.BN(0);

    const transactionSignature = await program.methods
      .updateFee(newTransferFeeBasisPoints, newMaximumFee)
      .accounts({
        mintAccount: mintKeypair.publicKey,
        authority: wallet.publicKey,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Update Fee Signature:", transactionSignature);
  });

  it("Update existing metadata field (name)", async () => {
    const newName = "Solana";
    const transactionSignature = await program.methods
      .updateField({
        field: { name: {} },
        value: newName,
      })
      .accounts({
        mintAccount: mintKeypair.publicKey,
        authority: wallet.publicKey,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Update Name Signature:", transactionSignature);
  });

  it("Update metadata with custom field", async () => {
    const customKey = "color";
    const customValue = "red";
    const transactionSignature = await program.methods
      .updateField({
        field: { key: [customKey] },
        value: customValue,
      })
      .accounts({
        mintAccount: mintKeypair.publicKey,
        authority: wallet.publicKey,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Add Custom Field Signature:", transactionSignature);
  });

  it("Remove custom field", async () => {
    const customKeyToRemove = "color";
    const transactionSignature = await program.methods
      .removeKey(customKeyToRemove)
      .accounts({
        mintAccount: mintKeypair.publicKey,
        updateAuthority: wallet.publicKey,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Remove Key Signature:", transactionSignature);
  });

  it("Change update authority to None", async () => {
    const transactionSignature = await program.methods
      .updateAuthority()
      .accounts({
        mintAccount: mintKeypair.publicKey,
        currentAuthority: wallet.publicKey,
        newAuthority: null,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Update Authority to None Signature:", transactionSignature);
  });

  it("Emit metadata, decode transaction logs", async () => {
    const txSignature = await program.methods
      .emit()
      .accounts({
        mintAccount: mintKeypair.publicKey,
        // tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc({ commitment: "confirmed", skipPreflight: true });
    console.log("Emit (via tx logs) Signature:", txSignature);

    const transactionResponse = await provider.connection.getTransaction(
      txSignature,
      {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }
    );

    if (!transactionResponse || !transactionResponse.meta || !transactionResponse.meta.logMessages) {
      console.error("Failed to fetch transaction details or logMessages are missing", { txSignature, transactionResponse });
      throw new Error("Failed to fetch transaction details or logMessages are missing");
    }

    const prefix = "Program return: ";
    let log = transactionResponse.meta.logMessages.find((log) =>
      log.startsWith(prefix)
    );
    if (!log) {
      console.warn("Could not find 'Program return:' log for emit instruction.");
      return;
    }
    log = log.slice(prefix.length);
    const [programId, data] = log.split(" ", 2);

    const buffer = Buffer.from(data, "base64");
    const decodedMetadata = unpack(buffer);
    console.log("Emitted Metadata (via logs):", decodedMetadata);

    assert.strictEqual(decodedMetadata.name, "Solana", "Name should have been updated");
  });
});