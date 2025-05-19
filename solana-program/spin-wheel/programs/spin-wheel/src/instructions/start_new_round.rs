use crate::{
    ErrorCode, GamePotSol, GameState, PlayerData, RoundState, RoundStatus, SeedArray, MAX_PLAYERS,
    MAX_ROUND_DURATION, MIN_ROUND_DURATION, SEED_BYTES_LENGTH, PlayerCashinoRewards
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::clock::Clock;

#[derive(Accounts)]
#[instruction(seed_commitment: SeedArray, round_duration: i64, round_id_for_seed: u64)]
pub struct StartNewRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key() @ErrorCode::UnauthorizedAccess,
        constraint = game_state.is_initialized @ErrorCode::UnauthorizedAccess,
        constraint = game_state.round_counter == round_id_for_seed @ErrorCode::InvalidRoundIdForSeed
    )]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<RoundState>(),
        seeds = [b"round_state".as_ref(), &round_id_for_seed.to_le_bytes().as_ref()],
        bump
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    pub system_program: Program<'info, System>,

    #[account(
        init,
        payer = authority,
        space = 8,
        seeds = [b"sol_pot".as_ref(), &round_id_for_seed.to_le_bytes().as_ref()],
        bump
    )]
    pub game_pot: Box<Account<'info, GamePotSol>>,
}

pub fn process_start_new_round(
    ctx: Context<StartNewRound>,
    seed_commitment: SeedArray,
    round_duration: i64,
    round_id_for_seed: u64,
) -> Result<()> {
    msg!("--- Instruction: StartNewRound ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("Game State PDA: {}", ctx.accounts.game_state.key());
    msg!(
        "RoundState PDA to be initialized at: {}",
        ctx.accounts.round_state.key()
    );
    msg!(
        "GamePotSol PDA to be initialized at: {}",
        ctx.accounts.game_pot.key()
    );
    msg!(
        "Seed Commitment: {:?}",
        &seed_commitment
    );
    msg!("Requested Round Duration: {} seconds", round_duration);
    msg!(
        "Round ID for Seed (from client, current game_state.round_counter): {}",
        round_id_for_seed
    );

    let game_state = &mut ctx.accounts.game_state;
    let round_state = &mut ctx.accounts.round_state.load_init()?;
    let clock = Clock::get()?;

    require!(
        round_duration >= MIN_ROUND_DURATION && round_duration <= MAX_ROUND_DURATION,
        ErrorCode::InvalidTimeParameters
    );
    msg!("Round duration validated ({} seconds).", round_duration);

    game_state.round_counter += 1;
    let new_round_id_for_state_struct = game_state.round_counter;

    msg!("Initializing new RoundState (zero_copy) with ID: {}", new_round_id_for_state_struct);

    msg!(
        "Game round counter in GameState incremented to: {}",
        new_round_id_for_state_struct
    );
    msg!(
        "(RoundState PDA was derived using previous round_counter: {})",
        round_id_for_seed
    );

    round_state.id = new_round_id_for_state_struct;
    round_state.start_time = clock.unix_timestamp;
    round_state.end_time = clock.unix_timestamp + round_duration;
    round_state.seed_commitment = seed_commitment;
    round_state.has_revealed_seed_val = 0;
    round_state.revealed_seed = [0u8; SEED_BYTES_LENGTH];
    round_state.total_sol_pot = 0;
    round_state.player_count = 0;
    for i in 0..MAX_PLAYERS {
        round_state.players[i] = PlayerData::default();
        round_state.player_cashino_rewards[i] = PlayerCashinoRewards::default();
    }
    round_state.total_cashino_minted_for_round = 0;
    round_state.status_discriminant = RoundStatus::Active as u8;
    round_state.has_winner_val = 0;
    round_state.winner_index_val = 0;
    round_state.house_sol_fee = 0;

    msg!("New RoundState PDA data initialized:");
    msg!("  Round ID in state: {}", round_state.id);
    msg!("  Start Time: {}", round_state.start_time);
    msg!("  End Time: {}", round_state.end_time);
    msg!("  Is Active: {:?}", round_state.status_discriminant);
    msg!(
        "New GamePotSol PDA created: {}",
        ctx.accounts.game_pot.key()
    );
    msg!("--- StartNewRound finished ---");
    Ok(())
}
