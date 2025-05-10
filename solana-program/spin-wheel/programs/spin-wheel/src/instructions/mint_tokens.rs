use crate::ErrorCode;
use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::mint_to as spl_mint_to,
    token_interface::{Mint, MintTo as SplMintToAccounts, Token2022, TokenAccount},
};

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
    msg!("--- Instruction: MintTokensToAccount (Public Entry) ---");
    internal_perform_mint(
        &ctx.accounts.mint_authority_pda,
        &ctx.accounts.mint_account,
        &ctx.accounts.recipient_token_account,
        &ctx.accounts.token_program,
        ctx.bumps.mint_authority_pda,
        amount,
        ctx.program_id,
    )?;
    msg!("--- MintTokensToAccount (Public Entry) finished ---");
    Ok(())
}

pub fn internal_perform_mint<'info>(
    mint_authority_pda_info: &AccountInfo<'info>,
    mint_account_interface: &InterfaceAccount<'info, Mint>,
    recipient_token_account_interface: &InterfaceAccount<'info, TokenAccount>,
    token_program_interface: &Program<'info, Token2022>,
    mint_authority_pda_bump: u8,
    amount: u64,
    expected_program_id_for_pda_check: &Pubkey,
) -> Result<()> {
    msg!("--- internal_perform_mint called ---");
    msg!("Amount to mint: {}", amount);
    msg!(
        "Recipient Token Account: {}",
        recipient_token_account_interface.key()
    );
    msg!(
        "Mint Account being minted from: {}",
        mint_account_interface.key()
    );
    msg!(
        "Mint Authority PDA (AccountInfo): {}",
        mint_authority_pda_info.key()
    );
    msg!(
        "Mint Authority PDA Bump being used: {}",
        mint_authority_pda_bump
    );
    msg!(
        "Expected Program ID for PDA check: {}",
        expected_program_id_for_pda_check
    );

    let (expected_pda, _expected_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED], expected_program_id_for_pda_check);

    if mint_authority_pda_info.key() != expected_pda {
        msg!(
            "CRITICAL ERROR in internal_perform_mint: PDA Mismatch! Passed mint_authority_pda: {}, Expected PDA: {}",
            mint_authority_pda_info.key(),
            expected_pda
        );
        return err!(ErrorCode::InvalidMintAuthorityPDA);
    }

    msg!("PDA check passed for internal_perform_mint.");

    let pda_signer_seeds_set: &[&[u8]] = &[MINT_AUTHORITY_SEED, &[mint_authority_pda_bump]];
    let all_signer_seeds = &[pda_signer_seeds_set][..];

    msg!("Preparing for SPL mint_to CPI in internal_perform_mint");
    msg!("  CPI Authority: {}", mint_authority_pda_info.key());
    msg!("  CPI Mint: {}", mint_account_interface.key());
    msg!(
        "  CPI To (Recipient ATA): {}",
        recipient_token_account_interface.key()
    );
    msg!("  CPI Amount: {}", amount);

    spl_mint_to(
        CpiContext::new_with_signer(
            token_program_interface.to_account_info(),
            SplMintToAccounts {
                mint: mint_account_interface.to_account_info(),
                to: recipient_token_account_interface.to_account_info(),
                authority: mint_authority_pda_info.to_account_info(),
            },
            all_signer_seeds,
        ),
        amount,
    )?;
    msg!("SPL mint_to CPI successful in internal_perform_mint.");
    msg!("--- internal_perform_mint finished ---");
    Ok(())
}
