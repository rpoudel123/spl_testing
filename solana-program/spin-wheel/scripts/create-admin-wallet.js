import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import bs58 from 'bs58';

// Generate new keypair
const keypair = Keypair.generate();

// Save keypair to file in the correct format for Solana
fs.writeFileSync(
    'admin-wallet-keypair.json',
    JSON.stringify(Array.from(keypair.secretKey))
);

// Get base58 private key for Phantom
const privateKeyBase58 = bs58.encode(keypair.secretKey);

console.log('\n=== New Admin Wallet Created ===');
console.log('\nPublic Key (wallet address):');
console.log(keypair.publicKey.toBase58());
console.log('\nPrivate Key (for Phantom import):');
console.log(privateKeyBase58);
console.log('\nInstructions:');
console.log('1. Open Phantom wallet');
console.log('2. Click the hamburger menu (three lines) in top left');
console.log('3. Click "Import Private Key"');
console.log('4. Paste the private key shown above');
console.log('\nThe wallet keypair has also been saved to admin-wallet-keypair.json');
console.log('This file will be used by Anchor for deployments.\n'); 