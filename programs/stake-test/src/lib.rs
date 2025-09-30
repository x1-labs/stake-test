#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::Accounts;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, TokenAccount, Transfer},
};

declare_id!("F1JH85HfWhojoEyTPq5jJHqjoEt1hPaSR9QthvCvLs9r"); // replace with your real program id

#[program]
pub mod stake_test {
    use super::*;

    /// Move `amount` from user's ATA to the program's vault ATA.
    /// Initializes the per-user Staker PDA on first use. Emits StakeEvent.
    pub fn do_stake(ctx: Context<UserStake>, amount: u64) -> Result<()> {
        // transfer user -> vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        msg!("Transferred {} tokens from user to vault", amount);

        // initialize staker on first use and bump total
        let staker = &mut ctx.accounts.staker;
        if staker.owner == Pubkey::default() {
            staker.owner = ctx.accounts.user.key();
            staker.mint = ctx.accounts.mint.key();
            staker.total = 0;
        }
        msg!("Staker account {}", staker.total);

        require_keys_eq!(staker.owner, ctx.accounts.user.key(), StakeError::OwnerMismatch);
        require_keys_eq!(staker.mint, ctx.accounts.mint.key(), StakeError::MintMismatch);
        staker.total = staker.total.checked_add(amount).ok_or(StakeError::MathOverflow)?;

        msg!("Staker account {}", staker.total);

        emit!(StakeEvent {
            staker: staker.owner,
            mint: staker.mint,
            amount,
            new_total: staker.total
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct UserStake<'info> {
    // signer (writable lamports for paying fees)
    #[account(mut)]
    pub user: Signer<'info>,

    // You only need the key, not the Mint data → make it lightweight
    /// CHECK: we only use the key (validated via ATA mints below)
    pub mint: UncheckedAccount<'info>,

    /// CHECK: PDA authority for the vault ATA
    #[account(
        seeds = [b"vault", mint.key().as_ref()],
        bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    // These will be (re)created and written by the CPI
    #[account(
        mut,
        // payer = user,
        associated_token::mint = mint,
        associated_token::authority = user
    )]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        // payer = user,
        associated_token::mint = mint,
        associated_token::authority = vault_authority
    )]
    pub vault_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 8, // discriminator + owner + mint + total
        seeds = [b"staker", user.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub staker: Box<Account<'info, Staker>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Staker {
    pub owner: Pubkey, // 32
    pub mint: Pubkey,  // 32
    pub total: u64,    // 8
}

#[event]
pub struct StakeEvent {
    pub staker: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub new_total: u64,
}

#[error_code]
pub enum StakeError {
    #[msg("Owner does not match staker record")]
    OwnerMismatch,
    #[msg("Mint does not match staker record")]
    MintMismatch,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}