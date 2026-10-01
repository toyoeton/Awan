use anchor_lang::prelude::*;

use crate::{state::*, AwanError};

#[derive(Accounts)]
pub struct Raise<'info> {
    pub bidder: Signer<'info>,

    #[account(mut)]
    pub duel: Account<'info, Duel>,
}

impl<'info> Raise<'info> {
    pub fn raise(&mut self, new_bid: u64) -> Result<()> {
        require!(self.duel.status == DuelStatus::Open, AwanError::DuelSettled);
        require!(self.bidder.key() == self.duel.turn, AwanError::NotYourTurn);
        require!(new_bid <= self.duel.max_price, AwanError::BidAboveMax);

        if self.bidder.key() == self.duel.bidder_a {
            require!(new_bid > self.duel.bid_a, AwanError::RaiseTooLow);
            self.duel.bid_a = new_bid;
            self.duel.turn = self.duel.bidder_b;
        } else {
            require!(new_bid > self.duel.bid_b, AwanError::RaiseTooLow);
            self.duel.bid_b = new_bid;
            self.duel.turn = self.duel.bidder_a;
        }

        Ok(())
    }
}