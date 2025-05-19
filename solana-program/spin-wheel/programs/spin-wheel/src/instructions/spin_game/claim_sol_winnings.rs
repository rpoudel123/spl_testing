use crate::{ErrorCode, GamePotSol, RoundState, RoundStatus};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct ClaimSolWinnings<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"round_state", &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_state.load()?.status_discriminant == RoundStatus::WinnerDeterminedFeePaid as u8 @ ErrorCode::RoundNotInCorrectState
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    #[account(
        mut,
        seeds = [b"sol_pot", &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub game_pot_sol: Account<'info, GamePotSol>,

    pub system_program: Program<'info, System>,
}

pub fn process_claim_sol_winnings(
    ctx: Context<ClaimSolWinnings>,
    _round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: ClaimSolWinnings ---");
    msg!("Winner attempting to claim: {}", ctx.accounts.winner.key());
    msg!("Round ID for PDAs: {}", _round_id_for_pdas);

    let round = ctx.accounts.round_state.load_mut()?;

    let winner_index = round
        .get_winner_index()
        .ok_or(ErrorCode::WinnerNotDetermined)?;
    msg!("Winner index from round state: {}", winner_index);

    let player_data = &round.players[winner_index as usize];
    msg!("Winner pubkey from round state: {}", player_data.pubkey);

    require_keys_eq!(
        player_data.pubkey,
        ctx.accounts.winner.key(),
        ErrorCode::UnauthorizedAccess
    );
    msg!("Winner authorization verified successfully");

    let total = round.total_sol_pot;
    let fee = round.house_sol_fee;
    msg!("Total pot: {} lamports, House fee: {} lamports", total, fee);

    require!(total >= fee, ErrorCode::GameCalculationError);
    let mut amount = total.checked_sub(fee).unwrap();
    msg!(
        "Initial winnings calculation (total - fee): {} lamports",
        amount
    );

    let pot_info = ctx.accounts.game_pot_sol.to_account_info();
    let winner_info = ctx.accounts.winner.to_account_info();
    let rent = Rent::get()?.minimum_balance(pot_info.data_len());
    let available = pot_info.lamports().saturating_sub(rent);
    msg!("Game pot current balance: {} lamports", pot_info.lamports());
    msg!("Rent reserve required: {} lamports", rent);
    msg!("Available balance for withdrawal: {} lamports", available);

    amount = amount.min(available);
    msg!(
        "Final withdrawal amount (min of calculated and available): {} lamports",
        amount
    );

    if amount > 0 {
        **pot_info.try_borrow_mut_lamports()? -= amount;
        **winner_info.try_borrow_mut_lamports()? += amount;
        msg!("Successfully transferred {} lamports to winner", amount);
    } else {
        msg!("No lamports available for withdrawal");
    }

    msg!("--- ClaimSolWinnings finished ---");
    Ok(())
}
