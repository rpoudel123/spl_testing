use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock,
    hash::{hash, Hash},
    program::invoke_signed,
    system_instruction,
};
use std::convert::TryInto;

declare_id!("EFnej75ZjJwieQzb2KdeDM2GiLDJQK8aiXWdjd3TbUAn");

// Error codes
#[error_code]
pub enum SpinWheelError {
    #[msg("Round is not active")]
    RoundNotActive,
    #[msg("Round is already active")]
    RoundAlreadyActive,
    #[msg("Round has not ended")]
    RoundNotEnded,
    #[msg("Invalid bet amount")]
    InvalidBetAmount,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Unauthorized access")]
    UnauthorizedAccess,
    #[msg("Invalid seed commitment")]
    InvalidSeedCommitment,
    #[msg("Invalid revealed seed")]
    InvalidRevealedSeed,
    #[msg("Round has no players")]
    NoPlayers,
    #[msg("Maximum players reached")]
    MaxPlayersReached,
    #[msg("Bet window closed")]
    BetWindowClosed,
    #[msg("Invalid time parameters")]
    InvalidTimeParameters,
    #[msg("Spin already in progress")]
    SpinInProgress,
    #[msg("Calculation error")]
    CalculationError,
    #[msg("Invalid house fee")]
    InvalidHouseFee,
}

// Constants
const MAX_PLAYERS: usize = 10;
const MIN_BET_AMOUNT: u64 = 10_000_000; // 0.01 SOL in lamports
const MAX_BET_AMOUNT: u64 = 10_000_000_000; // 10 SOL in lamports
const HOUSE_FEE_PERCENTAGE: u8 = 3; // 3% house fee
const MAX_HOUSE_FEE_PERCENTAGE: u8 = 5; // Maximum allowed house fee
const MIN_ROUND_DURATION: i64 = 30; // 30 seconds minimum
const MAX_ROUND_DURATION: i64 = 300; // 5 minutes maximum
const SEED_BYTES_LENGTH: usize = 32;

// Type alias for seed arrays to help with IDL generation
pub type SeedArray = [u8; 32];

#[program]
pub mod spin_wheel {
    use super::*;

    // Initialize the game with a house wallet
    pub fn initialize(ctx: Context<Initialize>, house_fee_percentage: u8) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        let house_wallet = &ctx.accounts.house_wallet;

        // Validate house fee
        require!(
            house_fee_percentage <= MAX_HOUSE_FEE_PERCENTAGE,
            SpinWheelError::InvalidHouseFee
        );

        // Initialize game state
        game_state.authority = ctx.accounts.authority.key();
        game_state.house_wallet = house_wallet.key();
        game_state.house_fee_percentage = house_fee_percentage;
        game_state.round_counter = 0;
        game_state.is_initialized = true;

        msg!("Game initialized with house wallet: {}", house_wallet.key());
        Ok(())
    }

    // Start a new round with a cryptographic commitment
    pub fn start_round(
        ctx: Context<StartRound>,
        seed_commitment: SeedArray,
        round_duration: i64,
    ) -> Result<()> {
        let game_state = &ctx.accounts.game_state;
        let round_state = &mut ctx.accounts.round_state;
        let clock = Clock::get()?;

        // Validate round duration
        require!(
            round_duration >= MIN_ROUND_DURATION && round_duration <= MAX_ROUND_DURATION,
            SpinWheelError::InvalidTimeParameters
        );

        // Increment round counter
        let round_counter = game_state.round_counter + 1;

        // Initialize round state
        round_state.id = round_counter;
        round_state.start_time = clock.unix_timestamp;
        round_state.end_time = clock.unix_timestamp + round_duration;
        round_state.seed_commitment = seed_commitment;
        round_state.revealed_seed = None;
        round_state.total_pot = 0;
        round_state.player_count = 0;
        round_state.is_active = true;
        round_state.winner_index = None;
        round_state.house_fee = 0;

        // Update game state
        ctx.accounts.game_state.round_counter = round_counter;

        msg!(
            "Round {} started with duration {} seconds",
            round_counter,
            round_duration
        );
        Ok(())
    }

    // Place a bet in the current round
    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64) -> Result<()> {
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        // Validate round is active
        require!(
            ctx.accounts.round_state.is_active,
            SpinWheelError::RoundNotActive
        );

        // Validate bet window is still open
        require!(
            clock.unix_timestamp < ctx.accounts.round_state.end_time,
            SpinWheelError::BetWindowClosed
        );

        // Validate bet amount
        require!(
            amount >= MIN_BET_AMOUNT && amount <= MAX_BET_AMOUNT,
            SpinWheelError::InvalidBetAmount
        );

        // Validate player count
        require!(
            ctx.accounts.round_state.player_count < MAX_PLAYERS as u8,
            SpinWheelError::MaxPlayersReached
        );

        // Transfer SOL from player to the program account
        invoke_signed(
            &system_instruction::transfer(player.key, &ctx.accounts.round_state.key(), amount),
            &[
                player.to_account_info(),
                ctx.accounts.round_state.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        // Now we can borrow round_state mutably after the invoke_signed call
        let round_state = &mut ctx.accounts.round_state;

        // Check if player already has a bet
        let mut existing_player_index: Option<usize> = None;
        for (i, player_data) in round_state.players.iter().enumerate() {
            if player_data.pubkey == *player.key && player_data.amount > 0 {
                existing_player_index = Some(i);
                break;
            }
        }

        if let Some(index) = existing_player_index {
            // Update existing player's bet
            round_state.players[index].amount += amount;
        } else {
            // Add new player
            let player_index = round_state.player_count as usize;
            round_state.players[player_index] = PlayerData {
                pubkey: *player.key,
                amount,
            };
            round_state.player_count += 1;
        }

        // Update total pot
        round_state.total_pot += amount;

        msg!("Player {} placed bet of {} lamports", player.key, amount);
        Ok(())
    }

    // End the round and reveal the seed
    pub fn end_round(ctx: Context<EndRound>, revealed_seed: SeedArray) -> Result<()> {
        let round_state = &mut ctx.accounts.round_state;
        let game_state = &ctx.accounts.game_state;
        let house_wallet = &ctx.accounts.house_wallet;
        let clock = Clock::get()?;

        // Validate round is active
        require!(round_state.is_active, SpinWheelError::RoundNotActive);

        // Validate bet window is closed
        require!(
            clock.unix_timestamp >= round_state.end_time,
            SpinWheelError::RoundNotEnded
        );

        // Validate players exist
        require!(round_state.player_count > 0, SpinWheelError::NoPlayers);

        // Verify the revealed seed matches the commitment
        let seed_hash = hash(&revealed_seed).to_bytes();
        require!(
            seed_hash == round_state.seed_commitment,
            SpinWheelError::InvalidRevealedSeed
        );

        // Store the revealed seed
        round_state.revealed_seed = Some(revealed_seed);

        // Calculate house fee
        let house_fee = (round_state.total_pot * game_state.house_fee_percentage as u64) / 100;
        round_state.house_fee = house_fee;

        // Calculate winner using the revealed seed and additional entropy
        let winner_index = determine_winner(round_state, clock.unix_timestamp)?;
        round_state.winner_index = Some(winner_index);

        // Mark round as inactive
        round_state.is_active = false;

        // Transfer house fee to house wallet
        **round_state.to_account_info().try_borrow_mut_lamports()? -= house_fee;
        **house_wallet.to_account_info().try_borrow_mut_lamports()? += house_fee;

        msg!(
            "Round {} ended. Winner: {}",
            round_state.id,
            round_state.players[winner_index as usize].pubkey
        );
        Ok(())
    }

    // Claim winnings
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let round_state = &mut ctx.accounts.round_state;
        let winner = &ctx.accounts.winner;

        // Validate round is not active
        require!(!round_state.is_active, SpinWheelError::RoundAlreadyActive);

        // Validate winner
        let winner_index = round_state
            .winner_index
            .ok_or(SpinWheelError::RoundNotEnded)?;
        let winner_data = &round_state.players[winner_index as usize];

        require!(
            winner_data.pubkey == *winner.key,
            SpinWheelError::UnauthorizedAccess
        );

        // Calculate winnings (total pot minus house fee)
        let winnings = round_state.total_pot - round_state.house_fee;

        // Transfer winnings to winner
        **round_state.to_account_info().try_borrow_mut_lamports()? -= winnings;
        **winner.to_account_info().try_borrow_mut_lamports()? += winnings;

        msg!("Winner {} claimed {} lamports", winner.key, winnings);
        Ok(())
    }

    // Update house fee percentage (only callable by authority)
    pub fn update_house_fee(ctx: Context<UpdateHouseFee>, new_fee_percentage: u8) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;

        // Validate new fee
        require!(
            new_fee_percentage <= MAX_HOUSE_FEE_PERCENTAGE,
            SpinWheelError::InvalidHouseFee
        );

        // Update fee
        game_state.house_fee_percentage = new_fee_percentage;

        msg!("House fee updated to {}%", new_fee_percentage);
        Ok(())
    }

    // Update house wallet (only callable by authority)
    pub fn update_house_wallet(ctx: Context<UpdateHouseWallet>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        let new_house_wallet = &ctx.accounts.new_house_wallet;

        // Update house wallet
        game_state.house_wallet = new_house_wallet.key();

        msg!("House wallet updated to {}", new_house_wallet.key());
        Ok(())
    }
}

// Helper function to determine the winner using secure randomness
fn determine_winner(round_state: &RoundState, current_timestamp: i64) -> Result<u8> {
    // Ensure we have a revealed seed
    let revealed_seed = round_state
        .revealed_seed
        .ok_or(SpinWheelError::InvalidRevealedSeed)?;

    // Combine multiple sources of entropy
    let mut combined_entropy = [0u8; 32];

    // 1. Revealed seed
    for (i, byte) in revealed_seed.iter().enumerate() {
        combined_entropy[i % 32] ^= byte;
    }

    // 2. Current timestamp
    let timestamp_bytes = current_timestamp.to_le_bytes();
    for (i, byte) in timestamp_bytes.iter().enumerate() {
        combined_entropy[i % 32] ^= byte;
    }

    // 3. Total pot
    let pot_bytes = round_state.total_pot.to_le_bytes();
    for (i, byte) in pot_bytes.iter().enumerate() {
        combined_entropy[i % 32] ^= byte;
    }

    // 4. Player count
    combined_entropy[0] ^= round_state.player_count;

    // 5. Round ID
    let id_bytes = round_state.id.to_le_bytes();
    for (i, byte) in id_bytes.iter().enumerate() {
        combined_entropy[i % 32] ^= byte;
    }

    // Hash the combined entropy
    let entropy_hash = hash(&combined_entropy).to_bytes();

    // Convert first 8 bytes to u64 for the random value
    let random_value = u64::from_le_bytes(
        entropy_hash[0..8]
            .try_into()
            .map_err(|_| SpinWheelError::CalculationError)?,
    );

    // Calculate weighted random selection
    let mut cumulative_weight = 0;
    let total_pot = round_state.total_pot;

    // Scale random value to total pot
    let scaled_random = (random_value % total_pot) as u128;

    for i in 0..round_state.player_count {
        let player = &round_state.players[i as usize];
        cumulative_weight += player.amount as u128;

        if scaled_random < cumulative_weight {
            return Ok(i);
        }
    }

    // Fallback (should never happen if calculations are correct)
    Err(SpinWheelError::CalculationError.into())
}

// Account structures
#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub house_wallet: Pubkey,
    pub house_fee_percentage: u8,
    pub round_counter: u64,
    pub is_initialized: bool,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            house_wallet: Pubkey::default(),
            house_fee_percentage: HOUSE_FEE_PERCENTAGE,
            round_counter: 0,
            is_initialized: false,
        }
    }
}

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Default)]
pub struct PlayerData {
    pub pubkey: Pubkey,
    pub amount: u64,
}

#[account]
pub struct RoundState {
    pub id: u64,
    pub start_time: i64,
    pub end_time: i64,
    #[doc = "32 bytes seed commitment"]
    pub seed_commitment: [u8; 32],
    #[doc = "32 bytes revealed seed"]
    pub revealed_seed: Option<[u8; 32]>,
    pub total_pot: u64,
    pub player_count: u8,
    #[doc = "Array of 10 player data entries"]
    pub players: [PlayerData; 10],
    pub is_active: bool,
    pub winner_index: Option<u8>,
    pub house_fee: u64,
}

// Add a manual implementation of Default
impl Default for RoundState {
    fn default() -> Self {
        Self {
            id: 0,
            start_time: 0,
            end_time: 0,
            seed_commitment: [0; 32],
            revealed_seed: None,
            total_pot: 0,
            player_count: 0,
            players: [PlayerData::default(); 10],
            is_active: false,
            winner_index: None,
            house_fee: 0,
        }
    }
}

// Context structures
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<GameState>(),
        seeds = [b"game-state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: This is the house wallet that will receive fees
    pub house_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game-state"],
        bump,
        constraint = game_state.authority == authority.key() @ SpinWheelError::UnauthorizedAccess,
        constraint = game_state.is_initialized @ SpinWheelError::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<RoundState>(),
        seeds = [b"round-state", game_state.round_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub round_state: Account<'info, RoundState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        constraint = round_state.is_active @ SpinWheelError::RoundNotActive
    )]
    pub round_state: Account<'info, RoundState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"game-state"],
        bump,
        constraint = game_state.authority == authority.key() @ SpinWheelError::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub round_state: Account<'info, RoundState>,

    /// CHECK: This is the house wallet that will receive fees
    #[account(
        mut,
        constraint = game_state.house_wallet == house_wallet.key() @ SpinWheelError::UnauthorizedAccess
    )]
    pub house_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(mut)]
    pub round_state: Account<'info, RoundState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateHouseFee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game-state"],
        bump,
        constraint = game_state.authority == authority.key() @ SpinWheelError::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,
}

#[derive(Accounts)]
pub struct UpdateHouseWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game-state"],
        bump,
        constraint = game_state.authority == authority.key() @ SpinWheelError::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: This is the new house wallet
    pub new_house_wallet: AccountInfo<'info>,
}
