/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { toast } from 'sonner';
import 'react-toastify/dist/ReactToastify.css';

// Define better types for callbacks
export interface Bet {
  playerId: string;
  playerName?: string;
  amount: number;
  timestamp: number;
  position?: number;
}

// Update RoundStatus to match actual implementation test
export type RoundStatus = 
  | 'BETTING'
  | 'SPINNING'
  | 'COMPLETED'
  | 'SPECIAL_REGISTRATION'
  | 'SPECIAL_SPINNING';

// Update MessageType enum to match actual implementation
export enum MessageType {
  // Client -> Server
  PLACE_BET = 'PLACE_BET',
  ADMIN_START_ROUND = 'ADMIN_START_ROUND',
  ADMIN_END_ROUND = 'ADMIN_END_ROUND',
  GET_STATE = 'GET_STATE',
  SEND_CHAT = 'SEND_CHAT',
  GET_CHAT = 'GET_CHAT',
  REGISTER_SPECIAL_ROUND = 'REGISTER_SPECIAL_ROUND',
  REQUEST_WITHDRAWAL = 'REQUEST_WITHDRAWAL',
  PONG = 'pong',  // Add pong type for heartbeat response
  
  // Server -> Client
  GAME_STATE = 'GAME_STATE',
  BET_PLACED = 'BET_PLACED',
  BET_CONFIRMED = 'BET_CONFIRMED',
  ROUND_STARTED = 'ROUND_STARTED',
  ROUND_ENDED = 'ROUND_ENDED',
  ERROR = 'ERROR',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  CHAT_HISTORY = 'CHAT_HISTORY',
  SPECIAL_ROUND_REGISTRATION_CONFIRMED = 'SPECIAL_ROUND_REGISTRATION_CONFIRMED',
  WITHDRAWAL_CONFIRMED = 'WITHDRAWAL_CONFIRMED',
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',
  SPECIAL_ROUND_REGISTRATION_CONFIRMATION = 'SPECIAL_ROUND_REGISTRATION_CONFIRMATION',
  PING = 'ping'  // Add ping type for heartbeat
}

// Update interfaces to match actual implementation
export interface GameState {
  currentRound: {
    id: string;
    status: RoundStatus;
    startTime: number;
    endTime?: number;
    bets: Array<Bet>;
    winningPlayerId: string | null;
    serverSeed?: string;
    clientSeed?: string;
    totalPot: number;
    serverSeedHash: string;
    isSpecial?: boolean;
  } | null;
  timestamp: number;
  nextRoundStartTime?: number;
  specialRoundParticipants?: Array<{
    walletAddress: string;
    playerName?: string;
    tokenBalance: number;
    timestamp: number;
  }>;
  timeLeft: number;
  tokenDistribution?: Record<string, number>;
  connectedPlayers?: number;
}

export interface RoundData {
  id: string;
  status: RoundStatus;
  startTime: number;
  endTime?: number;
  bets: Array<Bet>;
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed?: string;
  winningPlayerId?: string;
  totalPot: number;
  isSpecial?: boolean;
}

export interface GameSocketCallbacks {
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (message: ServerMessage) => void;
  onAuthError?: (error: Error) => void;
  onMaxReconnectAttemptsReached?: () => void;
  onGameState?: (state: GameState) => void;
  onBetConfirmed?: (data: BetConfirmation) => void;
  onRoundStart?: (data: { round: RoundData }) => void;
  onRoundEnd?: (data: { round: RoundData }) => void;
  onSpecialRoundRegistrationConfirmed?: (data: SpecialRoundRegistrationConfirmation) => void;
  onChatMessage?: (data: ChatMessage) => void;
  onChatHistory?: (data: { messages: ChatMessage[] }) => void;
  onBetPlaced?: (data: { bet: Bet; tokenDistribution?: Record<string, number> }) => void;
  onWithdrawalConfirmed?: (data: { 
    walletAddress: string;
    amount: number;
    transactionSignature: string;
  }) => void;
  onWithdrawalFailed?: (data: { 
    walletAddress: string;
    amount: number;
    error: string;
  }) => void;
  onRoundStatusChange?: (status: RoundStatus) => void;
}

export interface BetConfirmation extends Message {
  amount: number;
  success: boolean;
  message: string;
}

export interface SpecialRoundRegistrationConfirmation extends BaseMessage {
  type: MessageType.SPECIAL_ROUND_REGISTRATION_CONFIRMED;
  success: boolean;
  message: string;
}

// Base message interface
export interface BaseMessage {
  timestamp: number;
}

// Define Message type that all messages extend from
export interface Message extends BaseMessage {
  type: MessageType;
}

// Client Messages
export interface PlaceBetMessage extends Message {
  type: MessageType.PLACE_BET;
  playerId: string;
  playerName: string;
  amount: number;
  position: number;
  walletAddress: string;
}

interface GetStateMessage {
  type: MessageType.GET_STATE;
  timestamp: number;
}

export interface SendChatMessage extends Message {
  type: MessageType.SEND_CHAT;
  walletAddress: string;
  playerName: string;
  content: string;
}

export interface GetChatMessage extends Message {
  type: MessageType.GET_CHAT;
  limit?: number;
}

export interface RegisterSpecialRoundMessage extends Message {
  type: MessageType.REGISTER_SPECIAL_ROUND;
  timestamp: number;
  walletAddress: string;
  playerName: string;
}

export interface WithdrawalRequestMessage extends Message {
  type: MessageType.REQUEST_WITHDRAWAL;
  playerId: string;
  walletAddress: string;
  amount: number;
  timestamp: number;
}

interface AdminEndRoundMessage {
  type: MessageType.ADMIN_END_ROUND;
  timestamp: number;
}

type OutgoingMessage = PlaceBetMessage 
  | SendChatMessage 
  | GetChatMessage 
  | RegisterSpecialRoundMessage 
  | GetStateMessage 
  | AdminEndRoundMessage;

// Server Messages
export interface ServerMessage extends BaseMessage {
  type: MessageType;
  state?: GameState;
  error?: string;
  round?: RoundData;
  bet?: Bet;
  tokenDistribution?: Record<string, number>;
  messages?: ChatMessage[];
  message?: string;
  walletAddress?: string;
  transactionSignature?: string;
  success?: boolean;
  amount?: number;
}

export interface ChatMessage extends BaseMessage {
  type: MessageType.CHAT_MESSAGE;
  walletAddress: string;
  playerName: string;
  content: string;
}

interface PlayerBet {
  playerId: string;
  playerName: string;
  amount: number;
  position: number;
  timestamp: number;
}

interface Round {
  id: string;
  status: RoundStatus;
  startTime: number;
  endTime: number;
  bets: PlayerBet[];
  winningPosition?: number;
  isSpecialRound?: boolean;
}

export class GameSocket {
  private socket: WebSocket | null = null;
  private url: string;
  private callbacks: GameSocketCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000; // 1 second
  private isAuthError = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;

  constructor(url: string) {
    this.url = url;
    console.log('GameSocket initialized with URL:', url);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.cleanup();
        return;
      }

      // Check if we've missed too many heartbeats
      const now = Date.now();
      if (this.lastPongTime && (now - this.lastPongTime) > 90000) { // 90 seconds without pong
        console.log('Missed too many heartbeats, reconnecting...');
        this.cleanup();
        this.handleConnectionFailure();
        return;
      }

      // Send heartbeat
      try {
        this.socket.send(JSON.stringify({
          type: 'pong',
          timestamp: now
        }));
      } catch (error) {
        console.error('Error sending heartbeat:', error);
        this.cleanup();
        this.handleConnectionFailure();
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private handleMessage = (event: MessageEvent) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data);
      
      // Handle heartbeat ping from server
      if (message.type === MessageType.PING) {
        this.lastPongTime = Date.now();
        if (this.socket?.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({
            type: MessageType.PONG,
            timestamp: Date.now()
          }));
        }
        return;
      }

      console.log('Received WebSocket message:', message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      return;
    }

    try {
      // Handle different message types
      switch (message.type) {
        case MessageType.GAME_STATE:
          if (message.state) {
            console.log('Processing game state:', message.state);
            // Ensure we have valid round data
            if (message.state.currentRound) {
              const now = Date.now();
              const endTime = message.state.currentRound.endTime;
              
              // If the round has ended but status hasn't been updated
              if (endTime && now > endTime && message.state.currentRound.status === 'SPINNING') {
                // Request a fresh state to get the updated round status
                setTimeout(() => this.getGameState(), 1000);
              }
            }
            
            if (this.callbacks.onGameState) {
              this.callbacks.onGameState(message.state);
            }
          }
          break;

        case MessageType.ROUND_STARTED:
          console.log('Round started:', message.round);
          if (message.round && this.callbacks.onRoundStart) {
            this.callbacks.onRoundStart({ round: message.round });
          }
          // Request fresh state after round starts
          setTimeout(() => this.getGameState(), 500);
          break;

        case MessageType.ROUND_ENDED:
          console.log('Round ended:', message.round);
          if (message.round && this.callbacks.onRoundEnd) {
            this.callbacks.onRoundEnd({ round: message.round });
          }
          // Request fresh state after round ends
          setTimeout(() => this.getGameState(), 500);
          break;

        case MessageType.BET_PLACED:
          console.log('Bet placed:', message.bet);
          if (message.bet && this.callbacks.onBetPlaced) {
            console.log('Token distribution in BET_PLACED:', message.tokenDistribution);
            this.callbacks.onBetPlaced({
              bet: message.bet,
              tokenDistribution: message.tokenDistribution
            });
          }
          break;

        case MessageType.BET_CONFIRMED:
          console.log('Bet confirmed:', message);
          if (this.callbacks.onBetConfirmed) {
            const betConfirmation: BetConfirmation = {
              type: MessageType.BET_CONFIRMED,
              timestamp: message.timestamp,
              amount: message.bet?.amount || 0,
              success: !message.error,
              message: message.error || 'Bet placed successfully'
            };
            this.callbacks.onBetConfirmed(betConfirmation);
          }
          break;

        case MessageType.ERROR:
          if (typeof message.error === 'string') {
            console.error('WebSocket error:', message.error);
            toast.error(message.error);
          } else {
            console.error('WebSocket error (unknown format):', message);
            toast.error('An error occurred');
          }
          break;

        case MessageType.CHAT_MESSAGE:
          console.log('Chat message received:', message);
          if (this.callbacks.onChatMessage) {
            this.callbacks.onChatMessage(message as ChatMessage);
          }
          break;

        case MessageType.CHAT_HISTORY:
          console.log('Chat history received:', message);
          if (this.callbacks.onChatHistory && message.messages) {
            this.callbacks.onChatHistory({ messages: message.messages });
          }
          break;

        case MessageType.SPECIAL_ROUND_REGISTRATION_CONFIRMED:
          if (message.success) {
            toast.success('Successfully registered for special round');
          } else {
            toast.error(`Failed to register for special round: ${message.error}`);
          }
          break;

        case MessageType.WITHDRAWAL_CONFIRMED:
          if (this.callbacks.onWithdrawalConfirmed && message.walletAddress && message.amount) {
            this.callbacks.onWithdrawalConfirmed({
              walletAddress: message.walletAddress,
              amount: message.amount,
              transactionSignature: message.transactionSignature || ''
            });
          }
          break;

        case MessageType.WITHDRAWAL_FAILED:
          if (this.callbacks.onWithdrawalFailed && message.walletAddress && message.amount) {
            this.callbacks.onWithdrawalFailed({
              walletAddress: message.walletAddress,
              amount: message.amount,
              error: message.error || 'Withdrawal failed'
            });
          }
          break;

        case MessageType.SPECIAL_ROUND_REGISTRATION_CONFIRMATION: {
          const confirmation: SpecialRoundRegistrationConfirmation = {
            type: MessageType.SPECIAL_ROUND_REGISTRATION_CONFIRMED,
            success: !message.error,
            message: message.error || 'Registration processed successfully',
            timestamp: message.timestamp
          };
          if (this.callbacks.onSpecialRoundRegistrationConfirmed) {
            this.callbacks.onSpecialRoundRegistrationConfirmed(confirmation);
          }
          break;
        }

        default:
          console.warn('Unhandled message type:', message.type);
          break;
      }

      // General message callback
      if (this.callbacks.onMessage) {
        this.callbacks.onMessage(message);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  };

  private handleOpen = () => {
    console.log('WebSocket connection established');
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.isAuthError = false;
    this.lastPongTime = Date.now();
    
    // Start heartbeat after connection
    this.startHeartbeat();
    
    if (this.callbacks.onOpen) {
      this.callbacks.onOpen();
    }
    
    // Request initial game state
    this.getGameState();
  };

  private handleClose = (event: CloseEvent) => {
    console.log('WebSocket connection closed:', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });
    
    this.cleanup();
    
    // Only attempt reconnection for abnormal closures (code 1006)
    if (!event.wasClean && event.code === 1006) {
      this.handleConnectionFailure(event);
    }
    
    if (this.callbacks.onClose) {
      this.callbacks.onClose(event);
    }
  };

  private handleError = (error: Error | Event) => {
    console.error('WebSocket error:', error);
    if (this.callbacks.onError) {
      this.callbacks.onError(error instanceof Error ? new ErrorEvent('error', { error }) : error as Event);
    }
  };

  private cleanup(): void {
    // Clear any existing socket
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN || 
            this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close(1000, 'Normal closure');
        }
      } catch (e) {
        console.error('Error closing socket:', e);
      }
      this.socket = null;
    }

    // Clear intervals and timeouts
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isConnecting = false;
    this.lastPongTime = 0;
  }

  public async connect(): Promise<void> {
    // If already connected, don't proceed
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return Promise.resolve();
    }

    // If connection is in progress, wait for it
    if (this.isConnecting && this.connectionPromise) {
      console.log('WebSocket connection in progress, waiting...');
      return this.connectionPromise;
    }

    // Clear any existing socket and intervals
    this.cleanup();

    this.isConnecting = true;
    console.log('Connecting to WebSocket:', this.url);

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
          if (this.socket?.readyState !== WebSocket.OPEN) {
            console.log('WebSocket connection timeout');
            this.cleanup();
            this.handleConnectionFailure();
            reject(new Error('Connection timeout'));
          }
        }, 10000);

        this.socket.onopen = () => {
          clearTimeout(connectionTimeout);
          this.handleOpen();
          resolve();
        };

        this.socket.onclose = (event) => {
          clearTimeout(connectionTimeout);
          this.handleClose(event);
          if (!event.wasClean) {
            reject(new Error('Connection closed'));
          } else {
            resolve();
          }
        };

        this.socket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          this.handleError(error);
          reject(error);
        };

        this.socket.onmessage = this.handleMessage;

      } catch (error) {
        console.error('Error creating WebSocket:', error);
        this.cleanup();
        this.handleConnectionFailure();
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  public disconnect(): void {
    console.log('Disconnecting WebSocket');
    
    // Only proceed if we have an active socket
    if (!this.socket) {
      console.log('WebSocket already disconnected');
      return;
    }
    
    // Reset connection state
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.isAuthError = false;
    this.connectionPromise = null;
    
    // Clear any pending reconnection attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Cleanup resources
    this.cleanup();
  }

  // Helper to convert server bet format to client player format
  private convertPlayers(bets: Array<{
    playerId: string;
    playerName?: string;
    amount: number;
    timestamp: number;
  }>): Record<string, { amount: number }> {
    if (!bets || !Array.isArray(bets)) return {};
    
    console.log('Converting bets to players:', bets);
    
    const players: Record<string, { amount: number }> = {};
    
    bets.forEach(bet => {
      const playerId = bet.playerId;
      
      if (!players[playerId]) {
        players[playerId] = {
          amount: 0
        };
      }
      
      players[playerId].amount += bet.amount;
    });
    
    console.log('Converted players:', players);
    return players;
  }

  public setCallbacks(callbacks: GameSocketCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getGameState(): void {
    if (!this.socket) {
      console.error('Cannot get game state: WebSocket is null');
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot get game state: WebSocket is not open');
      return;
    }

    const message: GetStateMessage = {
      type: MessageType.GET_STATE,
      timestamp: Date.now()
    };
    
    this.send(message);
  }

  public placeBet(
    walletAddress: string,
    amount: number,
    playerId: string,
    playerName: string,
    position: number = 0
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot place bet: WebSocket not connected');
      return;
    }

    const message: PlaceBetMessage = {
      type: MessageType.PLACE_BET,
      timestamp: Date.now(),
      playerId,
      playerName,
      amount,
      position,
      walletAddress
    };
    
    console.log('Sending bet:', message);
    this.socket.send(JSON.stringify(message));
  }

  private send(message: OutgoingMessage): void {
    if (!this.socket) {
      console.error('Cannot send message: WebSocket is null');
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: WebSocket is not open');
      return;
    }
    
    try {
      const messageString = JSON.stringify(message);
      console.log('Sending WebSocket message:', message);
      this.socket.send(messageString);
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      throw error;
    }
  }

  /** Send a chat message */
  public sendChat(walletAddress: string, playerName: string, content: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected, cannot send chat message');
      return;
    }
    
    const chatMessage: SendChatMessage = {
      type: MessageType.SEND_CHAT,
      walletAddress,
      playerName,
      content,
      timestamp: Date.now()
    };
    
    this.send(chatMessage);
  }
  
  /** Get chat history */
  public getChatHistory(limit = 50): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected, cannot get chat history');
      return;
    }
    
    const message: GetChatMessage = {
      type: MessageType.GET_CHAT,
      timestamp: Date.now(),
      limit
    };
    
    this.send(message);
  }

  /** Register for special round */
  public registerForSpecialRound(walletAddress: string, playerName: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot register for special round: WebSocket not connected');
      return;
    }

    const message: RegisterSpecialRoundMessage = {
      type: MessageType.REGISTER_SPECIAL_ROUND,
      timestamp: Date.now(),
      walletAddress,
      playerName
    };

    this.send(message);
  }

  /** Admin command to end current round and start a new one */
  public adminEndAndStartNewRound(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot end round: WebSocket not connected');
      return;
    }

    const message: AdminEndRoundMessage = {
      type: MessageType.ADMIN_END_ROUND,
      timestamp: Date.now()
    };
    
    this.send(message);
  }

  private handleConnectionFailure = (event?: CloseEvent) => {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (this.callbacks.onMaxReconnectAttemptsReached) {
        this.callbacks.onMaxReconnectAttemptsReached();
      }
      return;
    }

    // Exponential backoff with jitter
    const baseDelay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000; // Add up to 1 second of random jitter
    const delay = Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // Only attempt reconnect if we're not already connecting
    if (!this.isConnecting) {
      this.reconnectTimeout = setTimeout(async () => {
        this.reconnectAttempts++;
        try {
          await this.connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }, delay);
    }
  };

  private handleSpecialRoundRegistration(message: SpecialRoundRegistrationConfirmation): void {
    if (message.success) {
      toast.success(message.message);
    } else {
      toast.error(message.message);
    }
  }
}

// Create a singleton instance
const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://spin-game-worker.prejupk.workers.dev';
console.log('Using WebSocket URL:', WEBSOCKET_URL);
const gameSocket = new GameSocket(WEBSOCKET_URL);

// Export the configured gameSocket instance
export default gameSocket; 