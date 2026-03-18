use anchor_lang::prelude::{instruction::Instruction, program::invoke_signed, *};

pub const JUPITER_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
pub const JUPITER_EVENT_AUTHORITY: Pubkey = pubkey!("D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf");

// Instruction Discriminators
pub const EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] = [208, 51, 239, 151, 123, 43, 237, 92];
pub const ROUTE_DISCRIMINATOR: [u8; 8] = [229, 23, 203, 151, 122, 227, 173, 42];
pub const SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] =
    [176, 209, 105, 168, 154, 125, 69, 62];
pub const SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR: [u8; 8] = [193, 32, 155, 51, 65, 214, 156, 129];

pub struct Jupiter<'info> {
    pub token_program: AccountInfo<'info>,
    pub token_account_authority: AccountInfo<'info>,
    pub source_token_account: AccountInfo<'info>,
    pub destination_token_account: AccountInfo<'info>,
    pub source_mint: AccountInfo<'info>,
    pub destination_mint: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub jupiter_program: AccountInfo<'info>,
}

impl<'info> Jupiter<'info> {
    pub fn check_amount_and_slippage(
        swap_data: &[u8],
        amount: u64,
        slippage_bps: u16,
    ) -> Result<()> {
        let swap_data_length = swap_data.len();
        let bps_offset = swap_data_length - size_of::<u16>() - size_of::<u8>();
        let amount_offset = bps_offset - size_of::<u64>() - size_of::<u64>();

        require_eq!(
            amount,
            u64::from_le_bytes(
                swap_data[amount_offset..amount_offset + size_of::<u64>()]
                    .try_into()
                    .unwrap()
            )
        );
        require_eq!(
            slippage_bps,
            u16::from_le_bytes(
                swap_data[bps_offset..bps_offset + size_of::<u16>()]
                    .try_into()
                    .unwrap()
            )
        );

        Ok(())
    }

    pub fn swap(
        &self,
        swap_data: &[u8],
        remaining_accounts: &[AccountInfo<'info>],
        signer_seeds: &[&[u8]],
    ) -> Result<()> {
        let (account_infos, accounts) = match swap_data {
            data if data.starts_with(&EXACT_OUT_ROUTE_DISCRIMINATOR) => {
                let mut account_infos = vec![
                    self.token_program.to_account_info(),
                    self.token_account_authority.to_account_info(),
                    self.source_token_account.to_account_info(),
                    self.destination_token_account.to_account_info(),
                    self.source_mint.to_account_info(),
                    self.destination_mint.to_account_info(),
                    self.event_authority.to_account_info(),
                    self.jupiter_program.to_account_info(),
                ];
                account_infos.extend(
                    remaining_accounts
                        .iter()
                        .map(|acc| AccountInfo { ..acc.clone() }),
                );

                let mut accounts = vec![
                    AccountMeta::new_readonly(self.token_program.key(), false), // token program
                    AccountMeta::new_readonly(self.token_account_authority.key(), true), // user transfer authority
                    AccountMeta::new(self.source_token_account.key(), false), // user source token account
                    AccountMeta::new(self.destination_token_account.key(), false), // user destination token account
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] destination token account
                    AccountMeta::new_readonly(self.source_mint.key(), false),      // source mint
                    AccountMeta::new_readonly(self.destination_mint.key(), false), // destination mint
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] platform fee account
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] token 2022 program
                    AccountMeta::new_readonly(self.event_authority.key(), false), // event authority
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // jupiter program
                ];
                accounts.extend(remaining_accounts.iter().map(|acc| AccountMeta {
                    pubkey: *acc.key,
                    is_signer: false,
                    is_writable: acc.is_writable,
                }));

                msg!("Performing a CPI with ExactOutRoute");

                (account_infos, accounts)
            }
            data if data.starts_with(&ROUTE_DISCRIMINATOR) => {
                let mut account_infos = vec![
                    self.token_program.to_account_info(),
                    self.token_account_authority.to_account_info(),
                    self.source_token_account.to_account_info(),
                    self.destination_token_account.to_account_info(),
                    self.destination_mint.to_account_info(),
                    self.event_authority.to_account_info(),
                    self.jupiter_program.to_account_info(),
                ];
                account_infos.extend(
                    remaining_accounts
                        .iter()
                        .map(|acc| AccountInfo { ..acc.clone() }),
                );

                let mut accounts = vec![
                    AccountMeta::new_readonly(self.token_program.key(), false), // token program
                    AccountMeta::new_readonly(self.token_account_authority.key(), true), // user transfer authority
                    AccountMeta::new(self.source_token_account.key(), false), // user source token account
                    AccountMeta::new(self.destination_token_account.key(), false), // user destination token account
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] destination token account
                    AccountMeta::new_readonly(self.destination_mint.key(), false), // destination mint
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] platform fee account
                    AccountMeta::new_readonly(self.event_authority.key(), false), // event authority
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // jupiter program
                ];
                accounts.extend(remaining_accounts.iter().map(|acc| AccountMeta {
                    pubkey: *acc.key,
                    is_signer: false,
                    is_writable: acc.is_writable,
                }));

                msg!("Performing a CPI with Route");

                (account_infos, accounts)
            }
            data if data.starts_with(&SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR)
                || data.starts_with(&SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR) =>
            {
                let mut account_infos = vec![
                    self.token_program.to_account_info(),
                    remaining_accounts[0].to_account_info(),
                    self.token_account_authority.to_account_info(),
                    self.source_token_account.to_account_info(),
                    remaining_accounts[1].to_account_info(),
                    remaining_accounts[2].to_account_info(),
                    self.destination_token_account.to_account_info(),
                    self.source_mint.to_account_info(),
                    self.destination_mint.to_account_info(),
                    self.event_authority.to_account_info(),
                    self.jupiter_program.to_account_info(),
                ];
                account_infos.extend(
                    remaining_accounts
                        .iter()
                        .map(|acc| AccountInfo { ..acc.clone() }),
                );

                let mut accounts = vec![
                    AccountMeta::new_readonly(self.token_program.key(), false), // token program
                    AccountMeta::new_readonly(remaining_accounts[0].key(), false), // program authority
                    AccountMeta::new_readonly(self.token_account_authority.key(), true), // user transfer authority
                    AccountMeta::new(self.source_token_account.key(), false),       // source token account
                    AccountMeta::new(remaining_accounts[1].key(), false), // program source token account
                    AccountMeta::new(remaining_accounts[2].key(), false), // program destination token account
                    AccountMeta::new(self.destination_token_account.key(), false), // destination token account
                    AccountMeta::new_readonly(self.source_mint.key(), false), // source mint
                    AccountMeta::new_readonly(self.destination_mint.key(), false), // destination mint
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] platform fee account
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // [optional] token 2022 program
                    AccountMeta::new_readonly(self.event_authority.key(), false), // event authority
                    AccountMeta::new_readonly(self.jupiter_program.key(), false), // jupiter program
                ];
                accounts.extend(remaining_accounts.iter().skip(3).map(|acc| AccountMeta {
                    pubkey: *acc.key,
                    is_signer: false,
                    is_writable: acc.is_writable,
                }));

                msg!("Performing a CPI with SharedAccounts (ExactOutRoute or Route)");

                (account_infos, accounts)
            }
            _ => {
                return Err(Error::from(ProgramError::InvalidInstructionData));
            }
        };

        let swap_ix = Instruction {
            program_id: self.jupiter_program.key(),
            accounts,
            data: swap_data.to_vec(),
        };

        invoke_signed(&swap_ix, &account_infos, &[signer_seeds])?;

        Ok(())
    }
}
