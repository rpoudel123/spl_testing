use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    withdraw_withheld_tokens_from_mint, Mint, Token2022, TokenAccount,
    WithdrawWithheldTokensFromMint,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// CHECK: The mint_authority_pda, which is the authority for withdrawing withheld tokens.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump
    )]
    pub pda_authority: AccountInfo<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn process_withdraw(ctx: Context<Withdraw>) -> Result<()> {
    msg!("--- Instruction: Withdraw (PDA Signed) ---");
    msg!(
        "PDA Authority (used for CPI signing): {}",
        ctx.accounts.pda_authority.key()
    );
    msg!(
        "Mint Account (source of withheld fees): {}",
        ctx.accounts.mint_account.key()
    );
    msg!(
        "Destination Token Account (for withdrawn fees): {}",
        ctx.accounts.token_account.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());

    let bump = ctx.bumps.pda_authority;
    let pda_signer_seeds: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[bump]];
    let signer_seeds = &[&pda_signer_seeds[..]];

    withdraw_withheld_tokens_from_mint(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        WithdrawWithheldTokensFromMint {
            token_program_id: ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.mint_account.to_account_info(),
            destination: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.pda_authority.to_account_info(),
        },
        signer_seeds,
    ))?;

    msg!("withdraw_withheld_tokens_from_mint CPI successful.");
    msg!(
        "Withheld fees withdrawn from mint {} to token account {}.",
        ctx.accounts.mint_account.key(),
        ctx.accounts.token_account.key()
    );

    msg!("--- Withdraw finished ---");
    Ok(())
}
