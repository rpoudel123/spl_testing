use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock,
};
use crate::{
    GameState,
    RoundState,
    GamePotSol,
    PlayerData,
    ErrorCode,
    MIN_BET_AMOUNT,
    MAX_BET_AMOUNT,
    MAX_PLAYERS,
    RoundStatus,
    UserPlatformEscrow
};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64, amount: u64)]
pub struct PlaceSolBet<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_escrow", player.key().as_ref()],
        bump = user_platform_escrow.bump,
        constraint = user_platform_escrow.user_authority == player.key() @ ErrorCode::UnauthorizedEscrowAccess,
        constraint = user_platform_escrow.balance >= amount @ ErrorCode::InsufficientPlatformBalance
    )]
    pub user_platform_escrow: Account<'info, UserPlatformEscrow>,

    #[account(seeds = [b"game_state"], bump)]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        mut, 
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes().as_ref()],
        bump,
        constraint = round_state.load()?.status_discriminant == RoundStatus::Active as u8 @ ErrorCode::RoundNotActive,
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    #[account(
        mut,
        seeds = [b"sol_pot".as_ref(), &round_id_for_pdas.to_le_bytes().as_ref()],
        bump
    )]
    pub game_pot: Account<'info, GamePotSol>,

    pub system_program: Program<'info, System>,
}

pub fn process_place_sol_bet(
    ctx: Context<PlaceSolBet>,
    round_id_for_pdas: u64,
    amount: u64
) -> Result<()> {
    msg!("--- Instruction: PlaceSolBet ---");
    msg!("Player: {}", ctx.accounts.player.key());
    msg!("User Platform Escrow Account: {}", ctx.accounts.user_platform_escrow.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);
    msg!("Bet Amount (SOL lamports): {}", amount);
    msg!("GameState PDA: {}", ctx.accounts.game_state.key());
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!("GamePotSol PDA: {}", ctx.accounts.game_pot.key());
    msg!("Current Escrow Balance: {}", ctx.accounts.user_platform_escrow.balance);

    let player_key = ctx.accounts.player.key();
    let round_state = &mut ctx.accounts.round_state.load_mut()?;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp < round_state.end_time,
        ErrorCode::BetWindowClosed
    );

    msg!("Bet window is open. (Current: {}, End: {}).", clock.unix_timestamp, round_state.end_time);

    require!(
        amount >= MIN_BET_AMOUNT && amount <= MAX_BET_AMOUNT,
        ErrorCode::InvalidBetAmount
    );

    msg!("Bet amount {} validated against min {} and max {}.", amount, MIN_BET_AMOUNT, MAX_BET_AMOUNT);

    let mut player_found_and_updated = false;
    let mut player_index_to_update = 0; // hold the index of the player

    for i in 0..(round_state.player_count as usize) {
        if round_state.players[i].pubkey == player_key {
            player_index_to_update = i;
            player_found_and_updated = true;
            break;
        }
    }

    if player_found_and_updated {
        round_state.players[player_index_to_update].amount = round_state.players[player_index_to_update]
            .amount
            .checked_add(amount)
            .ok_or(ErrorCode::CalculationError)?;
        msg!("Player {} updated existing bet. New total bet for player: {}", player_key, round_state.players[player_index_to_update].amount);
    } else {
        require!(
            round_state.player_count < MAX_PLAYERS as u8,
            ErrorCode::MaxPlayersReached
        );
        msg!("New player check: Player count {} is less than MAX_PLAYERS {}.", round_state.player_count, MAX_PLAYERS);

        let current_player_count_as_index = round_state.player_count as usize;
        round_state.players[current_player_count_as_index] = PlayerData {
            pubkey: player_key,
            amount,
        };
        round_state.player_count += 1;
        msg!("New player {} added with bet amount {}. Player count now: {}", player_key, amount, round_state.player_count);
    }

    msg!("Preparing to transfer {} SOL from UserPlatformEscrow {} to GamePotSol PDA {}",
        amount,
        ctx.accounts.user_platform_escrow.key(),
        ctx.accounts.game_pot.key()
    );
    
    **ctx.accounts.user_platform_escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
    ctx.accounts.user_platform_escrow.balance = ctx.accounts.user_platform_escrow.balance
        .checked_sub(amount)
        .ok_or(ErrorCode::InsufficientPlatformBalance)?;
    
    **ctx.accounts.game_pot.to_account_info().try_borrow_mut_lamports()? += amount;

    msg!("SOL transfer successful from UserPlatformEscrow to GamePotSol PDA.");
    msg!("UserPlatformEscrow new data balance: {}", ctx.accounts.user_platform_escrow.balance);
    
    round_state.total_sol_pot = round_state.total_sol_pot
        .checked_add(amount)
        .ok_or(ErrorCode::CalculationError)?;
    msg!("RoundState.total_sol_pot (data field) updated to: {}", round_state.total_sol_pot);

    msg!("Player {} successfully placed/updated bet of {} lamports using platform escrow for round {}.", player_key, amount, round_id_for_pdas);
    msg!("--- PlaceSolBet finished ---");

    Ok(())
}