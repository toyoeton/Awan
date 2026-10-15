use anchor_lang::prelude::*;

/// The single account that tracks one duel from listing to settled.
#[account]
#[derive(InitSpace)]
pub struct Duel {
    pub seller: Pubkey,
    pub nft_mint: Pubkey,
    pub min_price: u64,     // reserve, the opening bid must be at least this
    pub max_price: u64,     // buyout ceiling, also the amount each bidder must escrow
    pub bidder_a: Pubkey,
    pub bidder_b: Pubkey,
    pub bid_a: u64,          // bidder_a's current bid (just a number until settlement)
    pub bid_b: u64,
    pub turn: Pubkey,
    pub duration_seconds: i64,
    pub created_at: i64,
    pub ends_at: i64,
    pub status: DuelStatus,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum DuelStatus {
    AwaitingBidders, // seller has listed, waiting for both bidders to join and lock max_price
    Open,            // both bidders joined and timed bidding is active
    Settled,
}
