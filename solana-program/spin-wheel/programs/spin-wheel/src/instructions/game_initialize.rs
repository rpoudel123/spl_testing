use crate::{ErrorCode, GameState, MAX_GAME_HOUSE_FEE_BASIS_POINTS};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(house_fee_basis_points: u16, cashino_mint_address: Pubkey)]
pub struct InitializeGameSettings<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<GameState>(),
        seeds = [b"game_state"],
        bump
    )]
    pub game_state: Account<'info, GameState>,
    /// CHECK: This is the account that will receive the house fees $SOL from the games.
    pub house_wallet: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

pub fn process_initialize_game_settings(
    ctx: Context<InitializeGameSettings>,
    house_fee_basis_points: u16,
    cashino_mint_address: Pubkey, // Address of the Cashino Mint
) -> Result<()> {
    msg!("--- Instruction: InitializeGameSettings ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!(
        "New GameState PDA to be initialized at: {}",
        ctx.accounts.game_state.key()
    );
    msg!(
        "House Wallet to be set: {}",
        ctx.accounts.house_wallet.key()
    );
    msg!(
        "Initial House Fee Basis Points to set: {}",
        house_fee_basis_points
    );
    msg!("$CASHINO Mint Address to set: {}", cashino_mint_address);

    require!(
        house_fee_basis_points <= MAX_GAME_HOUSE_FEE_BASIS_POINTS,
        ErrorCode::InvalidHouseFeeConfig
    );

    msg!(
        "House fee basis points {} validated against max {}.",
        house_fee_basis_points,
        MAX_GAME_HOUSE_FEE_BASIS_POINTS
    );

    let game_state = &mut ctx.accounts.game_state;

    game_state.authority = ctx.accounts.authority.key();
    game_state.house_wallet = ctx.accounts.house_wallet.key();
    game_state.house_fee_basis_points = house_fee_basis_points;
    game_state.round_counter = 0; // Start round counter at 0
    game_state.cashino_mint = cashino_mint_address; // Store the $CASHINO mint pubkey
    game_state.is_initialized = true;

    msg!("Game settings initialized successfully in GameState PDA.");
    msg!("  Authority set to: {}", game_state.authority);
    msg!("  House Wallet set to: {}", game_state.house_wallet);
    msg!(
        "  House Fee Basis Points set to: {}",
        game_state.house_fee_basis_points
    );
    msg!("  $CASHINO Mint set to: {}", game_state.cashino_mint);
    msg!(
        "  Round Counter initialized to: {}",
        game_state.round_counter
    );
    msg!(
        "  Is Initialized flag set to: {}",
        game_state.is_initialized
    );
    msg!("--- InitializeGameSettings finished ---");
    Ok(())
}
