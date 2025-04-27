#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Spin Wheel Program Deployment ===${NC}"
echo

# Check if the keypair file exists
if [ ! -f "./your-wallet-keypair.json" ]; then
  echo -e "${RED}Error: your-wallet-keypair.json not found${NC}"
  echo -e "You need to create a keypair file for your wallet address: Fomb9sjdxKZkCLZ6jEnd2bms7Lk9fRKzFMFUL2pQqLjA"
  echo -e "Please export your private key from your wallet and save it in the correct format."
  exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm install
echo

# Build the program
echo -e "${YELLOW}Building the program...${NC}"
anchor build
echo

# Deploy the program
echo -e "${YELLOW}Deploying the program...${NC}"
echo -e "This will deploy using the wallet: Fomb9sjdxKZkCLZ6jEnd2bms7Lk9fRKzFMFUL2pQqLjA"
echo

# Check if we're on devnet or mainnet
read -p "Deploy to devnet or mainnet? (d/m): " network
if [ "$network" = "m" ]; then
  echo -e "${YELLOW}Deploying to mainnet...${NC}"
  anchor deploy --provider.cluster mainnet
else
  echo -e "${YELLOW}Deploying to devnet...${NC}"
  anchor deploy --provider.cluster devnet
fi

echo
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Program ID: EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update the frontend to use the new program ID if needed"
echo "2. Initialize the game using the admin panel"
echo "3. Start a new round to begin playing" 