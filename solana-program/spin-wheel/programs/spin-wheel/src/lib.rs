use anchor_lang::prelude::*;
mod instructions;
use bytemuck::{Pod, Zeroable};
use instructions::*;

declare_id!("21HrGEnTMroXcp54bTCQKmgYS3uvbczsMRV6cBWGAnDV");

mod error;
pub use error::ErrorCode;

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
pub const CASHINO_REWARD_PER_ROUND_UNITS: u64 = 1_000_000;
pub const WITHDRAWAL_FEE_LAMPORTS: u64 = 10_000_000;

pub type SeedArray = [u8; SEED_BYTES_LENGTH];

#[account]
#[derive(Default, Debug)]
pub struct UserPlatformEscrow {
    pub user_authority: Pubkey,
    pub balance: u64,
    pub bump: u8,
}

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

#[derive(Copy, Clone, AnchorSerialize, AnchorDeserialize, Default, Debug, Pod, Zeroable)]
#[repr(C)]
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

#[derive(Copy, Clone, Default, Debug, Pod, Zeroable, AnchorSerialize, AnchorDeserialize)]
#[repr(C)]
pub struct PlayerCashinoRewards {
    pub player: Pubkey,
    pub sol_bet_amount: u64,
    pub cashino_reward_amount: u64,
    pub claimed_val: u8,
    pub _padding_pcr: [u8; 7],
}

#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum RoundStatus {
    #[default]
    Active = 0,
    AwaitingSolClaim = 1,
    SolClaimed = 2,
    RewardPotAccountsCreated = 3,
    TokensMintedForRewards = 4,
    RewardsProcessed = 5,
}

#[account(zero_copy)]
#[repr(C)]
#[derive(Debug, Default)]
pub struct RoundState {
    pub id: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub seed_commitment: SeedArray,

    pub has_revealed_seed_val: u8,
    pub _padding0: [u8; 7],
    pub revealed_seed: SeedArray,

    pub total_sol_pot: u64,
    pub player_count: u8,

    pub _padding1: [u8; 7],
    pub players: [PlayerData; MAX_PLAYERS],

    pub player_cashino_rewards: [PlayerCashinoRewards; MAX_PLAYERS],

    pub total_cashino_minted_for_round: u64,

    pub status_discriminant: u8,

    pub has_winner_val: u8,
    pub winner_index_val: u8,

    pub _padding_to_align_house_fee: [u8; 5],

    pub house_sol_fee: u64,

    pub winner_sol_pubkey: Pubkey,
    pub winner_sol_amount: u64,
    pub winner_sol_claimed: u8,

    pub _final_padding_for_struct: [u8; 7],
}

impl RoundState {
    pub fn initialize_new(
        &mut self,
        id: u64,
        start_time: i64,
        end_time: i64,
        seed_commitment: SeedArray,
    ) {
        self.id = id;
        self.start_time = start_time;
        self.end_time = end_time;
        self.seed_commitment = seed_commitment;
        self.has_revealed_seed_val = 0;
        self.total_sol_pot = 0;
        self.player_count = 0;
        self.total_cashino_minted_for_round = 0;
        self.status_discriminant = RoundStatus::Active as u8;
        self.has_winner_val = 0;
        self.winner_index_val = 0;
        self.house_sol_fee = 0;
        self.winner_sol_pubkey = Pubkey::default();
        self.winner_sol_amount = 0;
        self.winner_sol_claimed = 0;
    }

    pub fn get_revealed_seed(&self) -> Option<SeedArray> {
        if self.has_revealed_seed_val == 1 {
            Some(self.revealed_seed)
        } else {
            None
        }
    }

    pub fn set_revealed_seed(&mut self, seed: Option<SeedArray>) {
        if let Some(s_val) = seed {
            self.revealed_seed = s_val;
            self.has_revealed_seed_val = 1;
        } else {
            self.has_revealed_seed_val = 0;
        }
    }

    pub fn get_winner_index(&self) -> Option<u8> {
        if self.has_winner_val == 1 {
            Some(self.winner_index_val)
        } else {
            None
        }
    }

    pub fn set_winner_index(&mut self, index: Option<u8>) {
        if let Some(i_val) = index {
            self.winner_index_val = i_val;
            self.has_winner_val = 1;
        } else {
            self.has_winner_val = 0;
        }
    }

    pub fn get_status(&self) -> Result<RoundStatus> {
        match self.status_discriminant {
            0 => Ok(RoundStatus::Active),
            1 => Ok(RoundStatus::AwaitingSolClaim),
            2 => Ok(RoundStatus::SolClaimed),
            3 => Ok(RoundStatus::RewardPotAccountsCreated),
            4 => Ok(RoundStatus::TokensMintedForRewards),
            5 => Ok(RoundStatus::RewardsProcessed),
            _ => Err(error!(ErrorCode::InvalidStatusDiscriminant)),
        }
    }

    pub fn set_status(&mut self, new_status: RoundStatus) {
        self.status_discriminant = new_status as u8;
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
    ) -> Result<()> {
        instructions::game_initialize::process_initialize_game_settings(ctx, house_fee_basis_points)
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

    pub fn finalize_round(
        ctx: Context<FinalizeRound>,
        revealed_seed_arg: SeedArray,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::finalize_round::process_finalize_round(
            ctx,
            revealed_seed_arg,
            round_id_for_pdas,
        )
    }

    pub fn create_reward_pot_accounts(
        ctx: Context<CreateRewardPotAccounts>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::create_reward_pot_accounts::process_create_reward_pot_accounts(
            ctx,
            round_id_for_pdas,
        )
    }
    pub fn mint_tokens_to_reward_pot(
        ctx: Context<MintTokensToRewardPot>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::mint_tokens_to_reward_pot::process_mint_tokens_to_reward_pot(
            ctx,
            round_id_for_pdas,
        )
    }

    pub fn calculate_reward_entitlements(
        ctx: Context<CalculateRewardEntitlements>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::calculate_reward_entitlements::process_calculate_reward_entitlements(
            ctx,
            round_id_for_pdas,
        )
    }

    pub fn claim_cashino_rewards(
        ctx: Context<ClaimCashinoRewards>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::claim_cashino_rewards::process_claim_cashino_rewards(ctx, round_id_for_pdas)
    }

    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        instructions::deposit_sol::process_deposit_sol(ctx, amount)
    }

    pub fn withdraw_sol_from_platform(
        ctx: Context<WithdrawSolFromPlatform>,
        amount_to_withdraw: u64,
    ) -> Result<()> {
        instructions::withdraw_sol_from_platform::process_withdraw_sol_from_platform(
            ctx,
            amount_to_withdraw,
        )
    }

    pub fn claim_sol_winnings(
        ctx: Context<ClaimSolWinnings>,
        round_id_for_pdas: u64,
    ) -> Result<()> {
        instructions::claim_sol_winnings::process_claim_sol_winnings(ctx, round_id_for_pdas)
    }

    // pub fn update_game_fee(ctx: Context<UpdateGameFee>, new_fee_basis_points: u16) -> Result<()> {
    //     instructions::game_admin::process_update_game_fee(ctx, new_fee_basis_points)
    // }
    //
    // pub fn update_game_house_wallet(ctx: Context<UpdateGameHouseWallet>) -> Result<()> {
    //     instructions::game_admin::process_update_game_house_wallet(ctx)
    // }
}
