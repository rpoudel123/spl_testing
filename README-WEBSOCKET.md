# WebSocket Integration for Spin Game

This document outlines the integration of WebSockets into the Spin Game application to provide real-time updates and a globally consistent game state.

## Architecture

The WebSocket integration consists of two main components:

1. **Cloudflare Worker with Durable Objects** (Backend)
   - Deployed at: `wss://spin-game-worker.prejupk.workers.dev`
   - Maintains a single global game state
   - Manages game rounds automatically (2-minute rounds)
   - Handles real-time communication with all players
   - Implements the provably fair algorithm

2. **WebSocket Client in Next.js** (Frontend)
   - Located in `src/lib/websocket/gameSocket.ts`
   - Provides a singleton WebSocket client
   - Handles connection management and reconnection
   - Parses and dispatches WebSocket messages

## 2-Minute Round System

The game operates on a continuous cycle of 2-minute rounds:

1. **Round Initialization**:
   - When a round starts, the backend sets `startTime` (current timestamp) and calculates `endTime` (startTime + 120000ms)
   - The server generates and hashes a server seed for provably fair results
   - All connected clients receive a `ROUND_STARTED` message with round details

2. **Betting Phase**:
   - Players can place bets during most of the round duration
   - All bets are broadcast to all connected clients in real-time
   - The frontend displays a countdown timer showing remaining time

3. **Round End**:
   - When the timer reaches zero, the round automatically ends
   - The server calculates the winning position using the provably fair algorithm
   - All clients receive a `ROUND_ENDED` message with the results
   - The frontend animates the wheel to show the winning position
   - A new round starts immediately after

4. **Continuous Cycle**:
   - This process repeats indefinitely, creating a 24/7 gaming experience
   - Players can join at any time and see the current round status

## Components

### WebSocket Client

The WebSocket client (`src/lib/websocket/gameSocket.ts`) provides:
- Connection management
- Automatic reconnection
- Message parsing and dispatching
- Type-safe interfaces for messages

### Game Context

The WebSocket game context (`src/lib/websocket/gameContext.tsx`) provides:
- React context for WebSocket game state
- Integration with existing authentication
- Bet placement functionality
- Round state management
- Timer synchronization

## Integration with Existing Code

The integration is designed to work alongside the existing Supabase implementation:

1. Both providers are included in the app layout
2. The SpinWheel component uses data from both contexts, preferring WebSocket data when available
3. The BetForm component accepts a custom bet placement function

## Environment Variables

The WebSocket URL is configured in `.env.local`:

```
NEXT_PUBLIC_GAME_WEBSOCKET_URL=wss://spin-game-worker.prejupk.workers.dev
```

## Usage

To use the WebSocket integration:

1. Ensure the WebSocket URL is correctly set in `.env.local`
2. The WebSocketGameProvider is included in the app layout
3. Use the `useWebSocketGame` hook to access the WebSocket game state

Example:

```tsx
import { useWebSocketGame } from '@/lib/websocket/gameContext';

function MyComponent() {
  const { currentRound, roundTimeLeft, placeBet } = useWebSocketGame();
  
  // Use the WebSocket game state
}
```

## Fallback Mechanism

If the WebSocket connection fails, the application will fall back to the existing Supabase implementation. This ensures that the game remains functional even if the WebSocket server is unavailable.

## Future Improvements

1. Add better error handling for WebSocket disconnections
2. Implement a more robust reconnection strategy
3. Add support for multiple game types
4. Enhance the admin interface for managing the WebSocket server 