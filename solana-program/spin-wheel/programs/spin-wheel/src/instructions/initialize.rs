use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::Rent;
use anchor_lang::solana_program::{program_error::ProgramError, program_option::COption};
use anchor_lang::system_program::{create_account, CreateAccount};
use anchor_lang::system_program::{transfer as system_transfer, Transfer as SystemTransfer};
use anchor_spl::token_2022::{
    initialize_mint2,
    spl_token_2022::{
        extension::{ExtensionType, PodStateWithExtensions},
        pod::PodMint,
    },
    InitializeMint2,
};
use anchor_spl::token_interface::Mint;
use anchor_spl::token_interface::Token2022;
use anchor_spl::token_interface::{
    metadata_pointer_initialize, spl_pod::optional_keys::OptionalNonZeroPubkey,
    token_metadata_initialize, MetadataPointerInitialize, TokenMetadataInitialize,
};
use anchor_spl::token_interface::{transfer_fee_initialize, TransferFeeInitialize};
use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct TokenMetadataArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

#[derive(Accounts)]
pub struct InitializeFeeMint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub mint_account: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize_fee_mint(
    ctx: Context<InitializeFeeMint>,
    decimals: u8,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> Result<()> {
    msg!("process_initialize_fee_mint entered!");
    let payer_account_info = ctx.accounts.payer.to_account_info();
    let payer_key = payer_account_info.key();
    let mint_account_info = ctx.accounts.mint_account.to_account_info();
    let system_program_info = ctx.accounts.system_program.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();

    msg!("Calculating size for Mint + TransferFeeConfig...");
    let extensions = [ExtensionType::TransferFeeConfig];
    let mint_size = ExtensionType::try_calculate_account_len::<PodMint>(&extensions)?;
    msg!("Calculated mint account size: {}", mint_size);

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(mint_size);
    msg!("Required lamports for rent exemption: {}", lamports);

    create_account(
        CpiContext::new(
            system_program_info.clone(),
            CreateAccount {
                from: payer_account_info.clone(),
                to: mint_account_info.clone(),
            },
        ),
        lamports,
        mint_size as u64,
        token_program_info.key,
    )?;
    msg!("Mint account created");

    msg!("Initializing TransferFeeConfig extension...");
    transfer_fee_initialize(
        CpiContext::new(
            token_program_info.clone(),
            TransferFeeInitialize {
                token_program_id: token_program_info.clone(),
                mint: mint_account_info.clone(),
            },
        ),
        Some(&payer_key),
        Some(&payer_key),
        transfer_fee_basis_points,
        maximum_fee,
    )?;
    msg!("TransferFee Initialized");

    msg!("Initializing base Mint data...");
    initialize_mint2(
        CpiContext::new(
            token_program_info.clone(),
            InitializeMint2 {
                mint: mint_account_info.clone(),
            },
        ),
        decimals,
        &payer_key,
        Some(&payer_key),
    )?;
    msg!("Base Mint Initialized");

    msg!("Fee Mint initialization complete.");
    Ok(())
}

#[derive(Accounts)]
pub struct AddMetadata<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    pub update_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
}

pub fn process_add_metadata(
    ctx: Context<AddMetadata>,
    metadata_args: TokenMetadataArgs,
) -> Result<()> {
    msg!("process_add_metadata entered!");
    let payer_account_info = ctx.accounts.payer.to_account_info();
    let mint_account_info = ctx.accounts.mint_account.to_account_info();
    let mint_key = mint_account_info.key();
    let update_authority_key = ctx.accounts.update_authority.key();
    let update_authority_info = ctx.accounts.update_authority.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let system_program_info = ctx.accounts.system_program.to_account_info();

    msg!("Initializing MetadataPointer extension...");
    metadata_pointer_initialize(
        CpiContext::new(
            token_program_info.clone(),
            MetadataPointerInitialize {
                token_program_id: token_program_info.clone(),
                mint: mint_account_info.clone(),
            },
        ),
        Some(update_authority_key),
        Some(mint_key),
    )?;
    msg!("MetadataPointer Initialized");

    msg!("Calculating size needed for metadata TLV entry...");
    let metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(update_authority_key))?,
        mint: mint_key,
        name: metadata_args.name.clone(),
        symbol: metadata_args.symbol.clone(),
        uri: metadata_args.uri.clone(),
        additional_metadata: vec![],
    };
    let metadata_tlv_size = metadata.get_packed_len()? + 4;
    msg!("Metadata TLV entry size: {}", metadata_tlv_size);

    let rent = Rent::get()?;
    let additional_lamports = rent.minimum_balance(metadata_tlv_size);
    msg!(
        "Additional lamports for metadata rent: {}",
        additional_lamports
    );

    if additional_lamports > 0 {
        msg!("Transferring additional lamports for metadata rent...");
        system_transfer(
            CpiContext::new(
                system_program_info.clone(),
                SystemTransfer {
                    from: payer_account_info.clone(),
                    to: mint_account_info.clone(),
                },
            ),
            additional_lamports,
        )?;
    }

    msg!("Initializing Metadata content...");
    token_metadata_initialize(
        CpiContext::new(
            token_program_info.clone(),
            TokenMetadataInitialize {
                token_program_id: token_program_info.clone(),
                mint: mint_account_info.clone(),
                metadata: mint_account_info.clone(),
                mint_authority: update_authority_info.clone(),
                update_authority: update_authority_info.clone(),
            },
        ),
        metadata_args.name,
        metadata_args.symbol,
        metadata_args.uri,
    )?;
    msg!("Metadata Content Initialized");
    msg!("Metadata added successfully.");
    Ok(())
}
