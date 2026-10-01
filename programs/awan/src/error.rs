use anchor_lang::prelude::*;

#[error_code]
pub enum AwanError {
    #[msg("It is not your turn.")]
    NotYourTurn,

    #[msg("Raise amount must be higher than the current bid.")]
    RaiseTooLow,

    #[msg("Bid cannot exceed the maximum price.")]
    BidAboveMax,

    #[msg("Opening bid must be at least the minimum price.")]
    BidBelowMin,

    #[msg("Both bidders must join before the duel can start.")]
    DuelNotFull,

    #[msg("This duel has already been settled.")]
    DuelSettled,
}
