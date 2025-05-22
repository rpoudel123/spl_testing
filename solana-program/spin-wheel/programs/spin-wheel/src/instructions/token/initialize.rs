use crate::MINT_AUTHORITY_SEED;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{
            extension::{transfer_fee::TransferFeeConfig, ExtensionType},
            pod::PodMint,
            state::Mint as MintState,
            ID as spl_token_2022_program_id,
        },
        InitializeMint2,
    },
    token_interface::{
        spl_pod::optional_keys::OptionalNonZeroPubkey, transfer_fee_initialize, Mint, Token2022,
        TransferFeeInitialize,
    },
};

use crate::error::ErrorCode;
use crate::MAX_HOUSE_FEE_PERCENTAGE;

#[derive(Accounts)]
pub struct InitializeToken2022<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub mint_account: Signer<'info>,
    /// CHECK: The PDA that will be the mint authority for the new mint.
    #[account(
        seeds=[MINT_AUTHORITY_SEED],
        bump
    )]
    pub mint_authority_pda: AccountInfo<'info>,

    #[account(
        address = spl_token_2022_program_id @ ErrorCode::InvalidTokenProgram
    )]
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize(
    ctx: Context<InitializeToken2022>,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> Result<()> {
    msg!("--- Instruction: InitializeToken2022 ---");
    msg!(
        "Input Parameter - Transfer Fee Basis Points: {}",
        transfer_fee_basis_points
    );
    msg!("Input Parameter - Maximum Fee: {}", maximum_fee);
    msg!("Payer: {}", ctx.accounts.payer.key());
    msg!(
        "Mint Account address (to be created with keypair): {}",
        ctx.accounts.mint_account.key()
    );
    msg!(
        "Provided Mint Authority PDA (to be set as authority): {}",
        ctx.accounts.mint_authority_pda.key()
    );
    msg!("Token Program: {}", ctx.accounts.token_program.key());
    msg!("System Program: {}", ctx.accounts.system_program.key());

    if transfer_fee_basis_points > MAX_HOUSE_FEE_PERCENTAGE {
        msg!(
            "Error: Transfer fee basis points {} exceed maximum {}",
            transfer_fee_basis_points,
            MAX_HOUSE_FEE_PERCENTAGE
        );
        return err!(ErrorCode::InvalidHouseFeeConfig);
    }

    if transfer_fee_basis_points > 0 && maximum_fee == 0 {
        msg!("Error: Maximum fee cannot be 0 if transfer fee basis points are greater than 0");
        return err!(ErrorCode::FeeCalculationFailed);
    }

    let mint_size =
        ExtensionType::try_calculate_account_len::<PodMint>(&[ExtensionType::TransferFeeConfig])?;
    msg!(
        "Calculated Mint Account Size (with TransferFeeConfig extension): {}",
        mint_size
    );

    let lamports = Rent::get()?.minimum_balance(mint_size);
    msg!(
        "Calculated Minimum Lamports for Rent Exemption: {}",
        lamports
    );

    msg!("Calling CPI: create_account (for mint)");
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
    msg!(
        "CPI successful: Mint account created at {}.",
        ctx.accounts.mint_account.key()
    );

    let transfer_fee_config_authority = Some(ctx.accounts.mint_authority_pda.key());
    let withdraw_withheld_authority = Some(ctx.accounts.mint_authority_pda.key());
    msg!(
        "Transfer Fee Config Authority (for this mint): {:?}",
        transfer_fee_config_authority
    );
    msg!(
        "Withdraw Withheld Authority (for this mint): {:?}",
        withdraw_withheld_authority
    );

    msg!(
        "Calling CPI: transfer_fee_initialize (for mint {})",
        ctx.accounts.mint_account.key()
    );
    transfer_fee_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        transfer_fee_config_authority.as_ref(),
        withdraw_withheld_authority.as_ref(),
        transfer_fee_basis_points,
        maximum_fee,
    )?;
    msg!(
        "CPI successful: Transfer fee extension initialized for mint {}.",
        ctx.accounts.mint_account.key()
    );

    let decimals_to_set: u8 = 2;
    msg!(
        "Calling CPI: initialize_mint2 (for mint {})",
        ctx.accounts.mint_account.key()
    );
    msg!("  Decimals to set: {}", decimals_to_set);
    msg!(
        "  Mint Authority to set: {}",
        ctx.accounts.mint_authority_pda.key()
    );
    msg!(
        "  Freeze Authority to set: {}",
        ctx.accounts.mint_authority_pda.key()
    );

    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        decimals_to_set,
        &ctx.accounts.mint_authority_pda.key(),
        Some(&ctx.accounts.mint_authority_pda.key()),
    )?;
    msg!(
        "CPI successful: Mint {} initialized with mint authority {} and freeze authority {}.",
        ctx.accounts.mint_account.key(),
        ctx.accounts.mint_authority_pda.key(),
        ctx.accounts.mint_authority_pda.key()
    );
    msg!("--- InitializeToken2022 finished ---");
    Ok(())
}
