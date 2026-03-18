pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Hy5HRkce2L2WoiB5tjTTSDGEmWxE599i5nUJy6vN1NYV");

#[program]
pub mod dummy {
    use super::*;

    pub fn swap<'info>(ctx: Context<'_, '_, '_, 'info, Swap<'info>>, args: SwapArgs) -> Result<()> {
        swap::handler(ctx, args)
    }
}
