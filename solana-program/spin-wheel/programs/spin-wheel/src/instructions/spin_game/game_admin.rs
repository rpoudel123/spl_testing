use anchor_lang::prelude::*;
use crate::{
    GameState,
    ErrorCode,
    MAX_GAME_HOUSE_FEE_BASIS_POINTS,
};

#[derive(Accounts)]
#[instruction(new_fee_basis_points: u16)]
pub struct UpdateGameFee<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key() @ ErrorCode::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,
}

pub fn process_update_game_fee(
    ctx: Context<UpdateGameFee>,
    new_fee_basis_points: u16,
) -> Result<()> {
    msg!("--- Instruction: UpdateGameFee ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("GameState PDA: {}", ctx.accounts.game_state.key());
    msg!("Attempting to update house fee basis points to: {}", new_fee_basis_points);

    require!(
        new_fee_basis_points <= MAX_GAME_HOUSE_FEE_BASIS_POINTS,
        ErrorCode::InvalidHouseFeeConfig
    );
    msg!("New fee {} validated against max {}.", new_fee_basis_points, MAX_GAME_HOUSE_FEE_BASIS_POINTS);

    ctx.accounts.game_state.house_fee_basis_points = new_fee_basis_points;

    msg!("House fee basis points updated to: {}", new_fee_basis_points);
    msg!("--- UpdateGameFee finished ---");
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateGameHouseWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump,
        constraint = game_state.authority == authority.key() @ ErrorCode::UnauthorizedAccess
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: The new house wallet address. No data read from it, just storing its key.
    pub new_house_wallet: AccountInfo<'info>,
}

pub fn process_update_game_house_wallet(
    ctx: Context<UpdateGameHouseWallet>,
) -> Result<()> {
    msg!("--- Instruction: UpdateGameHouseWallet ---");
    msg!("Authority: {}", ctx.accounts.authority.key());
    msg!("GameState PDA: {}", ctx.accounts.game_state.key());
    msg!("Attempting to update house wallet to: {}", ctx.accounts.new_house_wallet.key());

    ctx.accounts.game_state.house_wallet = ctx.accounts.new_house_wallet.key();

    msg!("House wallet updated to: {}", ctx.accounts.new_house_wallet.key());
    msg!("--- UpdateGameHouseWallet finished ---");
    Ok(())
}
