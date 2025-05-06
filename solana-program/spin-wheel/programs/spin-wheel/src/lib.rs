use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock, hash::hash, program::invoke_signed, system_instruction,
};
use std::convert::TryInto;
mod instructions;
use instructions::*;

declare_id!("21HrGEnTMroXcp54bTCQKmgYS3uvbczsMRV6cBWGAnDV");

#[program]
pub mod spin_wheel {
    use super::*;

    pub fn initialize_token_2022(
        ctx: Context<InitializeToken2022>,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        process_initialize(ctx, transfer_fee_basis_points, maximum_fee)
    }

    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> Result<()> {
        process_transfer(ctx, amount)
    }

    pub fn harvest<'info>(ctx: Context<'_, '_, 'info, 'info, Harvest<'info>>) -> Result<()> {
        process_harvest(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        process_withdraw(ctx)
    }

    pub fn update_fee(
        ctx: Context<UpdateFee>,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        process_update_fee(ctx, transfer_fee_basis_points, maximum_fee)
    }
}
