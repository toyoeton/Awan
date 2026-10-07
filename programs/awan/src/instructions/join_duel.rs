use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{state::*, AwanError};

#[derive(Accounts)]
pub struct JoinDuel<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(mut)]
    pub duel: Account<'info, Duel>,

    /// CHECK: no data is read from it, it only holds lamports.
    #[account(mut, seeds = [b"vault", duel.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> JoinDuel<'info> {
    pub fn join_duel(&mut self, opening_bid: u64) -> Result<()> {
        require!(
            self.duel.status == DuelStatus::AwaitingBidders,
            AwanError::DuelSettled
        );
        require!(opening_bid >= self.duel.min_price, AwanError::BidBelowMin);
        require!(opening_bid <= self.duel.max_price, AwanError::BidAboveMax);

        // Every bidder locks the full max_price up front, regardless of their opening bid.
        let cpi_ctx = CpiContext::new(
            System::id(),
            Transfer {
                from: self.bidder.to_account_info(),
                to: self.vault.to_account_info(),
            },
        );
        transfer(cpi_ctx, self.duel.max_price)?;

        if self.duel.bidder_a == Pubkey::default() {
            self.duel.bidder_a = self.bidder.key();
            self.duel.bid_a = opening_bid;
        } else {
            require!(self.duel.bidder_b == Pubkey::default(), AwanError::DuelNotFull);
            require!(
                self.bidder.key() != self.duel.bidder_a,
                AwanError::AlreadyJoined
            );
            self.duel.bidder_b = self.bidder.key();
            self.duel.bid_b = opening_bid;
            // Both bidders are in, the duel goes live. bidder_a raises first.
            self.duel.status = DuelStatus::Open;
            self.duel.turn = self.duel.bidder_a;
        }

        Ok(())
    }
}