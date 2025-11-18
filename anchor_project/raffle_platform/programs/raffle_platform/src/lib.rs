use anchor_lang::prelude::*;

declare_id!("9Vu2g7S8oxYbk3JmHzjQXdoHguwEwPgVDq6KxAKAGWiW");

#[program]
pub mod raffle_platform {
    use super::*;

    /// Creates a new raffle with specified parameters
    ///
    /// # Arguments
    /// * `raffle_id` - Unique identifier for the raffle (managed by creator)
    /// * `ticket_price` - Price per ticket in lamports
    /// * `max_tickets` - Maximum number of tickets available
    /// * `end_time` - Unix timestamp when raffle ends
    pub fn create_raffle(
        ctx: Context<CreateRaffle>,
        raffle_id: u64,
        ticket_price: u64,
        max_tickets: u32,
        end_time: i64,
    ) -> Result<()> {
        // Validation
        require!(ticket_price > 0, ErrorCode::InvalidTicketPrice);
        require!(max_tickets > 0, ErrorCode::InvalidMaxTickets);

        let clock = Clock::get()?;
        require!(end_time > clock.unix_timestamp, ErrorCode::InvalidEndTime);

        // Initialize raffle account
        let raffle = &mut ctx.accounts.raffle;
        raffle.creator = ctx.accounts.creator.key();
        raffle.ticket_price = ticket_price;
        raffle.max_tickets = max_tickets;
        raffle.end_time = end_time;
        raffle.total_tickets_sold = 0;
        raffle.ticket_buyers = Vec::new(); // Initialize empty vector for ticket buyers
        raffle.winner = None;
        raffle.state = RaffleState::Active;
        raffle.bump = ctx.bumps.raffle;
        raffle.raffle_id = raffle_id;

        msg!(
            "Raffle created! ID: {}, Price: {}, Max Tickets: {}, Ends: {}",
            raffle_id,
            ticket_price,
            max_tickets,
            end_time
        );

        Ok(())
    }

    /// Purchases a ticket for an active raffle
    ///
    /// Transfers SOL from buyer to raffle PDA and creates a ticket account.
    /// Automatically transitions raffle to Ended state if max tickets reached.
    pub fn buy_ticket(ctx: Context<BuyTicket>) -> Result<()> {
        let raffle = &mut ctx.accounts.raffle;
        let clock = Clock::get()?;

        // Validation: Check raffle is active
        require!(
            raffle.state == RaffleState::Active,
            ErrorCode::RaffleNotActive
        );

        // Validation: Check tickets available
        require!(
            raffle.total_tickets_sold < raffle.max_tickets,
            ErrorCode::RaffleSoldOut
        );

        // Transfer SOL from buyer to raffle PDA
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.buyer.key(),
            &raffle.key(),
            raffle.ticket_price,
        );

        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.buyer.to_account_info(),
                raffle.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize ticket account
        let ticket = &mut ctx.accounts.ticket;
        ticket.raffle = raffle.key();
        ticket.buyer = ctx.accounts.buyer.key();
        ticket.ticket_number = raffle.total_tickets_sold;
        ticket.purchase_time = clock.unix_timestamp;
        ticket.bump = ctx.bumps.ticket;

        // Add buyer to the ticket_buyers vector
        raffle.ticket_buyers.push(ctx.accounts.buyer.key());

        // Increment ticket count
        raffle.total_tickets_sold = raffle
            .total_tickets_sold
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        msg!(
            "Ticket #{} purchased by {} for raffle {}",
            ticket.ticket_number,
            ctx.accounts.buyer.key(),
            raffle.raffle_id
        );

        // Check if raffle should end (max tickets reached)
        if raffle.total_tickets_sold >= raffle.max_tickets {
            raffle.state = RaffleState::Ended;
            msg!("Raffle {} has ended (sold out)", raffle.raffle_id);
        }

        Ok(())
    }

    /// Draws a winner for an ended raffle and distributes prizes
    ///
    /// Uses slot-based randomness to select a winning ticket.
    /// Distributes 90% to winner and 10% to creator.
    pub fn draw_winner(ctx: Context<DrawWinner>) -> Result<()> {
        let raffle = &mut ctx.accounts.raffle;
        let clock = Clock::get()?;

        // Check if raffle should end based on time (if not already ended)
        if raffle.state == RaffleState::Active && clock.unix_timestamp >= raffle.end_time {
            raffle.state = RaffleState::Ended;
            msg!("Raffle {} has ended (time expired)", raffle.raffle_id);
        }

        // Validation: Check raffle is in Ended state
        require!(
            raffle.state == RaffleState::Ended,
            ErrorCode::RaffleNotEnded
        );

        // Validation: Check tickets were sold
        require!(
            raffle.total_tickets_sold > 0,
            ErrorCode::NoTicketsSold
        );

        // Use slot-based randomness to pick winner from stored ticket_buyers
        let slot = clock.slot;
        let winning_index = (slot % raffle.total_tickets_sold as u64) as usize;
        let winner_pubkey = raffle.ticket_buyers[winning_index];

        msg!("Drawing winner for raffle {}", raffle.raffle_id);
        msg!("Winning ticket index: {}", winning_index);
        msg!("Winner: {}", winner_pubkey);

        // Find the winner account in remaining_accounts
        let winner_account = ctx.remaining_accounts
            .iter()
            .find(|acc| acc.key() == winner_pubkey)
            .ok_or(ErrorCode::InvalidWinningTicket)?;

        // Get raffle's total balance
        let raffle_balance = raffle.to_account_info().lamports();

        // Calculate prize distribution: 90% to winner, 10% to creator
        let winner_prize = raffle_balance
            .checked_mul(90)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(100)
            .ok_or(ErrorCode::MathOverflow)?;

        let creator_fee = raffle_balance
            .checked_sub(winner_prize)
            .ok_or(ErrorCode::MathOverflow)?;

        msg!("Total balance: {} lamports", raffle_balance);
        msg!("Winner prize: {} lamports (90%)", winner_prize);
        msg!("Creator fee: {} lamports (10%)", creator_fee);

        // Transfer winner prize
        **raffle.to_account_info().try_borrow_mut_lamports()? = raffle
            .to_account_info()
            .lamports()
            .checked_sub(winner_prize)
            .ok_or(ErrorCode::MathOverflow)?;

        **winner_account.try_borrow_mut_lamports()? = winner_account
            .lamports()
            .checked_add(winner_prize)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer creator fee
        **raffle.to_account_info().try_borrow_mut_lamports()? = raffle
            .to_account_info()
            .lamports()
            .checked_sub(creator_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? = ctx
            .accounts
            .creator
            .to_account_info()
            .lamports()
            .checked_add(creator_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update raffle state
        raffle.winner = Some(winner_pubkey);
        raffle.state = RaffleState::Completed;

        msg!(
            "Winner drawn! {} wins {} lamports",
            winner_pubkey,
            winner_prize
        );

        Ok(())
    }
}

// ============================================================================
// Account Structures
// ============================================================================

#[derive(Accounts)]
#[instruction(raffle_id: u64)]
pub struct CreateRaffle<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Raffle::INIT_SPACE,
        seeds = [b"raffle", creator.key().as_ref(), raffle_id.to_le_bytes().as_ref()],
        bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTicket<'info> {
    #[account(
        mut,
        seeds = [b"raffle", raffle.creator.as_ref(), raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Ticket::INIT_SPACE,
        seeds = [b"ticket", raffle.key().as_ref(), raffle.total_tickets_sold.to_le_bytes().as_ref()],
        bump
    )]
    pub ticket: Account<'info, Ticket>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DrawWinner<'info> {
    #[account(
        mut,
        seeds = [b"raffle", raffle.creator.as_ref(), raffle.raffle_id.to_le_bytes().as_ref()],
        bump = raffle.bump
    )]
    pub raffle: Account<'info, Raffle>,

    /// CHECK: Creator account to receive fee
    #[account(mut)]
    pub creator: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    // Winner account will be passed via remaining_accounts and found dynamically
}

// ============================================================================
// Account Data Structures
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Raffle {
    /// Creator of the raffle
    pub creator: Pubkey,

    /// Price per ticket in lamports
    pub ticket_price: u64,

    /// Maximum number of tickets
    pub max_tickets: u32,

    /// Unix timestamp when raffle ends
    pub end_time: i64,

    /// Current number of tickets sold
    pub total_tickets_sold: u32,

    /// List of all ticket buyers (stores buyer pubkey for each ticket)
    #[max_len(20)]
    pub ticket_buyers: Vec<Pubkey>,

    /// Winner's public key (None until drawn)
    pub winner: Option<Pubkey>,

    /// Current state of the raffle
    pub state: RaffleState,

    /// PDA bump seed
    pub bump: u8,

    /// Unique raffle identifier
    pub raffle_id: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Ticket {
    /// Associated raffle public key
    pub raffle: Pubkey,

    /// Buyer/owner of the ticket
    pub buyer: Pubkey,

    /// Ticket number (0-indexed)
    pub ticket_number: u32,

    /// Unix timestamp when ticket was purchased
    pub purchase_time: i64,

    /// PDA bump seed
    pub bump: u8,
}

// ============================================================================
// Enums
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum RaffleState {
    /// Raffle is active, tickets can be purchased
    Active,

    /// Raffle has ended (time/max tickets reached), ready for winner drawing
    Ended,

    /// Winner has been drawn and prize distributed
    Completed,
}

// ============================================================================
// Error Codes
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Ticket price must be greater than zero")]
    InvalidTicketPrice,

    #[msg("Max tickets must be greater than zero")]
    InvalidMaxTickets,

    #[msg("End time must be in the future")]
    InvalidEndTime,

    #[msg("Raffle is not active")]
    RaffleNotActive,

    #[msg("Raffle has sold out")]
    RaffleSoldOut,

    #[msg("Raffle has not ended yet")]
    RaffleNotEnded,

    #[msg("No tickets have been sold")]
    NoTicketsSold,

    #[msg("Unauthorized operation")]
    Unauthorized,

    #[msg("Cannot cancel raffle with tickets sold")]
    CannotCancelWithTickets,

    #[msg("Math overflow occurred")]
    MathOverflow,

    #[msg("Invalid winning ticket provided")]
    InvalidWinningTicket,
}
