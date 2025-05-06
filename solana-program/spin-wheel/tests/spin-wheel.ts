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
});