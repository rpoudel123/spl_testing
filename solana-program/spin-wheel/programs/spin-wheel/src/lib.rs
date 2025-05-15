use anchor_lang::prelude::*;
mod instructions;
use instructions::*;

declare_id!("21HrGEnTMroXcp54bTCQKmgYS3uvbczsMRV6cBWGAnDV");

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid authority pda provided.")]
    InvalidMintAuthorityPDA,
    #[msg("Bump seed not found for PDA.")]
    BumpSeedNotInHashMap,
    #[msg("Transfer amount is less than the calculated fee.")]
    TransferAmountLessThanFee,
    #[msg("Fee calculation failed.")]
    FeeCalculationFailed,
    #[msg("Invalid mint account provided.")]
    InvalidMintAccount,
    // Spin Wheel Error
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
    #[msg("Invalid house fee config")]
    InvalidHouseFeeConfig,
    #[msg("Invalid round ID provided for PDA seed")]
    InvalidRoundIdForSeed,
    #[msg("Game calculation error")]
    GameCalculationError,
    #[msg("No players in round")]
    NoPlayersInRound,
    #[msg("Error in PDA Bump")]
    PdaBumpError,
    #[msg("Round is still active")]
    RoundStillActive,
    #[msg("Winner not yet determined for this round.")]
    WinnerNotDetermined,
}

pub const MINT_AUTHORITY_SEED: &[u8] = b"mint_authority";
pub const INITIAL_GAME_HOUSE_FEE_BASIS_POINTS: u16 = 10;
pub const MAX_GAME_HOUSE_FEE_BASIS_POINTS: u16 = 500;

const MAX_PLAYERS: usize = 10;
const MIN_BET_AMOUNT: u64 = 10_000_000;
const MAX_BET_AMOUNT: u64 = 10_000_000_000;
const HOUSE_FEE_PERCENTAGE: u8 = 10;
const MAX_HOUSE_FEE_PERCENTAGE: u16 = 500;
const MIN_ROUND_DURATION: i64 = 1;
const MAX_ROUND_DURATION: i64 = 300;
const SEED_BYTES_LENGTH: usize = 32;

pub type SeedArray = [u8; SEED_BYTES_LENGTH];

#[account]
#[derive(Debug)]
pub struct GameState {
    pub authority: Pubkey,
    pub house_wallet: Pubkey,
    pub house_fee_basis_points: u16,
    pub round_counter: u64,
    pub is_initialized: bool,
    pub cashino_mint: Pubkey,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            authority: Pubkey::default(),
            house_wallet: Pubkey::default(),
            house_fee_basis_points: INITIAL_GAME_HOUSE_FEE_BASIS_POINTS,
            round_counter: 0,
            is_initialized: false,
            cashino_mint: Pubkey::default(),
        }
    }
}

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct PlayerData {
    pub pubkey: Pubkey,
    pub amount: u64,
}

#[account]
#[derive(Default, Debug)]
pub struct GamePotSol {}

#[account]
#[derive(Default, Debug)]
pub struct RoundCashinoRewardsPot {
    pub round_id: u64,
    pub total_minted_for_round: u64,
}

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Default, Debug)]
pub struct PlayerCashinoRewards {
    pub player: Pubkey,
    pub sol_bet_amount: u64,
    pub cashino_reward_amount: u64,
    pub claimed: bool,
}

#[account]
#[derive(Debug)]
pub struct RoundState {
    pub id: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub seed_commitment: SeedArray,
    pub revealed_seed: Option<SeedArray>,
    pub total_sol_pot: u64,
    pub player_count: u8,
    pub players: [PlayerData; MAX_PLAYERS],
    pub player_cashino_rewards: [PlayerCashinoRewards; MAX_PLAYERS],
    pub total_cashino_minted_for_round: u64,
    pub is_active: bool,
    pub winner_index: Option<u8>,
    pub house_sol_fee: u64,
}

impl Default for RoundState {
    fn default() -> Self {
        Self {
            id: 0,
            start_time: 0,
            end_time: 0,
            seed_commitment: [0u8; SEED_BYTES_LENGTH],
            revealed_seed: None,
            total_sol_pot: 0,
            player_count: 0,
            players: [PlayerData::default(); MAX_PLAYERS],
            player_cashino_rewards: [PlayerCashinoRewards::default(); MAX_PLAYERS],
            total_cashino_minted_for_round: 0,
            is_active: false,
            winner_index: None,
            house_sol_fee: 0,
        }
    }
}

#[program]
pub mod spin_wheel {
    use super::*;

    pub fn initialize_token_2022(
        ctx: Context<InitializeToken2022>,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        instructions::initialize::process_initialize(ctx, transfer_fee_basis_points, maximum_fee)
    }

    pub fn mint_tokens_to_account(ctx: Context<MintTokensToAccount>, amount: u64) -> Result<()> {
        instructions::mint_tokens::process_mint_tokens(ctx, amount)
    }

    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
        instructions::transfer::process_transfer(ctx, amount)
    }

    pub fn harvest<'info>(ctx: Context<'_, '_, 'info, 'info, Harvest<'info>>) -> Result<()> {
        instructions::harvest::process_harvest(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::process_withdraw(ctx)
    }

    pub fn update_fee(
        ctx: Context<UpdateFee>,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        instructions::update_fee::process_update_fee(ctx, transfer_fee_basis_points, maximum_fee)
    }

    pub fn initialize_game_settings(
        ctx: Context<InitializeGameSettings>,
        house_fee_basis_points: u16,
        cashino_mint_address: Pubkey,
    ) -> Result<()> {
        instructions::game_initialize::process_initialize_game_settings(
            ctx,
            house_fee_basis_points,
            cashino_mint_address,
        )
    }

    pub fn start_new_round(
        ctx: Context<StartNewRound>,
        seed_commitment: SeedArray,
        round_duration: i64,
        round_id_for_seed: u64,
    ) -> Result<()> {
        instructions::start_new_round::process_start_new_round(
            ctx,
            seed_commitment,
            round_duration,
            round_id_for_seed,
        )
    }

    pub fn place_sol_bet(
        ctx: Context<PlaceSolBet>,
        round_id_for_pdas: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::place_bet::process_place_sol_bet(ctx, round_id_for_pdas, amount)
    }

    pub fn end_round(
        ctx: Context<EndGameRound>,
        revealed_seed: Vec<u8>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        msg!("NEW_ORDER_REVEALED_SEED_VEC: {:?}", revealed_seed); // Log the Vec
        msg!("NEW_ORDER_ROUND_ID_FOR_PDA: {:?}", round_id_for_pdas);

        // Convert Vec<u8> to SeedArray [u8; 32] for your logic
        if revealed_seed.len() != SEED_BYTES_LENGTH {
            // Or handle as an error appropriate to your logic
            msg!("Error: revealed_seed length is not {}", SEED_BYTES_LENGTH);
            return err!(ErrorCode::InvalidRevealedSeed); // Or a new error code
        }
        let mut revealed_seed_array: SeedArray = [0u8; SEED_BYTES_LENGTH];
        revealed_seed_array.copy_from_slice(&revealed_seed[..SEED_BYTES_LENGTH]);
        
        let round_state = &ctx.accounts.round_state; // Assuming EndGameRound context has round_state
        require!(revealed_seed_array == round_state.seed_commitment, ErrorCode::InvalidRevealedSeed);
        msg!("Revealed seed (from vec) matches commitment.");
        
        instructions::end_round::process_end_game_round(ctx, round_id_for_pdas, revealed_seed_array); // original call order in process func may need update

        Ok(())
        // instructions::end_round::process_end_game_round(ctx, round_id_for_pdas, revealed_seed)
    }

    pub fn claim_sol_winnings(ctx: Context<ClaimSolWinnings>, round_id_for_pdas: u64) -> Result<()> {
        instructions::claim_winnings::process_claim_sol_winnings(ctx, round_id_for_pdas)
    }

    pub fn update_game_fee(ctx: Context<UpdateGameFee>, new_fee_basis_points: u16) -> Result<()> {
        instructions::game_admin::process_update_game_fee(ctx, new_fee_basis_points)
    }

    pub fn update_game_house_wallet(ctx: Context<UpdateGameHouseWallet>) -> Result<()> {
        instructions::game_admin::process_update_game_house_wallet(ctx)
    }

}
