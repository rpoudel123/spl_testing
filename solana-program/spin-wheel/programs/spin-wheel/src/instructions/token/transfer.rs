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
    pub recipient: SystemAccount<'info>,
    #[account(mut)]
    pub mint_account: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = sender,
        associated_token::token_program = token_program,
    )]
    pub sender_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,    
        payer = sender,
        associated_token::mint = mint_account,
        associated_token::authority = recipient,
        associated_token::token_program = token_program
    )]
    pub recipient_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
    msg!("--- Instruction: Transfer ---");
    msg!("Sender (authority): {}", ctx.accounts.sender.key());
    msg!("Recipient SystemAccount (authority for dest ATA): {}", ctx.accounts.recipient.key());
    msg!("Mint Account: {}", ctx.accounts.mint_account.key());
    msg!("Sender Token Account (source): {}", ctx.accounts.sender_token_account.key());
    msg!("Recipient Token Account (destination, may be initialized): {}", ctx.accounts.recipient_token_account.key());
    msg!("Token Program: {}", ctx.accounts.token_program.key());
    msg!("Associated Token Program: {}", ctx.accounts.associated_token_program.key());
    msg!("System Program: {}", ctx.accounts.system_program.key());
    msg!("Amount to transfer (input): {}", amount);
    let mint = &ctx.accounts.mint_account.to_account_info();
    msg!("Processing mint: {}", mint.key());
    let mint_data = mint.data.borrow();
    msg!("Attempting to unpack mint data with extensions...");
    let mint_with_extension = StateWithExtensions::<MintState>::unpack(&mint_data)?;
    msg!("Mint data unpacked.");
    msg!("Attempting to get TransferFeeConfig extension...");
    let extension_data = mint_with_extension.get_extension::<TransferFeeConfig>()?;
    msg!("TransferFeeConfig extension retrieved.");
    let epoch = Clock::get()?.epoch;
    msg!("Current epoch for fee calculation: {}", epoch);
    let fee = extension_data.calculate_epoch_fee(epoch, amount).unwrap();
    msg!("Calculated fee: {}", fee);
    let decimals = ctx.accounts.mint_account.decimals;
    msg!("Mint decimals: {}", decimals);

    msg!("Preparing for CPI: transfer_checked_with_fee");
    msg!("  CPI Source: {}", ctx.accounts.sender_token_account.key());
    msg!("  CPI Mint: {}", ctx.accounts.mint_account.key());
    msg!("  CPI Destination: {}", ctx.accounts.recipient_token_account.key());
    msg!("  CPI Authority: {}", ctx.accounts.sender.key());
    msg!("  CPI Amount (gross): {}", amount);
    msg!("  CPI Decimals: {}", decimals);
    msg!("  CPI Fee: {}", fee);
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
    msg!("CPI transfer_checked_with_fee successful.");
    msg!("transfer amount {}", amount);
    msg!("fee amount {}", fee);
    msg!("--- Transfer finished ---");
    Ok(())
}
