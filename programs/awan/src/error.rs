use anchor_lang::prelude::*;

#[error_code]
pub enum AwanError {
    #[msg("It is not your turn.")]
    NotYourTurn,

    #[msg("Raise amount must beat the other bidder's current bid.")]
    RaiseTooLow,

    #[msg("Bid cannot exceed the maximum price.")]
    BidAboveMax,

    #[msg("Opening bid must be at least the minimum price.")]
    BidBelowMin,

    #[msg("Both bidders must join before the duel can start.")]
    DuelNotFull,

    #[msg("This duel has already been settled.")]
    DuelSettled,

    #[msg("This bidder has already joined this duel.")]
    AlreadyJoined,

    #[msg("Auction duration must be between one minute and thirty days.")]
    InvalidDuration,

    #[msg("The auction has not ended yet.")]
    AuctionStillOpen,

    #[msg("The auction deadline has passed.")]
    AuctionEnded,
}


 

 
