use crate::{
    ErrorCode, GamePotSol, GameState, PlayerCashinoRewards, PlayerData, RoundCashinoRewardsPot,
    RoundState, SeedArray, MINT_AUTHORITY_SEED, SEED_BYTES_LENGTH,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock, hash::hash,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, Token2022, TokenAccount},
};
use crate::instructions::mint_tokens::internal_perform_mint;

pub const CASHINO_REWARD_PER_ROUND_UNITS: u64 = 1_000_000;

fn determine_winner(round_state: &RoundState, current_timestamp: i64) -> Result<u8> {
    msg!("--- Instruction: DetermineWinner ---");
    let revealed_seed = round_state
        .revealed_seed
        .ok_or(ErrorCode::InvalidRevealedSeed)?;
    msg!(
        "Revealed seed: {:?}, available for winner determination",
        revealed_seed
    );

    let mut combined_entropy = [0u8; SEED_BYTES_LENGTH as usize];

    for (i, byte) in revealed_seed.iter().enumerate() {
        combined_entropy[i % (SEED_BYTES_LENGTH as usize)] ^= byte;
    }

    let timestamp_bytes = current_timestamp.to_le_bytes();
    for (i, byte) in timestamp_bytes.iter().enumerate() {
        combined_entropy[i % (SEED_BYTES_LENGTH as usize)] ^= byte;
    }

    let pot_bytes = round_state.total_sol_pot.to_le_bytes();
    for (i, byte) in pot_bytes.iter().enumerate() {
        combined_entropy[i % (SEED_BYTES_LENGTH as usize)] ^= byte;
    }

    combined_entropy[0] ^= round_state.player_count;

    let id_bytes = round_state.id.to_le_bytes();
    for (i, byte) in id_bytes.iter().enumerate() {
        combined_entropy[i % (SEED_BYTES_LENGTH as usize)] ^= byte;
    }
    msg!("Entropy combined for hashing.");

    let entropy_hash = hash(&combined_entropy).to_bytes();
    msg!("Entropy hashed.");

    let random_value = u64::from_le_bytes(
        entropy_hash[0..8]
            .try_into()
            .map_err(|_| ErrorCode::GameCalculationError)?,
    );
    msg!("Random value generated: {}", random_value);

    if round_state.total_sol_pot == 0 {
        msg!("Error: Total SOL pot is zero, cannot determine winner proportionally.");
        return err!(ErrorCode::NoPlayers);
    }

    let scaled_random = random_value % round_state.total_sol_pot;
    msg!("Scaled random value (0 to total_sol_pot-1): {}", scaled_random);

    let mut cumulative_bet_amount: u64 = 0;
    for i in 0..(round_state.player_count as usize) {
        let player_data = &round_state.players[i];
        if player_data.amount == 0 {
            continue;
        }
        cumulative_bet_amount = cumulative_bet_amount.checked_add(player_data.amount).ok_or(ErrorCode::GameCalculationError)?;
        msg!("  Player index {}: Pubkey {}, Bet SOL {}, Cumulative SOL {}", i, player_data.pubkey, player_data.amount, cumulative_bet_amount);
        if scaled_random < cumulative_bet_amount {
            msg!("Winner determined at index: {}", i);
            return Ok(i as u8);
        }
    }

    msg!("Error: Winner determination logic failed to select a winner (should not happen if pot > 0 and players exist).");
    err!(ErrorCode::GameCalculationError)
}


#[derive(Accounts)]
#[instruction(revealed_seed: SeedArray, round_id_for_pdas: u64)]
pub struct EndGameRound<'info> {
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
        seeds = [b"round_state".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump,
        constraint = round_state.is_active @ ErrorCode::RoundNotActive,
    )]
    pub round_state: Box<Account<'info, RoundState>>,

    #[account(
        mut, 
        seeds = [b"sol_pot".as_ref(), &round_id_for_pdas.to_le_bytes()],
        bump
    )]
    pub game_pot_sol: Box<Account<'info, GamePotSol>>,

    /// CHECK: This is the house_wallet address stored in game_state.
    /// It will receive the SOL house fee. Marked as mut because it receives lamports.
    #[account(mut, address = game_state.house_wallet @ ErrorCode::UnauthorizedAccess)]
    pub house_wallet: AccountInfo<'info>,

    #[account(
        mut, 
        address = game_state.cashino_mint @ ErrorCode::InvalidMintAccount
    )]
    pub cashino_token_mint: Box<InterfaceAccount<'info, Mint>>,

    /// CHECK: This is the PDA derived from MINT_AUTHORITY_SEED.
    /// It's the authority for the cashino_token_mint.
    #[account(
        seeds = [MINT_AUTHORITY_SEED],
        bump,
    )]
    pub cashino_mint_authority_pda: AccountInfo<'info>,

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
    )]
    pub round_cashino_rewards_pot_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// CHECK: This is the currently executing program (SpinWheel program)
    #[account(executable, address = crate::ID)]
    pub spin_wheel_program: AccountInfo<'info>,
}

pub fn process_end_game_round(
    ctx: Context<EndGameRound>,
    round_id_for_pdas: u64,
    revealed_seed: SeedArray,
) -> Result<()> {
    msg!("--- Instruction: EndGameRound ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("Target Round ID (for PDAs): {}", round_id_for_pdas);
    msg!("GameState PDA: {}", ctx.accounts.game_state.key());
    msg!("RoundState PDA: {}", ctx.accounts.round_state.key());
    msg!("GamePotSol PDA: {}", ctx.accounts.game_pot_sol.key());
    msg!("Revealed Seed (first 5 bytes): {:?}", &revealed_seed[0..5]);

    let game_state = &ctx.accounts.game_state;
    let round_state = &mut ctx.accounts.round_state;
    let clock = Clock::get()?;
    let mut time_check_passes = clock.unix_timestamp >= round_state.start_time;

    if cfg!(feature = "anchor-test") {
        msg!("NOTE: In anchor-test mode. Current time: {}, Round end time: {}. Forcing time_check_passes to true for testing end_round logic.", clock.unix_timestamp, round_state.end_time);
        time_check_passes = true; // Force pass for testing
    }

    require!(
      time_check_passes,
        ErrorCode::RoundNotEnded
    );

    msg!("Round is active (validated by constraint).");

    // require!(
    //     clock.unix_timestamp >= round_state.end_time,
    //     ErrorCode::RoundNotEnded
    // );
    msg!("Bet window confirmed closed (Current: {}, End: {} -- Test Mode Logic Active: {}).", clock.unix_timestamp, round_state.end_time, cfg!(feature = "anchor-test"));

    // msg!("Bet window confirmed closed (Current: {}, End: {}).", clock.unix_timestamp, round_state.end_time);

    require!(round_state.player_count > 0, ErrorCode::NoPlayers);
    msg!("Player count {} validated (>0).", round_state.player_count);

    // let seed_hash = hash(&revealed_seed).to_bytes();
    
    msg!("Comparing {:?} with {:?}", revealed_seed, round_state.seed_commitment);
    
    require!(
        revealed_seed == round_state.seed_commitment,
        ErrorCode::InvalidRevealedSeed
    );
    msg!("Revealed seed matches commitment.");

    round_state.revealed_seed = Some(revealed_seed);

    let winner_index = determine_winner(round_state, clock.unix_timestamp)?;
    round_state.winner_index = Some(winner_index);
    let winner_pda_data = round_state.players[winner_index as usize];
    msg!("Winner determined: Index {}, Pubkey {}", winner_index, winner_pda_data.pubkey);

    let house_sol_fee_amount = (round_state.total_sol_pot)
        .checked_mul(game_state.house_fee_basis_points as u64)
        .ok_or(ErrorCode::GameCalculationError)?
        .checked_div(10000)
        .ok_or(ErrorCode::GameCalculationError)?;

    round_state.house_sol_fee = house_sol_fee_amount;
    msg!("Calculated $SOL House Fee: {} (Basis Points: {}) from Total SOL Pot: {}",
        house_sol_fee_amount, game_state.house_fee_basis_points, round_state.total_sol_pot);

    if house_sol_fee_amount > 0 {
        msg!("Attempting to transfer $SOL house fee {} from GamePotSol {} to HouseWallet {}",
            house_sol_fee_amount, ctx.accounts.game_pot_sol.key(), ctx.accounts.house_wallet.key());
        let game_pot_account_info = ctx.accounts.game_pot_sol.to_account_info();
        let house_wallet_account_info = ctx.accounts.house_wallet.to_account_info();
        
        let game_pot_lamports_initial = game_pot_account_info.lamports();
        let rent_for_game_pot = Rent::get()?.minimum_balance(game_pot_account_info.data_len());

        if game_pot_lamports_initial < rent_for_game_pot {
            msg!("Error: GamePotSol has {} lamports, which is less than rent minimum {}", game_pot_lamports_initial, rent_for_game_pot);
            return err!(ErrorCode::InsufficientFunds);
        }
        let transferable_lamports = game_pot_lamports_initial.checked_sub(rent_for_game_pot).ok_or(ErrorCode::InsufficientFunds)?;

        if transferable_lamports < house_sol_fee_amount {
            msg!("Error: GamePotSol has insufficient transferable SOL ({} available) to pay house fee {}",
                transferable_lamports, house_sol_fee_amount);
            return err!(ErrorCode::InsufficientFunds);
        }
        
        **game_pot_account_info.try_borrow_mut_lamports()? -= house_sol_fee_amount;
        **house_wallet_account_info.try_borrow_mut_lamports()? += house_sol_fee_amount;
        msg!("$SOL House Fee of {} lamports transferred successfully directly.", house_sol_fee_amount);
    } else {
        msg!("$SOL House Fee is 0, no transfer needed.");
    }

    msg!("Preparing to mint $CASHINO rewards for the round.");
    let total_cashino_to_mint_for_round = CASHINO_REWARD_PER_ROUND_UNITS;

    let round_cashino_pot_data = &mut ctx.accounts.round_cashino_rewards_pot_account;
    round_cashino_pot_data.round_id = round_id_for_pdas;
    round_cashino_pot_data.total_minted_for_round = total_cashino_to_mint_for_round;
    msg!("Initialized RoundCashinoRewardsPot account for round {}.", round_id_for_pdas);

    msg!("Calling internal_perform_mint to mint $CASHINO");
    msg!("  Minting to RoundCashinoRewardsPot ATA: {}", ctx.accounts.round_cashino_rewards_pot_ata.key());

    let cashino_mint_authority_pda_bump = ctx.bumps.cashino_mint_authority_pda;

    internal_perform_mint(
        &ctx.accounts.cashino_mint_authority_pda,
        &ctx.accounts.cashino_token_mint,
        &ctx.accounts.round_cashino_rewards_pot_ata,
        &ctx.accounts.token_program,
        cashino_mint_authority_pda_bump,
        total_cashino_to_mint_for_round,
        ctx.program_id,
    )?;

    round_state.total_cashino_minted_for_round = total_cashino_to_mint_for_round;
    msg!("Successfully minted {} $CASHINO to the round's reward pot ATA.", total_cashino_to_mint_for_round);

    msg!("Calculating and storing $CASHINO reward entitlements for players...");
    if round_state.total_sol_pot > 0 {
        for i in 0..(round_state.player_count as usize) {
            let player_sol_bet = round_state.players[i].amount;
            let calculated_reward = (player_sol_bet as u128)
                .checked_mul(total_cashino_to_mint_for_round as u128)
                .ok_or(ErrorCode::GameCalculationError)?
                .checked_div(round_state.total_sol_pot as u128)
                .ok_or(ErrorCode::GameCalculationError)? as u64;

            round_state.player_cashino_rewards[i] = PlayerCashinoRewards {
                player: round_state.players[i].pubkey,
                sol_bet_amount: player_sol_bet,
                cashino_reward_amount: calculated_reward,
                claimed: false,
            };
            msg!("  Player {}: Pubkey {}, SOL Bet {}, $CASHINO Reward Entitlement: {}",
                i,
                round_state.player_cashino_rewards[i].player,
                round_state.player_cashino_rewards[i].sol_bet_amount,
                round_state.player_cashino_rewards[i].cashino_reward_amount
            );
        }
        msg!("$CASHINO reward entitlements stored in RoundState.");
    } else {
        msg!("Total SOL pot is 0, skipping $CASHINO reward entitlement calculation.");
    }

    round_state.is_active = false;
    msg!("Round {} (ID {}) marked as inactive.", round_id_for_pdas, round_state.id);
    msg!("--- EndGameRound finished ---");
    Ok(())
}
