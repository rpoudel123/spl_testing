#!/bin/bash

# Exit on error
set -e

# Ensure we're on devnet
solana config set --url devnet

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run the tests
echo "Running tests..."
anchor test --skip-local-validator --provider.cluster devnet

echo "Tests completed!" 