use crate::ErrorCode;
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::spl_token_2022::{
        extension::{
            transfer_fee::TransferFeeConfig, BaseStateWithExtensions, StateWithExtensions,
        },
        state::Mint as MintState,
    },
    token_interface::{
        transfer_checked_with_fee, Mint, Token2022, TokenAccount, TransferCheckedWithFee,
    },
};

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: Recipient can be any account, ATA is created if needed by init_if_needed constraint
    pub recipient: AccountInfo<'info>,

    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = sender,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = sender,
        associated_token::mint = mint_account,
        associated_token::authority = recipient,
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    msg!("--- Instruction: Transfer ---");
    msg!("Sender: {}", ctx.accounts.sender.key());
    msg!("Recipient: {}", ctx.accounts.recipient.key());
    msg!("Mint Account: {}", ctx.accounts.mint_account.key());
    msg!("Sender ATA: {}", ctx.accounts.sender_token_account.key());
    msg!(
        "Recipient ATA (may be initialized): {}",
        ctx.accounts.recipient_token_account.key()
    );
    msg!("Amount to transfer (pre-fee): {}", amount);
    msg!("Token Program: {}", ctx.accounts.token_program.key());

    let mint_info = &ctx.accounts.mint_account.to_account_info();
    let mint_data = mint_info.data.borrow();

    let mint_with_extension = StateWithExtensions::<MintState>::unpack(&mint_data)?;
    let transfer_fee_extension = mint_with_extension.get_extension::<TransferFeeConfig>()?;

    let clock = Clock::get()?;
    let current_epoch = clock.epoch;
    msg!("Current epoch for fee calculation: {}", current_epoch);

    let fee = transfer_fee_extension
        .calculate_epoch_fee(current_epoch, amount)
        .ok_or_else(|| {
            msg!("Error: Fee calculation returned None from SPL token program.");
            ErrorCode::FeeCalculationFailed
        })?;
    msg!("Calculated transfer fee: {}", fee);

    if amount < fee {
        msg!(
            "Error: Transfer amount ({}) is less than the calculated fee ({}).",
            amount,
            fee
        );
        return err!(ErrorCode::TransferAmountLessThanFee);
    }

    let decimals = ctx.accounts.mint_account.decimals;
    msg!("Mint decimals: {}", decimals);

    transfer_checked_with_fee(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferCheckedWithFee {
                token_program_id: ctx.accounts.token_program.to_account_info(),
                source: ctx.accounts.sender_token_account.to_account_info(),
                mint: ctx.accounts.mint_account.to_account_info(),
                destination: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.sender.to_account_info(),
            },
        ),
        amount,
        decimals,
        fee,
    )?;

    msg!("TransferCheckedWithFee CPI successful.");
    msg!(
        "Original transfer amount (passed to instruction): {}",
        amount
    );
    msg!("Fee charged by SPL Token Program: {}", fee);
    msg!("--- Transfer finished ---");
    Ok(())
}
