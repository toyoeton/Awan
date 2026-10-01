use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer as TokenTransfer},
};

use crate::{state::*, AwanError};

#[derive(Accounts)]
pub struct Concede<'info> {
    #[account(mut)]
    pub conceder: Signer<'info>,

    #[account(
        mut,
        close = seller,
        seeds = [b"duel", duel.nft_mint.as_ref(), duel.seller.as_ref()],
        bump = duel.bump,
    )]
    pub duel: Account<'info, Duel>,

    /// CHECK: lamport vault PDA and NFT escrow authority, no data read from it.
    #[account(mut, seeds = [b"vault", duel.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, address = duel.seller)]
    pub seller: SystemAccount<'info>,

    #[account(mut)]
    pub winner: SystemAccount<'info>,

    pub nft_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = vault,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = conceder,
        associated_token::mint = nft_mint,
        associated_token::authority = winner,
    )]
    pub winner_nft_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> Concede<'info> {
    pub fn concede(&mut self, bumps: &ConcedeBumps) -> Result<()> {
        require!(self.duel.status == DuelStatus::Open, AwanError::DuelSettled);

        let conceder_key = self.conceder.key();
        let (winner_bid, expected_winner) = if conceder_key == self.duel.bidder_a {
            (self.duel.bid_b, self.duel.bidder_b)
        } else if conceder_key == self.duel.bidder_b {
            (self.duel.bid_a, self.duel.bidder_a)
        } else {
            return err!(AwanError::NotYourTurn);
        };
        require!(self.winner.key() == expected_winner, AwanError::NotYourTurn);

        let max_price = self.duel.max_price;
        let overflow = max_price - winner_bid;

        let duel_key = self.duel.key();
        let vault_bump = bumps.vault;
        let signer_seeds: &[&[u8]] = &[b"vault", duel_key.as_ref(), &[vault_bump]];
        let signer = &[signer_seeds];

        // Pay the seller the winner's final bid, not the full locked amount.
        system_program::transfer(
            CpiContext::new_with_signer(
                System::id(),
                system_program::Transfer {
                    from: self.vault.to_account_info(),
                    to: self.seller.to_account_info(),
                },
                signer,
            ),
            winner_bid,
        )?;

        // Refund the winner the gap between what they locked and what they actually bid.
        if overflow > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    System::id(),
                    system_program::Transfer {
                        from: self.vault.to_account_info(),
                        to: self.winner.to_account_info(),
                    },
                    signer,
                ),
                overflow,
            )?;
        }

        // Refund the conceding bidder their full locked amount, they owe nothing.
        system_program::transfer(
            CpiContext::new_with_signer(
                System::id(),
                system_program::Transfer {
                    from: self.vault.to_account_info(),
                    to: self.conceder.to_account_info(),
                },
                signer,
            ),
            max_price,
        )?;

        // Transfer the NFT from the vault to the winner.
        token::transfer(
            CpiContext::new_with_signer(
                Token::id(),
                TokenTransfer {
                    from: self.vault_nft_account.to_account_info(),
                    to: self.winner_nft_account.to_account_info(),
                    authority: self.vault.to_account_info(),
                },
                signer,
            ),
            1,
        )?;

        // Close the now-empty NFT vault account, rent goes back to the seller.
        token::close_account(CpiContext::new_with_signer(
            Token::id(),
            CloseAccount {
                account: self.vault_nft_account.to_account_info(),
                destination: self.seller.to_account_info(),
                authority: self.vault.to_account_info(),
            },
            signer,
        ))?;

        Ok(())
    }
}