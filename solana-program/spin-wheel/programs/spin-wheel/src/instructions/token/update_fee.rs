use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_fee_set, Mint, Token2022, TransferFeeSetTransferFee};

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    /// CHECK: The mint_authority_pda, which is the authority for configuring transfer fees.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump
    )]
    pub pda_authority: AccountInfo<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
}

pub fn process_update_fee(
    ctx: Context<UpdateFee>,
    new_transfer_fee_basis_points: u16,
    new_maximum_fee: u64,
) -> Result<()> {
    msg!("--- Instruction: UpdateFee (PDA Signed) ---");
    msg!(
        "PDA Authority (used for CPI signing): {}",
        ctx.accounts.pda_authority.key()
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

    let bump = ctx.bumps.pda_authority;
    let pda_signer_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[bump]];
    let signer_seeds = &[&pda_signer_seeds[..]];

    transfer_fee_set(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeSetTransferFee {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                authority: ctx.accounts.pda_authority.to_account_info(),
            },
            signer_seeds,
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
