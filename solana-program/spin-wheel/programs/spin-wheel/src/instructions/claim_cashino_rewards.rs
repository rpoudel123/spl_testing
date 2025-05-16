use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, Token2022, TransferChecked},
};
use crate::{
    GameState, RoundState, PlayerCashinoRewards, RoundCashinoRewardsPot, ErrorCode,
};

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct ClaimCashinoRewards<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes().as_ref()],
        bump,
        constraint = !round_state.is_active @ ErrorCode::RoundStillActive,
    )]
    pub round_state: Box<Account<'info, RoundState>>,

    #[account(
        seeds = [b"cashino_round_pot".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_cashino_rewards_pot_account.round_id == round_id_for_pdas @ ErrorCode::InvalidRoundIdForSeed
    )]
    pub round_cashino_rewards_pot_account: Account<'info, RoundCashinoRewardsPot>,

    #[account(
        mut,
        associated_token::mint = cashino_token_mint,
        associated_token::authority = round_cashino_rewards_pot_account,
    )]
    pub round_cashino_rewards_pot_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        address = game_state.cashino_mint @ ErrorCode::InvalidMintAccount
    )]
    pub cashino_token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = player,
        associated_token::mint = cashino_token_mint,
        associated_token::authority = player,
    )]
    pub player_cashino_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // Programs
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn process_claim_cashino_rewards(
    ctx: Context<ClaimCashinoRewards>,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: ClaimCashinoRewards ---");
    msg!("Player claiming rewards: {}", ctx.accounts.player.key());
    msg!("For Round ID (used for PDAs): {}", round_id_for_pdas);
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!("RoundCashinoRewardsPot Account PDA: {}", ctx.accounts.round_cashino_rewards_pot_account.key());
    msg!("RoundCashinoRewardsPot ATA (source): {}", ctx.accounts.round_cashino_rewards_pot_ata.key());
    msg!("Player's $CASHINO ATA (destination): {}", ctx.accounts.player_cashino_ata.key());

    let round_state = &mut ctx.accounts.round_state;

    let mut amount_to_claim: u64 = 0;
    let mut player_reward_index: Option<usize> = None;

    for i in 0..(round_state.player_count as usize) {
        if round_state.player_cashino_rewards[i].player == ctx.accounts.player.key() {
            if round_state.player_cashino_rewards[i].claimed {
                msg!("Error: Player {} has already claimed rewards for round {}.", ctx.accounts.player.key(), round_state.id);
                return err!(ErrorCode::RewardAlreadyClaimed);
            }
            amount_to_claim = round_state.player_cashino_rewards[i].cashino_reward_amount;
            player_reward_index = Some(i);
            msg!("Player {} found in rewards list for round {}. Entitled to {} $CASHINO. Not yet claimed.",
                ctx.accounts.player.key(), round_state.id, amount_to_claim);
            break;
        }
    }

    let player_reward_idx = player_reward_index.ok_or_else(|| {
        msg!("Error: Player {} not found in reward entitlements for round {}.", ctx.accounts.player.key(), round_state.id);
        ErrorCode::NotEligibleForReward
    })?;

    if amount_to_claim == 0 {
        msg!("Player {} is entitled to 0 $CASHINO for round {}. No tokens to transfer.",
            ctx.accounts.player.key(), round_state.id);
        // Mark as claimed even if amount is 0 to prevent re-processing
        round_state.player_cashino_rewards[player_reward_idx].claimed = true;
        msg!("Marked 0 amount reward as claimed for player {}.", ctx.accounts.player.key());
        msg!("--- ClaimCashinoRewards finished (0 amount) ---");
        return Ok(());
    }

    msg!("Attempting to transfer {} $CASHINO from rewards pot ATA {} to player ATA {}",
        amount_to_claim,
        ctx.accounts.round_cashino_rewards_pot_ata.key(),
        ctx.accounts.player_cashino_ata.key()
    );

    let round_cashino_pot_bump = ctx.bumps.round_cashino_rewards_pot_account;

    let pot_signer_seeds: &[&[u8]] = &[
        b"cashino_round_pot".as_ref(),
        &round_id_for_pdas.to_le_bytes(),
        &[round_cashino_pot_bump],
    ];
    let all_pot_signer_seeds = &[pot_signer_seeds][..];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.round_cashino_rewards_pot_ata.to_account_info(),
                to: ctx.accounts.player_cashino_ata.to_account_info(),
                authority: ctx.accounts.round_cashino_rewards_pot_account.to_account_info(),
                mint: ctx.accounts.cashino_token_mint.to_account_info(),
            },
            all_pot_signer_seeds,
        ),
        amount_to_claim,
        ctx.accounts.cashino_token_mint.decimals,
    )?;
    msg!("Successfully transferred {} $CASHINO to player {}.", amount_to_claim, ctx.accounts.player.key());

    round_state.player_cashino_rewards[player_reward_idx].claimed = true;
    msg!("Marked $CASHINO reward as claimed for player {}.", ctx.accounts.player.key());
    msg!("--- ClaimCashinoRewards finished ---");
    Ok(())
}