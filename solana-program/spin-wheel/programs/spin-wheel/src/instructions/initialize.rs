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
    pub payer: Signer<'info>,
    #[account(mut)]
    pub mint_account: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize(
    ctx: Context<InitializeToken2022>,
    transfer_fee_basis_points: u16,
    maximum_fee: u64,
) -> Result<()> {
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

    transfer_fee_initialize(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferFeeInitialize {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        Some(&ctx.accounts.payer.key()),
        Some(&ctx.accounts.payer.key()),
        transfer_fee_basis_points,
        maximum_fee,
    )?;

    initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.mint_account.to_account_info(),
            },
        ),
        2,
        &ctx.accounts.payer.key(),
        Some(&ctx.accounts.payer.key()),
    )?;

    ctx.accounts.check_mint_data()?;
    Ok(())
}

impl<'info> InitializeToken2022<'info> {
    pub fn check_mint_data(&self) -> Result<()> {
        let mint = &self.mint_account.to_account_info();
        let mint_data = mint.data.borrow();
        let mint_with_extension = StateWithExtensions::<MintState>::unpack(&mint_data)?;
        let extension_data = mint_with_extension.get_extension::<TransferFeeConfig>()?;

        assert_eq!(
            extension_data.transfer_fee_config_authority,
            OptionalNonZeroPubkey::try_from(Some(self.payer.key()))?
        );

        assert_eq!(
            extension_data.withdraw_withheld_authority,
            OptionalNonZeroPubkey::try_from(Some(self.payer.key()))?
        );

        msg!("{:?}", extension_data);
        Ok(())
    }
}
