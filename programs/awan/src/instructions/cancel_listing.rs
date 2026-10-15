use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer as TokenTransfer},
};
use crate::{state::*, AwanError};

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(
        mut,
        close = seller,
        seeds = [b"duel", duel.nft_mint.as_ref(), duel.seller.as_ref()],
        bump = duel.bump,
    )]
    pub duel: Account<'info, Duel>,
    /// CHECK: constrained to the listing seller and receives the returned NFT and rent.
    #[account(mut, address = duel.seller)]
    pub seller: SystemAccount<'info>,
    /// CHECK: PDA owns the escrow.
    #[account(mut, seeds = [b"vault", duel.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    pub nft_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = nft_mint, associated_token::authority = vault)]
    pub vault_nft_account: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = caller, associated_token::mint = nft_mint, associated_token::authority = seller)]
    pub seller_nft_account: Account<'info, TokenAccount>,
    pub bidder_a: Option<SystemAccount<'info>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CancelListing<'info> {
    pub fn cancel_listing(&mut self, bumps: &CancelListingBumps) -> Result<()> {
        require!(self.duel.status == DuelStatus::AwaitingBidders, AwanError::DuelSettled);
        require!(Clock::get()?.unix_timestamp >= self.duel.created_at + self.duel.duration_seconds, AwanError::AuctionStillOpen);
        require!(self.nft_mint.key() == self.duel.nft_mint, AwanError::DuelSettled);

        let duel_key = self.duel.key();
        let signer_seeds: &[&[u8]] = &[b"vault", duel_key.as_ref(), &[bumps.vault]];
        let signer = &[signer_seeds];
        if self.duel.bidder_a != Pubkey::default() {
            let bidder = self.bidder_a.as_ref().ok_or(AwanError::DuelNotFull)?;
            require!(bidder.key() == self.duel.bidder_a, AwanError::AlreadyJoined);
            system_program::transfer(
                CpiContext::new_with_signer(System::id(), system_program::Transfer {
                    from: self.vault.to_account_info(), to: bidder.to_account_info(),
                }, signer),
                self.duel.max_price,
            )?;
        }

        token::transfer(CpiContext::new_with_signer(Token::id(), TokenTransfer {
            from: self.vault_nft_account.to_account_info(), to: self.seller_nft_account.to_account_info(),
            authority: self.vault.to_account_info(),
        }, signer), 1)?;
        token::close_account(CpiContext::new_with_signer(Token::id(), CloseAccount {
            account: self.vault_nft_account.to_account_info(), destination: self.seller.to_account_info(),
            authority: self.vault.to_account_info(),
        }, signer))?;
        Ok(())
    }
}
