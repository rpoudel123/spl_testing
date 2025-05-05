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

    pub fn initialize_fee_mint(
        ctx: Context<InitializeFeeMint>,
        decimals: u8,
        transfer_fee_basis_points: u16,
        maximum_fee: u64,
    ) -> Result<()> {
        process_initialize_fee_mint(ctx, decimals, transfer_fee_basis_points, maximum_fee)
    }

    pub fn add_metadata(ctx: Context<AddMetadata>, metadata_args: TokenMetadataArgs) -> Result<()> {
        process_add_metadata(ctx, metadata_args)
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

    pub fn update_field(ctx: Context<UpdateField>, args: UpdateFieldArgs) -> Result<()> {
        process_update_field(ctx, args)
    }

    pub fn remove_key(ctx: Context<RemoveKey>, key: String) -> Result<()> {
        process_remove_key(ctx, key)
    }

    pub fn emit(ctx: Context<Emit>) -> Result<()> {
        process_emit(ctx)
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>) -> Result<()> {
        process_update_authority(ctx)
    }
}
