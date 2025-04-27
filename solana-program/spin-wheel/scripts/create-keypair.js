import { Keypair } from '@solana/web3.js';
import fs from 'fs';

// Create a new keypair
const keypair = Keypair.generate();

// Save the keypair to a file
fs.writeFileSync(
  './your-wallet-keypair.json',
  JSON.stringify(Array.from(keypair.secretKey))
);

console.log('Created new keypair file: your-wallet-keypair.json');
console.log('Public key:', keypair.publicKey.toString()); 