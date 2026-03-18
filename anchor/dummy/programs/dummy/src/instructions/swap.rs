use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token_interface::{Mint, TokenAccount, TokenInterface}};

use crate::{JUPITER_PROGRAM_ID, Jupiter};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SwapArgs {
    pub swap_data: Vec<u8>,
    pub amount: u64,
    pub slippage_bps: u16,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK:
    pub authority: UncheckedAccount<'info>,
    pub input_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = input_mint,
        associated_token::authority = authority
    )]
    pub input_vault: InterfaceAccount<'info, TokenAccount>,
    pub output_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = output_mint,
        associated_token::authority = authority,
    )]
    pub output_vault: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK:
    pub event_authority: UncheckedAccount<'info>,
    /// CHECK:
    pub swap_program: UncheckedAccount<'info>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, Swap<'info>>, args: SwapArgs) -> Result<()> {
    let SwapArgs { amount, slippage_bps, swap_data } = args;
    let remaining_accounts = ctx.remaining_accounts;

    match ctx.accounts.swap_program.key() {
        JUPITER_PROGRAM_ID => {
            Jupiter::check_amount_and_slippage(&swap_data, amount, slippage_bps)?;

            let jupiter = Jupiter {
                token_program: ctx.accounts.token_program.to_account_info(),
                token_account_authority: ctx.accounts.authority.to_account_info(),
                source_token_account: ctx.accounts.input_vault.to_account_info(),
                destination_token_account: ctx.accounts.output_vault.to_account_info(),
                source_mint: ctx.accounts.input_mint.to_account_info(),
                destination_mint: ctx.accounts.output_mint.to_account_info(),
                event_authority: ctx.accounts.event_authority.to_account_info(),
                jupiter_program: ctx.accounts.swap_program.to_account_info(),
            };
        
            jupiter.swap(&swap_data, &remaining_accounts, &[])?;
        }
        _ => {
            return Err(ProgramError::IncorrectProgramId.into());
        }
    }
    
    Ok(())
}