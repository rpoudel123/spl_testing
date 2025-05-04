use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    harvest_withheld_tokens_to_mint, HarvestWithheldTokensToMint, Mint, Token2022, TokenAccount,
};

#[derive(Accounts)]
pub struct Harvest<'info> {
    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
}

pub fn process_harvest<'info>(ctx: Context<'_, '_, 'info, 'info, Harvest<'info>>) -> Result<()> {
    let sources = ctx
        .remaining_accounts
        .iter()
        .filter_map(|account| {
            InterfaceAccount::<TokenAccount>::try_from(account)
                .ok()
                .filter(|token_account| token_account.mint == ctx.accounts.mint_account.key())
                .map(|_| account.to_account_info())
        })
        .collect::<Vec<_>>();

    harvest_withheld_tokens_to_mint(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            HarvestWithheldTokensToMint {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        sources,
    )?;
    Ok(())
}
