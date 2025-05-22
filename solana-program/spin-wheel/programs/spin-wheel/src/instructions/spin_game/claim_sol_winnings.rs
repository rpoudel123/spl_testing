use crate::{ErrorCode, GamePotSol, RoundState, RoundStatus, UserPlatformEscrow};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{rent::Rent, system_program};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct ClaimSolWinnings<'info> {
    #[account(mut)]
    pub winner_signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_escrow", winner_signer.key().as_ref()],
        bump = user_platform_escrow.bump,
        constraint = user_platform_escrow.user_authority == winner_signer.key() @ ErrorCode::UnauthorizedEscrowAccess
    )]
    pub user_platform_escrow: Account<'info, UserPlatformEscrow>,

    #[account(
        mut,
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_state.load()?.status_discriminant == RoundStatus::AwaitingSolClaim as u8 @ ErrorCode::RoundNotInAwaitingSolClaimState,
        constraint = round_state.load()?.winner_sol_pubkey == winner_signer.key() @ ErrorCode::NotTheSolWinner,
        constraint = round_state.load()?.winner_sol_claimed == 0 @ ErrorCode::SolWinningsAlreadyClaimed // 0 for false
    )]
    pub round_state: AccountLoader<'info, RoundState>,

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
    msg!("Winner Signer: {}", ctx.accounts.winner_signer.key());
    msg!(
        "User Platform Escrow: {}",
        ctx.accounts.user_platform_escrow.key()
    );
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!("GamePotSol PDA: {}", ctx.accounts.game_pot_sol.key());
    msg!("Round ID for PDAs: {}", round_id_for_pdas);

    let mut round_state_data = ctx.accounts.round_state.load_mut()?;
    let winnings_amount = round_state_data.winner_sol_amount;

    msg!("Attempting to claim {} SOL winnings.", winnings_amount);

    if winnings_amount > 0 {
        let game_pot_account_info = ctx.accounts.game_pot_sol.to_account_info();
        let user_escrow_account_info = ctx.accounts.user_platform_escrow.to_account_info();

        let rent_for_pot = Rent::get()?.minimum_balance(game_pot_account_info.data_len());
        require!(
            game_pot_account_info
                .lamports()
                .checked_sub(winnings_amount)
                .unwrap_or(0)
                >= rent_for_pot,
            ErrorCode::InsufficientFunds // Pot would become non-rent-exempt or have not enough funds
        );

        // Transfer SOL from GamePotSol PDA to UserPlatformEscrow PDA (actual lamports)
        **game_pot_account_info.try_borrow_mut_lamports()? -= winnings_amount;
        **user_escrow_account_info.try_borrow_mut_lamports()? += winnings_amount;
        msg!(
            "Transferred {} lamports from GamePotSol to UserPlatformEscrow (PDA lamports).",
            winnings_amount
        );

        // Update the balance field in UserPlatformEscrow struct
        let user_platform_escrow_data = &mut ctx.accounts.user_platform_escrow;
        user_platform_escrow_data.balance = user_platform_escrow_data
            .balance
            .checked_add(winnings_amount)
            .ok_or(ErrorCode::CalculationError)?;
        msg!(
            "UserPlatformEscrow struct 'balance' field updated to: {}",
            user_platform_escrow_data.balance
        );
    } else {
        msg!("No SOL winnings to claim (amount is zero).");
    }

    // Mark SOL winnings as claimed in RoundState
    round_state_data.winner_sol_claimed = 1; // 1 for true
                                             // Optionally, update status to SolClaimed if this is a distinct step before RewardPotAccountsCreated
    round_state_data.set_status(RoundStatus::SolClaimed);

    msg!(
        "SOL winnings of {} claimed successfully by {}. Round status updated to SolClaimed.",
        winnings_amount,
        ctx.accounts.winner_signer.key()
    );
    msg!("--- ClaimSolWinnings finished ---");
    Ok(())
}
