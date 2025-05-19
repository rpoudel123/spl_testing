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
    msg!("--- Instruction: Harvest ---");
    msg!(
        "Attempting to harvest fees to mint: {}",
        ctx.accounts.mint_account.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());

    let sources = ctx
        .remaining_accounts
        .iter()
        .filter_map(
            |account_info| match InterfaceAccount::<TokenAccount>::try_from(account_info) {
                Ok(token_account) => {
                    if token_account.mint == ctx.accounts.mint_account.key() {
                        msg!(
                            "  + Source ATA for harvesting: {} (Mint: {})",
                            account_info.key(),
                            token_account.mint
                        );
                        Some(account_info.to_account_info())
                    } else {
                        msg!(
                            "  - Skipping account {} (Mint mismatch: {})",
                            account_info.key(),
                            token_account.mint
                        );
                        None
                    }
                }
                Err(_) => {
                    msg!(
                        "  - Skipping account {} (Not a valid TokenAccount interface)",
                        account_info.key()
                    );
                    None
                }
            },
        )
        .collect::<Vec<_>>();

    if sources.is_empty() {
        msg!(
            "No valid source token accounts found to harvest from for mint {}.",
            ctx.accounts.mint_account.key()
        );
    } else {
        msg!(
            "Found {} source token account(s) to harvest from.",
            sources.len()
        );
    }

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

    msg!("Harvest CPI called. Fees (if any) transferred to mint account.");
    msg!("--- Harvest finished ---");
    Ok(())
}
