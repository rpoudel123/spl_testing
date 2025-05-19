use crate::{
    ErrorCode, GameState, PlayerCashinoRewards, PlayerData, RoundState, RoundStatus,
    CASHINO_REWARD_PER_ROUND_UNITS,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(round_id_for_pdas: u64)]
pub struct CalculateRewardEntitlements<'info> {
    #[account(seeds = [b"game_state"], bump)]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_state.load()?.status_discriminant == RoundStatus::TokensMintedForRewards as u8 @ ErrorCode::RoundNotInCorrectState,
    )]
    pub round_state: AccountLoader<'info, RoundState>,
}

pub fn process_calculate_reward_entitlements(
    ctx: Context<CalculateRewardEntitlements>,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: CalculateRewardEntitlements ---");
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);

    let mut round_state = &mut ctx.accounts.round_state.load_mut()?;
    let total_cashino_minted_for_round = round_state.total_cashino_minted_for_round;

    msg!(
        "Calculating and storing $CASHINO reward entitlements for {} players. Total minted: {}",
        round_state.player_count,
        total_cashino_minted_for_round
    );

    if round_state.total_sol_pot > 0 && round_state.player_count > 0 {
        for i in 0..(round_state.player_count as usize) {
            let player_bet_data = round_state.players[i];

            if player_bet_data.amount == 0 {
                round_state.player_cashino_rewards[i] = PlayerCashinoRewards {
                    player: player_bet_data.pubkey,
                    sol_bet_amount: 0,
                    cashino_reward_amount: 0,
                    claimed_val: 0,
                    _padding_pcr: [0u8; 7],
                };
                msg!(
                    "  Player {}: Pubkey {}, SOL Bet 0, Entitlement: 0 (bet was zero)",
                    i, player_bet_data.pubkey
                );
                continue;
            }
            let calculated_reward = (player_bet_data.amount as u128)
                .checked_mul(total_cashino_minted_for_round as u128)
                .ok_or(ErrorCode::GameCalculationError)?
                .checked_div(round_state.total_sol_pot as u128)
                .ok_or(ErrorCode::GameCalculationError)? as u64;

            round_state.player_cashino_rewards[i] = PlayerCashinoRewards {
                player: player_bet_data.pubkey,
                sol_bet_amount: player_bet_data.amount,
                cashino_reward_amount: calculated_reward,
                claimed_val: 0,
                _padding_pcr: [0u8; 7],
            };
            msg!(
                "  Player {}: Pubkey {}, SOL Bet {}, Entitlement: {}",
                i,
                player_bet_data.pubkey,
                player_bet_data.amount,
                calculated_reward
            );
        }
        msg!("$CASHINO reward entitlements stored in RoundState.");
    } else {
        msg!("Total SOL pot is 0 or no players, skipping $CASHINO reward entitlement calculation.");
        for i in 0..(round_state.player_count as usize) {
            round_state.player_cashino_rewards[i] = PlayerCashinoRewards {
                player: round_state.players[i].pubkey,
                sol_bet_amount: round_state.players[i].amount,
                cashino_reward_amount: 0,
                claimed_val: 0,
                _padding_pcr: [0u8; 7],
            };
        }
    }

    round_state.status_discriminant = RoundStatus::RewardsProcessed as u8;
    msg!(
        "Round {} (ID: {}) status updated to RewardsProcessed (Discriminant: {}). Round is now fully finalized.",
        round_id_for_pdas,
        round_state.id,
        round_state.status_discriminant
    );

    msg!("--- CalculateRewardEntitlements finished ---");
    Ok(())
}
