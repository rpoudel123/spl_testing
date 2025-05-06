use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::{
    DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
};
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{
            extension::{
                transfer_fee::TransferFeeConfig, BaseStateWithExtensions, ExtensionType,
                StateWithExtensions,
            },
            pod::PodMint,
            state::Mint as MintState,
        },
        InitializeMint2,
    },
    token_interface::{
        spl_pod::optional_keys::OptionalNonZeroPubkey, transfer_fee_initialize, Mint, Token2022,
        TransferFeeInitialize,
    },
};

#[derive(Accounts)]
pub struct InitializeToken2022<'info> {
    #[account(mut)]
    pub payer: Signer<'info>, // Paying for the account creation
    #[account(mut)]
    pub mint_account: Signer<'info>, // Mint account need to sign for the creation
    /// CHECK: The PDA that will be the mint authority
    #[account(
        seeds=[MINT_AUTHORITY_SEED],
        bump
    )]
    pub mint_authority_pda: AccountInfo<'info>, // PDA as mint authority

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize(
    ctx: Context<InitializeToken2022>,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> Result<()> {
    msg!("Payer: {}", ctx.accounts.payer.key());
    msg!(
        "Mint Account (to be created): {}",
        ctx.accounts.mint_account.key()
    );
    msg!(
        "Passed Mint Authority PDA: {}",
        ctx.accounts.mint_authority_pda.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());
    let mint_size =
        ExtensionType::try_calculate_account_len::<PodMint>(&[ExtensionType::TransferFeeConfig])?;

    let lamports = (Rent::get()?).minimum_balance(mint_size);

    create_account(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        lamports,
        mint_size as u64,
        &ctx.accounts.token_program.key(),
    )?;
    msg!("Mint account created.");

    let transfer_fee_config_authority = Some(ctx.accounts.payer.key());
    let withdraw_withheld_authority = Some(ctx.accounts.payer.key());

    transfer_fee_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        // Need to make this both a PDA later
        transfer_fee_config_authority.as_ref(),
        withdraw_withheld_authority.as_ref(),
        transfer_fee_basis_points,
        maximum_fee,
    )?;
    msg!("Transfer fee extension initialized.");

    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        2,
        &ctx.accounts.mint_authority_pda.key(),
        Some(&ctx.accounts.mint_authority_pda.key()),
    )?;
    msg!(
        "Mint initialized with PDA mint authority: {}",
        ctx.accounts.mint_authority_pda.key()
    );

    Ok(())
}
