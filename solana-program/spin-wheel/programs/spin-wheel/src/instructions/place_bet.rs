use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock,
    program::invoke,
    system_instruction
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
    RoundStatus
};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64, amount: u64)]
pub struct PlaceSolBet<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

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
    pub game_pot: Box<Account<'info, GamePotSol>>,
    pub system_program: Program<'info, System>,
}

pub fn process_place_sol_bet(
    ctx: Context<PlaceSolBet>,
    round_id_for_pdas: u64,
    amount: u64
) -> Result<()> {
    msg!("--- Instruction: PlaceSolBet ---");
    msg!("Player: {}", ctx.accounts.player.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);
    msg!("Bet Amount (SOL lamports): {}", amount);
    msg!("GameState PDA: {}", ctx.accounts.game_state.key());
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!("GamePotSol PDA: {}", ctx.accounts.game_pot.key());

    let player_key = ctx.accounts.player.key();
    let mut round_state = &mut ctx.accounts.round_state.load_mut()?;
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

    let mut is_new_player = true;
    for i in 0..round_state.player_count as usize {
        if round_state.players[i].pubkey == player_key { 
            is_new_player = false;
            break;
        }
    }

    if is_new_player {
        require!(
            round_state.player_count < MAX_PLAYERS as u8,
            ErrorCode::MaxPlayersReached
        );
        msg!("New player check: Player count {} is less than MAX_PLAYERS {}.", round_state.player_count, MAX_PLAYERS);
    }

    msg!("Preparing to transfer {} SOL from player {} to GamePotSol PDA {}",
        amount,
        ctx.accounts.player.key(),
        ctx.accounts.game_pot.key()
    );
    
    invoke(
        &system_instruction::transfer(
            &ctx.accounts.player.key(),
            &ctx.accounts.game_pot.key(),
            amount,
        ),
        &[
            ctx.accounts.player.to_account_info(),
            ctx.accounts.game_pot.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    msg!("SOL transfer successful to GamePotSol PDA.");

    let mut player_found_and_updated = false;
    for i in 0..round_state.player_count as usize { 
        if round_state.players[i].pubkey == player_key {
            round_state.players[i].amount = round_state.players[i].amount.checked_add(amount).ok_or(ErrorCode::GameCalculationError)?; // Add to existing bet
            player_found_and_updated = true;
            msg!("Player {} updated existing bet. New total bet: {}", player_key, round_state.players[i].amount);
            break;
        }
    }

    if !player_found_and_updated {
        if (round_state.player_count as usize) < MAX_PLAYERS {
            let current_player_count_as_index = round_state.player_count as usize;
            round_state.players[current_player_count_as_index] = PlayerData {
                pubkey: player_key,
                amount,
            };
            round_state.player_count += 1;
            msg!("New player {} added with bet amount {}. Player count: {}", player_key, amount, round_state.player_count);
        } else {
            msg!("Error: Attempted to add new player but MAX_PLAYERS already reached. This should have been caught earlier.");
            return err!(ErrorCode::MaxPlayersReached);
        }
    }

    round_state.total_sol_pot = round_state.total_sol_pot.checked_add(amount).ok_or(ErrorCode::GameCalculationError)?;
    msg!("RoundState.total_sol_pot (data field) updated to: {}", round_state.total_sol_pot);

    msg!("Player {} successfully placed/updated bet of {} lamports for round {}.", player_key, amount, round_id_for_pdas);
    msg!("--- PlaceSolBet finished ---");
    Ok(())
}