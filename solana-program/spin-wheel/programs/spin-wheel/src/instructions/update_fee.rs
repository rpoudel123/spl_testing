use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_fee_set, Mint, Token2022, TransferFeeSetTransferFee};

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
}

pub fn process_update_fee(
    ctx: Context<UpdateFee>,
    new_transfer_fee_basis_points: u16,
    new_maximum_fee: u64,
) -> Result<()> {
    msg!("--- Instruction: UpdateFee ---");
    msg!(
        "Authority (expected Transfer Fee Config Authority): {}",
        ctx.accounts.authority.key()
    );
    msg!(
        "Mint Account to update: {}",
        ctx.accounts.mint_account.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());
    msg!(
        "Attempting to set new Transfer Fee Basis Points: {}",
        new_transfer_fee_basis_points
    );
    msg!("Attempting to set new Maximum Fee: {}", new_maximum_fee);

    transfer_fee_set(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeSetTransferFee {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        new_transfer_fee_basis_points,
        new_maximum_fee,
    )?;

    msg!("transfer_fee_set CPI successful.");
    msg!(
        "Transfer fee for mint {} updated.",
        ctx.accounts.mint_account.key()
    );
    msg!("--- UpdateFee finished ---");
    Ok(())
}
