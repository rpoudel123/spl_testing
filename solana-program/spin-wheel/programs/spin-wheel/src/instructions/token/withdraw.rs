use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    withdraw_withheld_tokens_from_mint, Mint, Token2022, TokenAccount,
    WithdrawWithheldTokensFromMint,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn process_withdraw(ctx: Context<Withdraw>) -> Result<()> {
    msg!("--- Instruction: Withdraw ---");
    msg!(
        "Authority (expected Withdraw Withheld Authority): {}",
        ctx.accounts.authority.key()
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

    withdraw_withheld_tokens_from_mint(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        WithdrawWithheldTokensFromMint {
            token_program_id: ctx.accounts.token_program.to_account_info(),
            mint: ctx.accounts.mint_account.to_account_info(),
            destination: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        },
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
