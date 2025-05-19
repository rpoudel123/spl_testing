use crate::instructions::mint_tokens::internal_perform_mint;
use crate::{
    ErrorCode, GameState, RoundCashinoRewardsPot, RoundState, RoundStatus,
    CASHINO_REWARD_PER_ROUND_UNITS, MINT_AUTHORITY_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{spl_token_2022, Mint, Token2022, TokenAccount};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct MintTokensToRewardPot<'info> {
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
        constraint = round_state.load()?.status_discriminant == RoundStatus::RewardPotAccountsCreated as u8 @ ErrorCode::RoundNotInCorrectState,
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    #[account(
        mut,
        address = game_state.cashino_mint @ ErrorCode::InvalidMintAccount
    )]
    pub cashino_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: Mint authority PDA
    #[account(seeds = [MINT_AUTHORITY_SEED], bump)]
    pub cashino_mint_authority_pda: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"cashino_round_pot".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
    )]
    pub round_cashino_rewards_pot_account: Box<Account<'info, RoundCashinoRewardsPot>>,

    #[account(
        mut,
        associated_token::mint = cashino_token_mint,
        associated_token::authority = round_cashino_rewards_pot_account,
        associated_token::token_program = token_program
    )]
    pub round_cashino_rewards_pot_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(address = spl_token_2022::ID @ ErrorCode::InvalidTokenProgram)]
    pub token_program: Program<'info, Token2022>,
    /// CHECK: SATISFICATION
    #[account(executable, address = crate::ID)]
    pub spin_wheel_program: AccountInfo<'info>,
}

#[inline(never)]
pub fn process_mint_tokens_to_reward_pot(
    ctx: Context<MintTokensToRewardPot>,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: MintTokensToRewardPot ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);

    let total_cashino_to_mint_for_round = CASHINO_REWARD_PER_ROUND_UNITS;

    let round_cashino_pot_data = &mut ctx.accounts.round_cashino_rewards_pot_account;

    round_cashino_pot_data.total_minted_for_round = total_cashino_to_mint_for_round;
    msg!(
        "RoundCashinoRewardsPot account (PDA: {}) total_minted_for_round set to {}.",
        ctx.accounts.round_cashino_rewards_pot_account.key(),
        total_cashino_to_mint_for_round
    );

    msg!(
        "Calling internal_perform_mint to mint $CASHINO to ATA: {}",
        ctx.accounts.round_cashino_rewards_pot_ata.key()
    );
    internal_perform_mint(
        &ctx.accounts.cashino_mint_authority_pda,
        &ctx.accounts.cashino_token_mint,
        &ctx.accounts.round_cashino_rewards_pot_ata,
        &ctx.accounts.token_program,
        ctx.bumps.cashino_mint_authority_pda,
        total_cashino_to_mint_for_round,
        &ctx.accounts.spin_wheel_program.key(),
    )?;
    msg!(
        "Successfully minted {} $CASHINO to the round's reward pot ATA.",
        total_cashino_to_mint_for_round
    );

    let mut round_state = &mut ctx.accounts.round_state.load_mut()?;
    round_state.total_cashino_minted_for_round = total_cashino_to_mint_for_round;
    round_state.status_discriminant = RoundStatus::TokensMintedForRewards as u8;
    msg!("Round {} status updated to TokensMintedForRewards. total_cashino_minted_for_round set in RoundState.",
         round_state.id);

    msg!("--- MintTokensToRewardPot finished ---");
    Ok(())
}
