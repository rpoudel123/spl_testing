/* eslint-disable */
// @ts-nocheck
import { createHash } from 'crypto';

/**
 * Provably Fair Algorithm Implementation
 * 
 * This implementation follows industry standards for provably fair gambling:
 * 1. Server generates a random seed (serverSeed)
 * 2. Server hashes the seed and shares the hash (serverSeedHash) with the client before the game
 * 3. Client provides their own seed (clientSeed)
 * 4. After the game, server reveals the original serverSeed
 * 5. Client can verify the outcome by combining serverSeed + clientSeed + nonce
 */

/**
 * Generates a random server seed
 * @returns {string} A random 64-character hexadecimal string
 */
export function generateServerSeed(): string {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a hash of the server seed
 * @param {string} serverSeed - The server seed to hash
 * @returns {Promise<string>} The SHA-256 hash of the server seed
 */
export async function hashServerSeed(serverSeed: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(serverSeed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a provably fair result
 * @param {string} serverSeed - The server seed
 * @param {string} clientSeed - The client seed
 * @param {string} nonce - The nonce (usually round ID)
 * @returns {Promise<number>} A number between 0 and 36 (inclusive)
 */
export async function generateResult(
  serverSeed: string,
  clientSeed: string,
  nonce: string
): Promise<number> {
  // Combine the seeds and nonce
  const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
  
  // Generate SHA-512 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(combinedSeed);
  const hashBuffer = await crypto.subtle.digest('SHA-512', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Use first 8 characters to generate number between 0 and 36
  const decimal = parseInt(hashHex.substring(0, 8), 16);
  return decimal % 37;
}

/**
 * Verifies a provably fair result
 * @param {string} serverSeed - The revealed server seed
 * @param {string} serverSeedHash - The server seed hash that was shown before the round
 * @param {string} clientSeed - The client seed
 * @param {string} nonce - The nonce (usually round ID)
 * @param {number} winningPosition - The announced winning position
 * @returns {Promise<boolean>} Whether the result is valid
 */
export async function verifyResult(
  serverSeed: string,
  serverSeedHash: string,
  clientSeed: string,
  nonce: string,
  winningPosition: number
): Promise<boolean> {
  // First verify the server seed matches its hash
  const calculatedHash = await hashServerSeed(serverSeed);
  if (calculatedHash !== serverSeedHash) {
    return false;
  }
  
  // Calculate the result
  const calculatedPosition = await generateResult(serverSeed, clientSeed, nonce);
  
  // Verify the winning position matches
  return calculatedPosition === winningPosition;
} 