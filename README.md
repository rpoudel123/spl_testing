# Solana Spin Wheel Game

A provably fair spin wheel game built on the Solana blockchain.

## Features

- Spin wheel game with provably fair results
- Betting interface for players
- Admin panel for game management
- Real-time updates of game state
- Wallet integration with Phantom and Solflare
- Detailed game history and statistics

## Tech Stack

- **Frontend**: Next.js, React, TailwindCSS
- **Blockchain**: Solana, Anchor Framework
- **Wallet**: Solana Wallet Adapter

## Prerequisites

- Node.js (v16+)
- Yarn or npm
- Solana CLI
- Anchor CLI
- Rust

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/spin.git
   cd spin
   ```

2. Install dependencies:
   ```
   yarn install
   ```

3. Set up Solana:
   ```
   solana config set --url devnet
   ```

## Deployment

### Deploying the Solana Program

1. Navigate to the Solana program directory:
   ```
   cd solana-program/spin-wheel
   ```

2. Run the deployment script:
   ```
   ./scripts/deploy.sh
   ```

   This script will:
   - Build the program
   - Update the program ID in the necessary files
   - Deploy the program to Solana devnet
   - Verify the deployment

3. Note the program ID output by the script. You'll need this for the frontend.

### Configuring the Frontend

1. Update the program ID in the frontend:
   ```
   src/lib/solana/anchor-client.ts
   ```

   Replace the `PROGRAM_ID` value with your deployed program ID.

2. Build the frontend:
   ```
   yarn build
   ```

3. Start the application:
   ```
   yarn start
   ```

## Development

For local development:

1. Start the development server:
   ```
   yarn dev
   ```

2. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

Run tests with:

```
yarn test
```

## Game Administration

To initialize the game and manage rounds:

1. Connect with an admin wallet
2. Use the admin panel to:
   - Initialize the game
   - Start new rounds
   - End current rounds
   - Adjust game parameters

## License

MIT
