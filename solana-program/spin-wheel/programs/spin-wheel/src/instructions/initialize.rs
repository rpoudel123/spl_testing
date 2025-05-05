use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::{
    DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
};
use anchor_lang::system_program::{create_account, transfer, CreateAccount, Transfer};
use anchor_spl::{
    token_2022::{
        initialize_mint2,
        spl_token_2022::{
            extension::{
                metadata_pointer::MetadataPointer, transfer_fee::TransferFeeConfig,
                BaseStateWithExtensions, ExtensionType, StateWithExtensions,
            },
            pod::PodMint,
            state::Mint as MintState,
        },
        InitializeMint2,
    },
    token_interface::{
        metadata_pointer_initialize, spl_pod::optional_keys::OptionalNonZeroPubkey,
        token_metadata_initialize, transfer_fee_initialize, MetadataPointerInitialize, Mint,
        Token2022, TokenMetadataInitialize, TransferFeeInitialize,
    },
};
use spl_token_metadata_interface::state::TokenMetadata;
use spl_type_length_value::variable_len_pack::VariableLenPack;

use anchor_lang::solana_program::program_error::ProgramError;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::rent::Rent;

#[derive(Accounts)]
pub struct InitializeToken2022<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub mint_account: Signer<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct TokenMetadataArgs {
    pub name: String,
    pub symbol: String,
    pub uri: String,
}

pub fn process_initialize(
    ctx: Context<InitializeToken2022>,
    decimals: u8,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
    metadata_args: TokenMetadataArgs,
) -> Result<()> {
    msg!("process_initialize entered!");
    let payer_key = ctx.accounts.payer.key();
    let mint_key = ctx.accounts.mint_account.key();

    let extensions_to_init = [
        ExtensionType::TransferFeeConfig,
        ExtensionType::MetadataPointer,
    ];

    let base_size = ExtensionType::try_calculate_account_len::<PodMint>(&extensions_to_init)?;

    let metadata = TokenMetadata {
        update_authority: OptionalNonZeroPubkey::try_from(Some(payer_key))?,
        mint: mint_key,
        name: metadata_args.name.clone(),
        symbol: metadata_args.symbol.clone(),
        uri: metadata_args.uri.clone(),
        additional_metadata: vec![],
    };

    msg!("Calculating size for Mint + TransferFeeConfig only...");
    let extensions_for_now = [ExtensionType::TransferFeeConfig]; // Only TF
    let size_for_now = ExtensionType::try_calculate_account_len::<PodMint>(&extensions_for_now)?;

    let variable_metadata_size = metadata.get_packed_len()? + 4;
    // let mint_size = base_size + variable_metadata_size;
    let mint_size = size_for_now;
    msg!("Calculated temporary mint account size: {}", mint_size);

    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(mint_size);

    msg!("Calculated mint account size: {}", mint_size);
    msg!("Required lamports for rent exemption: {}", lamports);

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
    msg!("Mint account created");

    msg!("Initializing TransferFeeConfig extension...");
    transfer_fee_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        Some(&payer_key),
        Some(&payer_key),
        transfer_fee_basis_points,
        maximum_fee,
    )?;

    // msg!("Initializing MetadataPointer extension...");
    // metadata_pointer_initialize(
    //     CpiContext::new(
    //         ctx.accounts.token_program.to_account_info(),
    //         MetadataPointerInitialize {
    //             token_program_id: ctx.accounts.token_program.to_account_info(),
    //             mint: ctx.accounts.mint_account.to_account_info(),
    //         },
    //     ),
    //     Some(payer_key),
    //     Some(mint_key),
    // )?;

    msg!("Initializing base Mint data...");
    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        decimals,
        &payer_key,
        Some(&payer_key),
    )?;

    // msg!("Initializing Metadata content...");
    // token_metadata_initialize(
    //     CpiContext::new(
    //         ctx.accounts.token_program.to_account_info(),
    //         TokenMetadataInitialize {
    //             token_program_id: ctx.accounts.token_program.to_account_info(),
    //             mint: ctx.accounts.mint_account.to_account_info(),
    //             metadata: ctx.accounts.mint_account.to_account_info(),
    //             mint_authority: ctx.accounts.payer.to_account_info(),
    //             update_authority: ctx.accounts.payer.to_account_info(),
    //         },
    //     ),
    //     metadata_args.name,
    //     metadata_args.symbol,
    //     metadata_args.uri,
    // )?;

    // msg!("Mint with Transfer Fee and Metadata initialized successfully!");
    msg!("Initialization partially complete (create(temp size), fee, mint done).");
    Ok(())
}

impl<'info> InitializeToken2022<'info> {
    pub fn check_mint_data(&self) -> Result<()> {
        let mint_info = &self.mint_account.to_account_info();
        let mint_data = mint_info.data.borrow();
        let mint_with_extensions = StateWithExtensions::<MintState>::unpack(&mint_data)?;

        msg!("Checking TransferFeeConfig...");
        let transfer_fee_config = mint_with_extensions.get_extension::<TransferFeeConfig>()?;
        assert_eq!(
            transfer_fee_config.transfer_fee_config_authority,
            OptionalNonZeroPubkey::try_from(Some(self.payer.key()))
                .map_err(|_| ProgramError::InvalidAccountData)?
        );
        assert_eq!(
            transfer_fee_config.withdraw_withheld_authority,
            OptionalNonZeroPubkey::try_from(Some(self.payer.key()))
                .map_err(|_| ProgramError::InvalidAccountData)?
        );
        msg!("Transfer Fee Config Data: {:?}", transfer_fee_config);

        msg!("Checking MetadataPointer...");
        let metadata_pointer = mint_with_extensions.get_extension::<MetadataPointer>()?;
        assert_eq!(
            metadata_pointer.authority,
            OptionalNonZeroPubkey::try_from(Some(self.payer.key()))
                .map_err(|_| ProgramError::InvalidAccountData)?
        );
        assert_eq!(
            metadata_pointer.metadata_address,
            OptionalNonZeroPubkey::try_from(Some(self.mint_account.key()))
                .map_err(|_| ProgramError::InvalidAccountData)?
        );
        msg!("Metadata Pointer Data: {:?}", metadata_pointer);

        msg!("Metadata content check requires TLV parsing (not shown here).");

        Ok(())
    }
}
