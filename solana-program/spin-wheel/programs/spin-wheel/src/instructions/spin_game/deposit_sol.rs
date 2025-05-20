use crate::{ErrorCode, UserPlatformEscrow};
use anchor_lang::{prelude::*, system_program};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<UserPlatformEscrow>(),
        seeds = [b"user_escrow", user.key().as_ref()],
        bump
    )]
    pub user_platform_escrow: Account<'info, UserPlatformEscrow>,

    pub system_program: Program<'info, System>,
}

pub fn process_deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
    msg!("--- Instruction: DepositSol ---");
    msg!(
        "User {} depositing {} lamports.",
        ctx.accounts.user.key(),
        amount
    );

    require!(amount > 0, ErrorCode::InvalidDepositAmount);

    let is_first_init_of_struct_fields = {
        let escrow_struct_peek = &ctx.accounts.user_platform_escrow;
        escrow_struct_peek.user_authority == Pubkey::default()
    };

    if is_first_init_of_struct_fields {
        msg!(
            "UserPlatformEscrow struct fields appear uninitialized. Setting for user {}.",
            ctx.accounts.user.key()
        );
        let escrow_struct_data = &mut ctx.accounts.user_platform_escrow;
        escrow_struct_data.user_authority = ctx.accounts.user.key();
        escrow_struct_data.balance = 0;
        escrow_struct_data.bump = ctx.bumps.user_platform_escrow;
        msg!(
            "Escrow struct fields initialized. Authority: {}, Balance: 0, Bump: {}",
            escrow_struct_data.user_authority,
            escrow_struct_data.bump
        );
    }

    if ctx.accounts.user_platform_escrow.user_authority != ctx.accounts.user.key() {
        msg!(
            "Unauthorized: Signer {} is not the authority {} of this escrow account.",
            ctx.accounts.user.key(),
            ctx.accounts.user_platform_escrow.user_authority
        );
        return err!(ErrorCode::UnauthorizedAccess);
    }

    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.user_platform_escrow.to_account_info(),
        },
    );
    system_program::transfer(cpi_context, amount)?;
    msg!(
        "Transferred {} lamports from user to escrow PDA (account lamports updated).",
        amount
    );

    let escrow_struct_final_update = &mut ctx.accounts.user_platform_escrow;
    escrow_struct_final_update.balance = escrow_struct_final_update
        .balance
        .checked_add(amount)
        .ok_or(ErrorCode::CalculationError)?;
    msg!(
        "Escrow struct 'balance' field updated to: {}",
        escrow_struct_final_update.balance
    );

    msg!(
        "--- DepositSol finished for user {} ---",
        ctx.accounts.user.key()
    );
    Ok(())
}
