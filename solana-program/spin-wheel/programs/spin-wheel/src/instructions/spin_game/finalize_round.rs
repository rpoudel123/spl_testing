use crate::{
    ErrorCode, GamePotSol, GameState, RoundState, RoundStatus, SeedArray, SEED_BYTES_LENGTH,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{clock::Clock, hash::hash, pubkey::Pubkey, rent::Rent};

fn determine_winner(round_state: &RoundState, current_timestamp: i64) -> Result<u8> {
    msg!("--- DetermineWinner ---");
    let revealed_seed = round_state
        .get_revealed_seed()
        .ok_or(ErrorCode::InvalidRevealedSeed)?;
    msg!("DetermineWinner: Revealed seed: {:?}", revealed_seed);

    let mut combined_entropy = [0u8; SEED_BYTES_LENGTH as usize];
    for (i, byte) in revealed_seed.iter().enumerate() {
        combined_entropy[i % SEED_BYTES_LENGTH] ^= byte;
    }

    let timestamp_bytes = current_timestamp.to_le_bytes();
    for (i, byte) in timestamp_bytes.iter().enumerate() {
        combined_entropy[i % SEED_BYTES_LENGTH] ^= byte;
    }

    let pot_bytes = round_state.total_sol_pot.to_le_bytes();
    for (i, byte) in pot_bytes.iter().enumerate() {
        combined_entropy[i % SEED_BYTES_LENGTH] ^= byte;
    }

    combined_entropy[0] ^= round_state.player_count;

    let id_bytes = round_state.id.to_le_bytes();
    for (i, byte) in id_bytes.iter().enumerate() {
        combined_entropy[i % SEED_BYTES_LENGTH] ^= byte;
    }
    msg!("DetermineWinner: Entropy combined for hashing.");

    let entropy_hash = hash(&combined_entropy).to_bytes();
    msg!("DetermineWinner: Entropy hashed.");

    let random_value = u64::from_le_bytes(
        entropy_hash[0..8]
            .try_into()
            .map_err(|_| ErrorCode::GameCalculationError)?,
    );
    msg!("DetermineWinner: Random value generated: {}", random_value);

    if round_state.total_sol_pot == 0 {
        msg!("DetermineWinner Error: Total SOL pot is zero.");
        return err!(ErrorCode::NoPlayers);
    }

    let scaled_random = random_value % round_state.total_sol_pot;
    msg!(
        "DetermineWinner: Scaled random value (0 to total_sol_pot-1): {}",
        scaled_random
    );

    let mut cumulative_bet_amount: u64 = 0;
    for i in 0..(round_state.player_count as usize) {
        let player_data = &round_state.players[i];
        if player_data.amount == 0 {
            continue;
        }
        cumulative_bet_amount = cumulative_bet_amount
            .checked_add(player_data.amount)
            .ok_or(ErrorCode::GameCalculationError)?;
        msg!(
            "DetermineWinner: Player index {}: Pubkey {}, Bet SOL {}, Cumulative SOL {}",
            i,
            player_data.pubkey,
            player_data.amount,
            cumulative_bet_amount
        );
        if scaled_random < cumulative_bet_amount {
            msg!("DetermineWinner: Winner determined at index: {}", i);
            return Ok(i as u8);
        }
    }

    msg!("DetermineWinner Error: Logic failed to select a winner. This should not happen if total_sol_pot > 0 and players exist.");
    err!(ErrorCode::GameCalculationError)
}

#[derive(Accounts)]
#[instruction(revealed_seed_arg: SeedArray, round_id_for_pdas: u64)]
pub struct FinalizeRound<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key() @ ErrorCode::UnauthorizedAccess,
        constraint = game_state.is_initialized @ ErrorCode::UnauthorizedAccess
    )]
    pub game_state: Box<Account<'info, GameState>>,

    #[account(
        mut,
        seeds = [b"round_state", &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub round_state: AccountLoader<'info, RoundState>,

    #[account(
        mut,
        seeds = [b"sol_pot", &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub game_pot_sol: Account<'info, GamePotSol>,

    /// CHECK: This is the house wallet that receives fees. Its address is validated against game_state.house_wallet.
    #[account(mut, address = game_state.house_wallet @ ErrorCode::InvalidHouseWalletAddress)]
    pub house_wallet: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn process_finalize_round(
    ctx: Context<FinalizeRound>,
    revealed_seed_arg: SeedArray,
    round_id_for_pdas: u64,
) -> Result<()> {
    msg!("--- Instruction: process_finalize_round ---");
    msg!("Round ID for PDAs: {}", round_id_for_pdas);
    msg!("Revealed seed (arg): {:?}", revealed_seed_arg);

    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    msg!("Current on-chain time: {}", current_timestamp);

    // Scope for initial round_state read-only load for checks
    {
        let round_ro = ctx.accounts.round_state.load()?;
        msg!("Stored seed_commitment: {:?}", round_ro.seed_commitment);
        msg!("Round Start Time: {}", round_ro.start_time);
        msg!("Round End Time: {}", round_ro.end_time);
        msg!(
            "Round Current Status Discriminant: {}",
            round_ro.status_discriminant
        );

        require!(
            round_ro.status_discriminant == RoundStatus::Active as u8,
            ErrorCode::RoundNotActive
        );
        require!(
            current_timestamp >= round_ro.end_time,
            ErrorCode::RoundNotEnded
        );
        require!(round_ro.player_count > 0, ErrorCode::NoPlayers);
        require!(
            revealed_seed_arg == round_ro.seed_commitment,
            ErrorCode::InvalidRevealedSeed
        );
        // Ensure this round hasn't already been finalized past this stage
        require!(
            round_ro.winner_sol_pubkey == Pubkey::default(),
            ErrorCode::RoundAlreadyActive
        );
    }

    // Load round_state mutably
    let mut round_rw = ctx.accounts.round_state.load_mut()?;

    round_rw.set_revealed_seed(Some(revealed_seed_arg));
    msg!("Revealed seed set in RoundState.");

    let winner_index = determine_winner(&round_rw, current_timestamp)?;
    msg!("Winner index determined: {}", winner_index);

    let winner_pubkey = round_rw.players[winner_index as usize].pubkey;
    let total_pot_value = round_rw.total_sol_pot;

    let house_fee = total_pot_value
        .checked_mul(ctx.accounts.game_state.house_fee_basis_points as u64)
        .and_then(|v| v.checked_div(10_000))
        .ok_or(ErrorCode::GameCalculationError)?;
    msg!("House fee calculated: {}", house_fee);

    let net_winnings_for_winner = total_pot_value
        .checked_sub(house_fee)
        .ok_or(ErrorCode::GameCalculationError)?;
    msg!(
        "Net winnings for winner calculated: {}",
        net_winnings_for_winner
    );

    round_rw.set_winner_index(Some(winner_index));
    round_rw.house_sol_fee = house_fee;
    round_rw.winner_sol_pubkey = winner_pubkey;
    round_rw.winner_sol_amount = net_winnings_for_winner;
    round_rw.winner_sol_claimed = 0;

    round_rw.set_status(RoundStatus::AwaitingSolClaim);
    msg!(
        "RoundState updated: Winner Pk: {}, Winner Sol Amount: {}, SOL Claimed: {}, Status: AwaitingSolClaim",
        round_rw.winner_sol_pubkey, round_rw.winner_sol_amount, round_rw.winner_sol_claimed
    );

    // Transfer house fee to house_wallet
    if house_fee > 0 {
        let game_pot_account_info = ctx.accounts.game_pot_sol.to_account_info();
        let house_wallet_account_info = ctx.accounts.house_wallet.to_account_info();

        let rent_for_pot = Rent::get()?.minimum_balance(game_pot_account_info.data_len());
        require!(
            game_pot_account_info
                .lamports()
                .checked_sub(house_fee)
                .unwrap_or(0)
                >= rent_for_pot,
            ErrorCode::InsufficientFunds
        );

        **game_pot_account_info.try_borrow_mut_lamports()? -= house_fee;
        **house_wallet_account_info.try_borrow_mut_lamports()? += house_fee;
        msg!(
            "Transferred {} SOL fee from GamePotSol to HouseWallet.",
            house_fee
        );
    } else {
        msg!("No house fee to transfer (fee is zero).");
    }

    msg!("--- process_finalize_round finished ---");
    Ok(())
}
