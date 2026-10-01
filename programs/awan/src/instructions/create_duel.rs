use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

use crate::{state::*, AwanError, ANCHOR_DISCRIMINATOR};

#[derive(Accounts)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    pub nft_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = seller,
        space = ANCHOR_DISCRIMINATOR + Duel::INIT_SPACE,
        seeds = [b"duel", nft_mint.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub duel: Account<'info, Duel>,

    /// CHECK: no data is read from it, it only holds lamports and signs as token authority.
    #[account(seeds = [b"vault", duel.key().as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = nft_mint,
        associated_token::authority = seller,
    )]
    pub seller_nft_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = seller,
        associated_token::mint = nft_mint,
        associated_token::authority = vault,
    )]
    pub vault_nft_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateDuel<'info> {
    pub fn create_duel(
        &mut self,
        min_price: u64,
        max_price: u64,
        bumps: &CreateDuelBumps,
    ) -> Result<()> {
        require!(max_price > min_price, AwanError::BidBelowMin);

        self.duel.set_inner(Duel {
            seller: self.seller.key(),
            nft_mint: self.nft_mint.key(),
            min_price,
            max_price,
            bidder_a: Pubkey::default(),
            bidder_b: Pubkey::default(),
            bid_a: 0,
            bid_b: 0,
            turn: Pubkey::default(),
            status: DuelStatus::AwaitingBidders,
            bump: bumps.duel,
        });

        // Move the NFT (supply 1, 0 decimals) from the seller into the vault's token account.
        let cpi_accounts = Transfer {
            from: self.seller_nft_account.to_account_info(),
            to: self.vault_nft_account.to_account_info(),
            authority: self.seller.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(Token::id(), cpi_accounts);
        transfer(cpi_ctx, 1)?;

        Ok(())
    }
}