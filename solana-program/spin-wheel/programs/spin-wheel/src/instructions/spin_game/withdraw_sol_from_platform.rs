use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;
use crate::{UserPlatformEscrow, GameState, ErrorCode, WITHDRAWAL_FEE_LAMPORTS};

#[derive(Accounts)]
#[instruction(amount_to_withdraw: u64)]
pub struct WithdrawSolFromPlatform<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user_escrow", user.key().as_ref()],
        bump = user_platform_escrow.bump,
        constraint = user_platform_escrow.user_authority == user.key() @ ErrorCode::UnauthorizedEscrowAccess
    )]
    pub user_platform_escrow: Account<'info, UserPlatformEscrow>,

    #[account(seeds = [b"game_state"], bump)]
    pub game_state: Box<Account<'info, GameState>>,

    /// CHECK: This is the house_wallet Pubkey stored in game_state.
    #[account(
        mut,
        address = game_state.house_wallet @ ErrorCode::InvalidHouseWalletAddress
    )]
    pub house_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn process_withdraw_sol_from_platform(
    ctx: Context<WithdrawSolFromPlatform>,
    amount_to_withdraw: u64,
) -> Result<()> {
    msg!("--- Instruction: WithdrawSolFromPlatform ---");
    msg!("User {} attempting to withdraw {} lamports.", ctx.accounts.user.key(), amount_to_withdraw);
    msg!("Escrow account: {}, Current escrow data balance: {}", ctx.accounts.user_platform_escrow.key(), ctx.accounts.user_platform_escrow.balance);

    if amount_to_withdraw == 0 {
        msg!("Withdrawal amount is 0. No lamports transferred.");
        return err!(ErrorCode::InvalidWithdrawalAmount);
    }

    let escrow_account_data = &mut ctx.accounts.user_platform_escrow;
    let total_debit_from_escrow_balance_field = amount_to_withdraw
        .checked_add(WITHDRAWAL_FEE_LAMPORTS)
        .ok_or(ErrorCode::CalculationError)?;

    if escrow_account_data.balance < total_debit_from_escrow_balance_field {
        msg!("Error: Insufficient platform balance. Has {}, needs {}.",
            escrow_account_data.balance, total_debit_from_escrow_balance_field);
        return err!(ErrorCode::InsufficientPlatformBalance);
    }

    let escrow_account_info = escrow_account_data.to_account_info();
    let user_account_info = ctx.accounts.user.to_account_info();
    let house_wallet_account_info = ctx.accounts.house_wallet.to_account_info();

    let escrow_initial_lamports = escrow_account_info.lamports();
    msg!("Escrow PDA initial lamports: {}", escrow_initial_lamports);

    let rent_for_escrow_pda = Rent::get()?.minimum_balance(8 + std::mem::size_of::<UserPlatformEscrow>());
    msg!("Rent exempt minimum for escrow PDA: {}", rent_for_escrow_pda);

    if escrow_initial_lamports < total_debit_from_escrow_balance_field.checked_add(rent_for_escrow_pda).ok_or(ErrorCode::CalculationError)? &&
        escrow_account_data.balance == total_debit_from_escrow_balance_field {
        require!(
            escrow_initial_lamports.checked_sub(total_debit_from_escrow_balance_field).unwrap_or(0) >= rent_for_escrow_pda,
            ErrorCode::WithdrawWouldMakeEscrowRentDeficient
        );
        msg!("Rent check passed: Escrow will have {} lamports after debit, rent needed is {}.",
            escrow_initial_lamports.checked_sub(total_debit_from_escrow_balance_field).unwrap_or(0),
            rent_for_escrow_pda);
    }

    if WITHDRAWAL_FEE_LAMPORTS > 0 {
        **escrow_account_info.try_borrow_mut_lamports()? -= WITHDRAWAL_FEE_LAMPORTS;
        **house_wallet_account_info.try_borrow_mut_lamports()? += WITHDRAWAL_FEE_LAMPORTS;
        msg!("Transferred withdrawal fee of {} to house wallet {}.", WITHDRAWAL_FEE_LAMPORTS, house_wallet_account_info.key());
    }

    **escrow_account_info.try_borrow_mut_lamports()? -= amount_to_withdraw;
    **user_account_info.try_borrow_mut_lamports()? += amount_to_withdraw;
    msg!("Transferred withdrawal amount of {} to user {}.", amount_to_withdraw, user_account_info.key());

    escrow_account_data.balance = escrow_account_data.balance
        .checked_sub(total_debit_from_escrow_balance_field)
        .ok_or(ErrorCode::CalculationError)?;

    msg!("Escrow data balance updated to: {}. Escrow PDA lamports now: {}", escrow_account_data.balance, escrow_account_info.lamports());
    msg!("--- WithdrawSolFromPlatform finished for user {} ---", ctx.accounts.user.key());
    Ok(())
}