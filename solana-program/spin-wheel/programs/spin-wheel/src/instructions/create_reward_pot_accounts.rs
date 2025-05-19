use crate::{
    ErrorCode, GameState, RoundState, RoundStatus, RoundCashinoRewardsPot, 
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, Token2022, TokenAccount, spl_token_2022},
};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct CreateRewardPotAccounts<'info> {
    #[account(mut)] 
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key() @ ErrorCode::UnauthorizedAccess,
    )]
    pub game_state: Box<Account<'info, GameState>>, 

    #[account(
        mut, 
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_state.load()?.status_discriminant == RoundStatus::WinnerDeterminedFeePaid as u8 @ ErrorCode::RoundNotInCorrectState,
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    #[account(
        address = game_state.cashino_mint @ ErrorCode::InvalidMintAccount
    )]
    pub cashino_token_mint: Box<InterfaceAccount<'info, Mint>>, 

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<RoundCashinoRewardsPot>(),
        seeds = [b"cashino_round_pot".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub round_cashino_rewards_pot_account: Box<Account<'info, RoundCashinoRewardsPot>>, 

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = cashino_token_mint,
        associated_token::authority = round_cashino_rewards_pot_account,
        associated_token::token_program = token_program
    )]
    pub round_cashino_rewards_pot_ata: Box<InterfaceAccount<'info, TokenAccount>>, 

    pub system_program: Program<'info, System>,

    #[account(address = spl_token_2022::ID @ ErrorCode::InvalidTokenProgram)]
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[inline(never)]
pub fn process_create_reward_pot_accounts(
    ctx: Context<CreateRewardPotAccounts>,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: CreateRewardPotAccounts ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);

    let round_cashino_pot_data = &mut ctx.accounts.round_cashino_rewards_pot_account;
    round_cashino_pot_data.round_id = round_id_for_pdas;
    round_cashino_pot_data.total_minted_for_round = 0;

    msg!("Initialized RoundCashinoRewardsPot account (PDA: {}) and its ATA (PDA: {}) for round {}.",
         ctx.accounts.round_cashino_rewards_pot_account.key(),
         ctx.accounts.round_cashino_rewards_pot_ata.key(),
         round_id_for_pdas);

    let mut round_state = &mut ctx.accounts.round_state.load_mut()?;
    round_state.status_discriminant = RoundStatus::RewardPotAccountsCreated as u8;
    msg!("Round {} status updated to RewardPotAccountsCreated.", round_state.id);

    msg!("--- CreateRewardPotAccounts finished ---");
    Ok(())
}