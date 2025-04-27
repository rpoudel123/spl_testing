/**
 * A simple rate limiter for RPC calls
 */

// Store the last call time for each operation
const lastCallTimes: Record<string, number> = {};

// Default cooldown periods in milliseconds
const DEFAULT_COOLDOWN = 5000; // 5 seconds
const RATE_LIMITED_COOLDOWN = 30000; // 30 seconds after a 429 error

/**
 * Check if an operation should be rate limited
 * @param operationKey A unique key to identify the operation
 * @param cooldownMs The cooldown period in milliseconds
 * @returns true if the operation should proceed, false if it should be rate limited
 */
export function shouldProceed(operationKey: string, cooldownMs: number = DEFAULT_COOLDOWN): boolean {
  const now = Date.now();
  const lastCallTime = lastCallTimes[operationKey] || 0;
  
  // Check if we're still in the cooldown period
  if (now - lastCallTime < cooldownMs) {
    console.log(`Rate limiting: Operation "${operationKey}" skipped (last call was ${Math.round((now - lastCallTime) / 1000)}s ago, cooldown: ${cooldownMs / 1000}s)`);
    return false;
  }
  
  // Update the last call time
  lastCallTimes[operationKey] = now;
  return true;
}

/**
 * Mark an operation as rate limited (e.g., after receiving a 429 error)
 * @param operationKey A unique key to identify the operation
 * @param cooldownMs The extended cooldown period in milliseconds
 */
export function markRateLimited(operationKey: string, cooldownMs: number = RATE_LIMITED_COOLDOWN): void {
  const now = Date.now();
  lastCallTimes[operationKey] = now + cooldownMs - DEFAULT_COOLDOWN;
  console.log(`Rate limited: Operation "${operationKey}" will be delayed for ${cooldownMs / 1000}s`);
}

/**
 * Reset the rate limiter for an operation
 * @param operationKey A unique key to identify the operation
 */
export function resetRateLimit(operationKey: string): void {
  delete lastCallTimes[operationKey];
} 