# Raffle Platform - Solana Program

A decentralized raffle platform smart contract built on Solana using the Anchor framework. This program enables transparent, fair raffles with slot-based randomness and automatic prize distribution.

## Program ID

**Devnet**: `9Vu2g7S8oxYbk3JmHzjQXdoHguwEwPgVDq6KxAKAGWiW`

## Features

-  Create custom raffles with configurable parameters
-  Buy tickets with SOL
-  Provably fair winner selection using blockchain slot randomness
-  Automatic prize distribution (90% to winner, 10% to creator)
-  Complete on-chain transparency
-  Vector-based ticket tracking for efficient winner selection
-  State management (Active � Ended � Completed)

## Program Structure

### Instructions

#### 1. `create_raffle`
Creates a new raffle with specified parameters.

**Parameters:**
- `raffle_id: u64` - Unique identifier for the raffle
- `ticket_price: u64` - Price per ticket in lamports
- `max_tickets: u32` - Maximum number of tickets (up to 20)
- `end_time: i64` - Unix timestamp when raffle ends

**Accounts:**
- `raffle` - The raffle PDA to initialize
- `creator` - The wallet creating the raffle (signer, payer)
- `system_program` - Solana system program

**Validations:**
-  Ticket price must be > 0
-  Max tickets must be > 0
-  End time must be in the future

#### 2. `buy_ticket`
Purchases a ticket for an active raffle.

**Accounts:**
- `raffle` - The raffle PDA (mutable)
- `ticket` - The ticket PDA to create
- `buyer` - The wallet buying the ticket (signer, payer)
- `system_program` - Solana system program

**Behavior:**
- Transfers SOL from buyer to raffle PDA
- Creates unique ticket account
- Adds buyer to ticket_buyers vector
- Automatically transitions raffle to Ended if max tickets reached

**Validations:**
-  Raffle must be Active
-  Tickets must be available

#### 3. `draw_winner`
Draws winner using slot-based randomness and distributes prizes.

**Accounts:**
- `raffle` - The raffle PDA (mutable)
- `creator` - The raffle creator (receives 10% fee)
- `system_program` - Solana system program
- `remaining_accounts` - All ticket buyer accounts + creator

**Behavior:**
- Calculates winner: `current_slot % total_tickets_sold`
- Finds winner in remaining_accounts
- Transfers 90% of balance to winner
- Transfers 10% of balance to creator
- Updates raffle state to Completed

**Validations:**
-  Raffle must be Ended
-  At least one ticket must be sold
-  Winner account must be provided in remaining_accounts

### Account Structures

#### Raffle Account
```rust
#[account]
pub struct Raffle {
    pub creator: Pubkey,              // Creator of the raffle
    pub ticket_price: u64,            // Price per ticket in lamports
    pub max_tickets: u32,             // Maximum number of tickets
    pub end_time: i64,                // Unix timestamp when raffle ends
    pub total_tickets_sold: u32,      // Current number of tickets sold
    pub ticket_buyers: Vec<Pubkey>,   // List of all ticket buyers (max 20)
    pub winner: Option<Pubkey>,       // Winner's public key (None until drawn)
    pub state: RaffleState,           // Current state
    pub bump: u8,                     // PDA bump seed
    pub raffle_id: u64,               // Unique raffle identifier
}
```

**Space Calculation:**
- 8 (discriminator) + 32 + 8 + 4 + 8 + 4 + (4 + 32*20) + (1 + 32) + 1 + 1 + 8 = ~751 bytes

#### Ticket Account
```rust
#[account]
pub struct Ticket {
    pub raffle: Pubkey,       // Associated raffle public key
    pub buyer: Pubkey,        // Buyer/owner of the ticket
    pub ticket_number: u32,   // Ticket number (0-indexed)
    pub purchase_time: i64,   // Unix timestamp when purchased
    pub bump: u8,             // PDA bump seed
}
```

**Space Calculation:**
- 8 (discriminator) + 32 + 32 + 4 + 8 + 1 = 85 bytes

#### Raffle State Enum
```rust
pub enum RaffleState {
    Active,      // Raffle is active, tickets can be purchased
    Ended,       // Raffle has ended, ready for winner drawing
    Completed,   // Winner has been drawn and prize distributed
}
```

### PDA Seeds

#### Raffle PDA
```rust
seeds = [b"raffle", creator.key().as_ref(), raffle_id.to_le_bytes().as_ref()]
```

#### Ticket PDA
```rust
seeds = [b"ticket", raffle.key().as_ref(), ticket_number.to_le_bytes().as_ref()]
```

## Development

### Prerequisites

- Rust 1.70+
- Solana CLI 1.17+
- Anchor CLI 0.29+
- Node.js 18+
- Yarn

### Installation

```bash
# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Testing

The test suite covers:

**Happy Path:**
-  Creating raffles with valid parameters
-  Buying tickets successfully
-  Drawing winners with correct prize distribution
-  Automatic state transitions

**Error Cases:**
- L Invalid ticket price (0)
- L Invalid max tickets (0)
- L Invalid end time (past)
- L Buying from inactive raffle
- L Buying from sold out raffle
- L Drawing winner before raffle ends
- L Drawing winner with no tickets sold

```bash
# Run all tests
anchor test

# Run with detailed output
anchor test -- --nocapture
```

## Technical Implementation Details

### Slot-Based Randomness

The program uses Solana's blockchain slot numbers for provably fair randomness:

```rust
let slot = clock.slot;
let winning_index = (slot % raffle.total_tickets_sold as u64) as usize;
let winner_pubkey = raffle.ticket_buyers[winning_index];
```

**Benefits:**
- Completely deterministic and verifiable
- Cannot be manipulated or predicted
- Transparent on-chain
- No external oracles needed

### Remaining Accounts Pattern

To handle the dynamic winner account, the program uses the `remaining_accounts` pattern:

```rust
let winner_account = ctx.remaining_accounts
    .iter()
    .find(|acc| acc.key() == winner_pubkey)
    .ok_or(ErrorCode::InvalidWinningTicket)?;
```

This eliminates race conditions where the slot might change between frontend calculation and on-chain execution.

### Prize Distribution

Automatic on-chain distribution using checked arithmetic:

```rust
let winner_prize = raffle_balance
    .checked_mul(90)
    .ok_or(ErrorCode::MathOverflow)?
    .checked_div(100)
    .ok_or(ErrorCode::MathOverflow)?;

let creator_fee = raffle_balance
    .checked_sub(winner_prize)
    .ok_or(ErrorCode::MathOverflow)?;
```

## Error Codes

| Code | Error | Description |
|------|-------|-------------|
| 6000 | InvalidTicketPrice | Ticket price must be greater than zero |
| 6001 | InvalidMaxTickets | Max tickets must be greater than zero |
| 6002 | InvalidEndTime | End time must be in the future |
| 6003 | RaffleNotActive | Raffle is not active |
| 6004 | RaffleSoldOut | Raffle has sold out |
| 6005 | RaffleNotEnded | Raffle has not ended yet |
| 6006 | NoTicketsSold | No tickets have been sold |
| 6007 | Unauthorized | Unauthorized operation |
| 6008 | CannotCancelWithTickets | Cannot cancel raffle with tickets sold |
| 6009 | MathOverflow | Math overflow occurred |
| 6010 | InvalidWinningTicket | Invalid winning ticket provided |

## Security Considerations

### Implemented Protections

 **Checked Arithmetic**: All mathematical operations use checked functions to prevent overflows
 **PDA Validation**: All PDAs verified with correct seeds and bumps
 **State Machine**: Strict state transitions prevent invalid operations
 **Access Control**: Only authorized accounts can modify data
 **Input Validation**: All inputs validated before processing
 **Reentrancy Protection**: State updated before external calls

### Limitations

� **20 Ticket Maximum**: Limited by vector space allocation to avoid stack overflow
� **No Refunds**: Tickets cannot be refunded once purchased
� **Manual Winner Draw**: Requires someone to call draw_winner (could be automated with Clockwork)
� **SOL Only**: Does not support SPL tokens

## Deployment

### Devnet Deployment

```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Airdrop SOL for deployment
solana airdrop 2

# Build the program
anchor build

# Deploy to devnet
anchor deploy

# Update program ID in lib.rs and Anchor.toml
# Then rebuild and redeploy
```

### Mainnet Deployment Checklist

Before deploying to mainnet:

- [ ] Complete security audit
- [ ] Thorough testing on devnet
- [ ] Upgrade authority consideration
- [ ] Program size optimization
- [ ] Emergency pause mechanism
- [ ] Multi-sig for program authority
- [ ] Monitoring and alerting setup

## IDL

The Interface Description Language (IDL) file is generated automatically and located at:
```
target/idl/raffle_platform.json
```

This file is used by the frontend to interact with the program.

## License

MIT

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)
- [Solana Program Library](https://spl.solana.com/)
