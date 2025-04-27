import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import bs58 from 'bs58';

// The private key for the BgBrd... wallet
const privateKey = '2XSvHRWbJJhSGtZMpXm97gLqzeBGSeTLK86b4WxByq7DqYxoBgpaHvXZbY7Nfx9XZ393pn7S8mruVJy23EG26XcY';

try {
  // Decode the base58 private key
  const secretKey = bs58.decode(privateKey);
  
  // Create keypair from secret key
  const keypair = Keypair.fromSecretKey(secretKey);
  
  // Verify this is the correct wallet
  if (keypair.publicKey.toString() !== 'BgBrdErhMiE3upaVtKw7oy14PSAihjpvw32YUkN5tmTJ') {
    throw new Error('Keypair does not match expected public key');
  }
  
  // Save the keypair in the format Solana expects
  fs.writeFileSync(
    'admin-wallet-keypair.json',
    JSON.stringify(Array.from(keypair.secretKey))
  );
  
  console.log('\nSuccessfully saved admin wallet keypair!');
  console.log('Public key:', keypair.publicKey.toString());
  console.log('\nYou can now run: anchor build && anchor deploy --provider.cluster devnet\n');
} catch (error) {
  console.error('\nError processing keypair:', error.message);
} 