use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::mint_to as spl_mint_to,
    token_interface::{Mint, MintTo as SplMintToAccounts, Token2022, TokenAccount},
};

use crate::ErrorCode;

#[derive(Accounts)]
pub struct MintTokensToAccount<'info> {
    /// CHECK: This is the PDA, derived from seeds. We will verify its address and use it to sign.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump,
    )]
    pub mint_authority_pda: AccountInfo<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

pub fn process_mint_tokens(ctx: Context<MintTokensToAccount>, amount: u64) -> Result<()> {
    msg!("--- Instruction: MintTokensToAccount ---"); // Entry log
    msg!("Amount to mint: {}", amount);
    msg!(
        "Recipient Token Account: {}",
        ctx.accounts.recipient_token_account.key()
    );
    msg!(
        "Mint Account being minted from: {}",
        ctx.accounts.mint_account.key()
    );
    msg!(
        "Mint Authority PDA (passed as AccountInfo): {}",
        ctx.accounts.mint_authority_pda.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());

    let bump_seed = ctx.bumps.mint_authority_pda;
    msg!("Bump seed for mint_authority_pda: {}", bump_seed);

    let pda_signer_seeds_set: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[bump_seed]];
    let all_signer_seeds = &[pda_signer_seeds_set][..];

    let (expected_pda, _expected_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], ctx.program_id);
    msg!("Expected PDA (derived in program): {}", expected_pda);

    if ctx.accounts.mint_authority_pda.key() != expected_pda {
        msg!(
            "CRITICAL ERROR: PDA Mismatch! Passed mint_authority_pda: {}, Expected PDA: {}",
            ctx.accounts.mint_authority_pda.key(),
            expected_pda
        );
        return err!(ErrorCode::BumpSeedNotInHashMap);
    }
    msg!("PDA check passed: Provided mint_authority_pda matches expected derivation.");

    msg!("Preparing to call CPI: spl_mint_to");
    msg!("  CPI Authority: {}", ctx.accounts.mint_authority_pda.key());
    msg!("  CPI Mint: {}", ctx.accounts.mint_account.key());
    msg!(
        "  CPI To (Recipient ATA): {}",
        ctx.accounts.recipient_token_account.key()
    );
    msg!("  CPI Amount: {}", amount);

    spl_mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SplMintToAccounts {
                mint: ctx.accounts.mint_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.mint_authority_pda.to_account_info(),
            },
            all_signer_seeds,
        ),
        amount,
    )?;

    msg!("spl_mint_to CPI successful.");
    msg!("--- MintTokensToAccount finished ---");
    Ok(())
}
