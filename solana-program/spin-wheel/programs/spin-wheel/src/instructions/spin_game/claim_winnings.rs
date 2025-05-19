use crate::{ErrorCode, GamePotSol, GameState, RoundState};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct ClaimSolWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>, // The player claiming their winnings

    #[account(
    mut,
    seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes()],
    bump,
    constraint = !round_state.is_active @ ErrorCode::RoundStillActive
    )]
    pub round_state: Box<Account<'info, RoundState>>,

    #[account(
        mut,
        seeds = [b"sol_pot".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub game_pot_sol: Account<'info, GamePotSol>,
    pub system_program: Program<'info, System>,
}

pub fn process_claim_sol_winnings(
    ctx: Context<ClaimSolWinnings>,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: ClaimSolWinnings ---");
    msg!("Winner attempting claim: {}", ctx.accounts.winner.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!(
        "GamePotSol PDA (source of SOL): {}",
        ctx.accounts.game_pot_sol.key()
    );

    let round_state = &ctx.accounts.round_state;

    if round_state.is_active {
        msg!(
            "Error: Round {} is still active. Cannot claim winnings yet.",
            round_state.id
        );
        return err!(ErrorCode::RoundStillActive);
    }
    let winner_index = round_state.winner_index.ok_or_else(|| {
        msg!(
            "Error: Winner has not been determined for round {}.",
            round_state.id
        );
        ErrorCode::RoundNotEnded
    })?;
    msg!(
        "Winner index for round {}: {}",
        round_state.id,
        winner_index
    );

    let winner_player_data = &round_state.players[winner_index as usize];
    require_keys_eq!(
        winner_player_data.pubkey,
        ctx.accounts.winner.key(),
        ErrorCode::UnauthorizedAccess
    );
    msg!("Caller {} confirmed as winner.", ctx.accounts.winner.key());

    if round_state.total_sol_pot < round_state.house_sol_fee {
        msg!(
            "Error: Total SOL pot {} is less than house fee {}. This should not happen.",
            round_state.total_sol_pot,
            round_state.house_sol_fee
        );
        return err!(ErrorCode::GameCalculationError);
    }
    let winnings_amount = round_state
        .total_sol_pot
        .checked_sub(round_state.house_sol_fee)
        .ok_or(ErrorCode::GameCalculationError)?;
    msg!("Calculated winnings amount for winner: {}", winnings_amount);

    if winnings_amount == 0 {
        msg!(
            "Winnings amount is 0. No SOL to claim (pot might have only covered fee or was empty)."
        );
        return Ok(());
    }

    msg!(
        "Attempting to transfer {} SOL winnings from GamePotSol {} to winner {}",
        winnings_amount,
        ctx.accounts.game_pot_sol.key(),
        ctx.accounts.winner.key()
    );
    let game_pot_account_info = ctx.accounts.game_pot_sol.to_account_info();
    let winner_account_info = ctx.accounts.winner.to_account_info();
    let game_pot_lamports = game_pot_account_info.lamports();
    msg!("Acctual lamports in GamePOTSOL PDA: {}", game_pot_lamports);
    let rent_for_game_pot = Rent::get()?.minimum_balance(game_pot_account_info.data_len());

    if game_pot_lamports <= rent_for_game_pot {
        msg!(
            "GamePotSol has no transferable lamports ({} total, {} needed for rent).",
            game_pot_lamports,
            rent_for_game_pot
        );
        // Even if calculatedWinnings was > 0, if the pot is empty (e.g. already claimed or error in previous step), there's nothing to transfer.
        return Ok(());
    }

    let available_to_transfer_from_pot = game_pot_lamports
        .checked_sub(rent_for_game_pot)
        .ok_or(ErrorCode::InsufficientFunds)?;
    let amount_to_actually_transfer =
        std::cmp::min(winnings_amount, available_to_transfer_from_pot);

    if amount_to_actually_transfer == 0 {
        msg!("Actual amount to transfer is 0. No SOL transferred.");
        return Ok(());
    }

    msg!(
        "Attempting to directly transfer {} SOL winnings from GamePotSol {} to winner {}",
        amount_to_actually_transfer,
        game_pot_account_info.key(),
        winner_account_info.key()
    );

    **game_pot_account_info.try_borrow_mut_lamports()? -= amount_to_actually_transfer;
    **winner_account_info.try_borrow_mut_lamports()? += amount_to_actually_transfer;

    msg!("$SOL Winnings of {} lamports transferred successfully to winner.", amount_to_actually_transfer);

    msg!("--- ClaimSolWinnings finished ---");
    Ok(())
}
