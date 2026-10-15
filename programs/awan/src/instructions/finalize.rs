use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer as TokenTransfer},
};

use crate::{state::*, AwanError};

#[derive(Accounts)]
pub struct Finalize<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [b"duel", duel.nft_mint.as_ref(), duel.seller.as_ref()],
        bump = duel.bump,
    )]
    pub duel: Account<'info, Duel>,

    /// CHECK: PDA owns the SOL escrow and is the NFT token authority.
    #[account(mut, seeds = [b"vault", duel.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    /// CHECK: constrained to the seller recorded in the duel.
    #[account(mut, address = duel.seller)]
    pub seller: SystemAccount<'info>,

    /// CHECK: constrained below to the winning bidder.
    #[account(mut)]
    pub winner: SystemAccount<'info>,

    /// CHECK: constrained below to the losing bidder.
    #[account(mut)]
    pub loser: SystemAccount<'info>,

    pub nft_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = vault,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = nft_mint,
        associated_token::authority = winner,
    )]
    pub winner_nft_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Finalize<'info> {
    pub fn finalize(&mut self, bumps: &FinalizeBumps) -> Result<()> {
        require!(self.duel.status == DuelStatus::Open, AwanError::DuelSettled);
        require!(Clock::get()?.unix_timestamp >= self.duel.ends_at, AwanError::AuctionStillOpen);
        require!(self.nft_mint.key() == self.duel.nft_mint, AwanError::DuelSettled);

        // Bidder B wins an exact tie because they joined second and submitted the later opening bid.
        let (winner_key, loser_key, winning_bid) = if self.duel.bid_a > self.duel.bid_b {
            (self.duel.bidder_a, self.duel.bidder_b, self.duel.bid_a)
        } else {
            (self.duel.bidder_b, self.duel.bidder_a, self.duel.bid_b)
        };
        require!(self.winner.key() == winner_key, AwanError::NotYourTurn);
        require!(self.loser.key() == loser_key, AwanError::NotYourTurn);

        let duel_key = self.duel.key();
        let bump = bumps.vault;
        let signer_seeds: &[&[u8]] = &[b"vault", duel_key.as_ref(), &[bump]];
        let signer = &[signer_seeds];

        system_program::transfer(
            CpiContext::new_with_signer(System::id(), system_program::Transfer {
                from: self.vault.to_account_info(), to: self.seller.to_account_info(),
            }, signer),
            winning_bid,
        )?;
        let winner_refund = self.duel.max_price - winning_bid;
        if winner_refund > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(System::id(), system_program::Transfer {
                    from: self.vault.to_account_info(), to: self.winner.to_account_info(),
                }, signer), winner_refund,
            )?;
        }
        system_program::transfer(
            CpiContext::new_with_signer(System::id(), system_program::Transfer {
                from: self.vault.to_account_info(), to: self.loser.to_account_info(),
            }, signer), self.duel.max_price,
        )?;

        token::transfer(
            CpiContext::new_with_signer(Token::id(), TokenTransfer {
                from: self.vault_nft_account.to_account_info(),
                to: self.winner_nft_account.to_account_info(),
                authority: self.vault.to_account_info(),
            }, signer), 1,
        )?;
        token::close_account(CpiContext::new_with_signer(Token::id(), CloseAccount {
            account: self.vault_nft_account.to_account_info(),
            destination: self.seller.to_account_info(),
            authority: self.vault.to_account_info(),
        }, signer))?;
        Ok(())
    }
}
