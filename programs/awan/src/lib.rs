use anchor_lang::prelude::*;

mod constants;
mod error;
mod instructions;
mod state;
 
use error::*;
use instructions::*;
pub use constants::*;

declare_id!("8vZNXTex9JmPAADsTXVwwfTfVXUjbLBaTtassLD8dqvN");

#[program]
pub mod awan {
    use super::*;
 
    pub fn create_duel(ctx: Context<CreateDuel>, min_price: u64, max_price: u64) -> Result<()> {
        ctx.accounts.create_duel(min_price, max_price, &ctx.bumps)?;
        Ok(())
    }
 
    pub fn join_duel(ctx: Context<JoinDuel>, opening_bid: u64) -> Result<()> {
        ctx.accounts.join_duel(opening_bid)?;
        Ok(())
    }

    pub fn raise(ctx: Context<Raise>, new_bid: u64) -> Result<()> {
        ctx.accounts.raise(new_bid)?;
        Ok(())
    }

    pub fn concede(ctx: Context<Concede>) -> Result<()> {
        ctx.accounts.concede(&ctx.bumps)?;
        Ok(())
    }
}
