# Project Description

**Deployed Frontend URL:** https://program-thelotux.vercel.app/

**Solana Program ID:** `9Vu2g7S8oxYbk3JmHzjQXdoHguwEwPgVDq6KxAKAGWiW`

## Project Overview

### Description
A decentralized raffle platform built on Solana that enables users to create, participate in, and manage transparent raffles with provably fair winner selection. The platform uses blockchain slot-based randomness to ensure fair and verifiable winner selection, with automatic prize distribution splitting 90% to the winner and 10% to the raffle creator. Each raffle maintains a complete on-chain record of all participants, making the process fully transparent and auditable.

### Key Features
- **Create Raffles**: Set up custom raffles with configurable ticket prices, maximum tickets, and end times
- **Buy Tickets**: Purchase raffle tickets with SOL; each purchase is recorded on-chain
- **Slot-Based Randomness**: Provably fair winner selection using Solana blockchain slot numbers
- **Automatic Distribution**: 90% prize to winner, 10% fee to creator - distributed automatically on-chain
- **Complete Transparency**: All ticket purchases and winners recorded on-chain with transaction history
- **Real-Time Updates**: Live raffle status tracking with ticket counts and time remaining
- **History Tracking**: Complete record of all completed raffles with winners and transaction signatures

### How to Use the dApp

#### For Raffle Creators:
1. **Connect Wallet** - Connect your Solana wallet (Phantom, Backpack, Solflare supported)
2. **Create Raffle** - Click "Create New Raffle" and configure:
   - Raffle ID (unique identifier)
   - Ticket Price (in SOL)
   - Maximum Tickets (up to 100)
   - End Time (deadline for ticket sales)
3. **Wait for Participants** - Monitor ticket sales in the Active Raffles section
4. **Draw Winner** - After raffle ends or sells out, anyone can trigger the winner draw
5. **Receive Fee** - Automatically receive 10% of total raffle funds

#### For Participants:
1. **Connect Wallet** - Connect your Solana wallet
2. **Browse Raffles** - View active raffles with ticket prices and availability
3. **Buy Tickets** - Purchase tickets for any active raffle
4. **Check Results** - View completed raffles in the History tab to see if you won
5. **Receive Prize** - If you win, 90% of raffle funds are automatically transferred to your wallet

## Program Architecture

The Raffle Platform uses a sophisticated architecture with two main account types and three core instructions. The program leverages PDAs for deterministic raffle addresses and implements a vector-based ticket tracking system with slot-based randomness for provably fair winner selection.

### PDA Usage

The program uses Program Derived Addresses to create deterministic accounts for raffles and tickets, ensuring uniqueness and enabling efficient lookups.

**PDAs Used:**
- **Raffle PDA**: Derived from seeds `["raffle", creator_pubkey, raffle_id]` - ensures each creator can have multiple unique raffles
- **Ticket PDA**: Derived from seeds `["ticket", raffle_pubkey, ticket_number]` - creates unique ticket accounts for each purchase

### Program Instructions

**Instructions Implemented:**

1. **create_raffle**
   - Creates a new raffle with specified parameters
   - Validates ticket price > 0, max tickets > 0, end time is in future
   - Initializes raffle state as Active
   - Allocates space for ticket_buyers vector (max 100 tickets)

2. **buy_ticket**
   - Purchases a ticket for an active raffle
   - Transfers SOL from buyer to raffle PDA
   - Creates unique ticket account with buyer information
   - Adds buyer pubkey to raffle's ticket_buyers vector
   - Automatically transitions raffle to Ended state if max tickets reached

3. **draw_winner**
   - Draws winner for ended raffle using slot-based randomness
   - Calculates winner index: `current_slot % total_tickets_sold`
   - Uses remaining_accounts pattern to find winner from ticket_buyers array
   - Transfers 90% of raffle balance to winner
   - Transfers 10% of raffle balance to creator
   - Updates raffle state to Completed

### Account Structure

```rust
#[account]
pub struct Raffle {
    pub creator: Pubkey,              // Creator of the raffle
    pub ticket_price: u64,            // Price per ticket in lamports
    pub max_tickets: u32,             // Maximum number of tickets
    pub end_time: i64,                // Unix timestamp when raffle ends
    pub total_tickets_sold: u32,      // Current number of tickets sold
    pub ticket_buyers: Vec<Pubkey>,   // List of all ticket buyers (max 100)
    pub winner: Option<Pubkey>,       // Winner's public key (None until drawn)
    pub state: RaffleState,           // Current state (Active, Ended, Completed)
    pub bump: u8,                     // PDA bump seed
    pub raffle_id: u64,               // Unique raffle identifier
}

#[account]
pub struct Ticket {
    pub raffle: Pubkey,       // Associated raffle public key
    pub buyer: Pubkey,        // Buyer/owner of the ticket
    pub ticket_number: u32,   // Ticket number (0-indexed)
    pub purchase_time: i64,   // Unix timestamp when purchased
    pub bump: u8,             // PDA bump seed
}

pub enum RaffleState {
    Active,      // Raffle is active, tickets can be purchased
    Ended,       // Raffle has ended, ready for winner drawing
    Completed,   // Winner has been drawn and prize distributed
}
```

### Technical Implementation Details

#### Slot-Based Randomness
The platform uses Solana's blockchain slot numbers for provably fair randomness:
- Winner index calculated as: `slot % total_tickets_sold`
- Uses the transaction's actual execution slot (not predicted)
- Completely transparent and verifiable on-chain
- Prevents any manipulation or prediction of winners

#### Remaining Accounts Pattern
To handle slot timing variability, the draw_winner instruction uses the remaining_accounts pattern:
- Frontend passes all ticket buyer accounts as remaining_accounts
- On-chain program calculates winner using current slot
- Program searches remaining_accounts for the winner's pubkey
- Eliminates race conditions and failed transactions

#### Prize Distribution
Automatic on-chain distribution ensures fairness:
- 90% of total raffle balance to winner
- 10% of total raffle balance to creator
- Uses checked arithmetic to prevent overflows
- Direct lamport transfers for efficiency

## Testing

### Test Coverage

Comprehensive test suite covering all instructions with both successful operations and error conditions to ensure program security, fairness, and reliability.

**Happy Path Tests:**
- **Create Raffle**: Successfully creates raffle with valid parameters
- **Buy Ticket**: Properly transfers SOL and creates ticket account
- **Multiple Tickets**: Multiple users can buy tickets for same raffle
- **Draw Winner**: Correctly selects winner and distributes prizes
- **Auto-End on Sold Out**: Raffle transitions to Ended when max tickets sold

**Unhappy Path Tests:**
- **Invalid Ticket Price**: Fails when ticket_price = 0
- **Invalid Max Tickets**: Fails when max_tickets = 0
- **Invalid End Time**: Fails when end_time is in the past
- **Buy from Inactive Raffle**: Fails when raffle is not Active
- **Buy from Sold Out Raffle**: Fails when all tickets are sold
- **Draw Before End**: Fails when raffle hasn't ended yet
- **Draw with No Tickets**: Fails when no tickets were sold
- **Invalid Winner Account**: Fails when winner account not provided in remaining_accounts

**Edge Cases Tested:**
- **Maximum Tickets**: Testing with 100 tickets (vector limit)
- **Slot Randomness**: Verifying different slots produce different winners
- **Prize Calculation**: Ensuring correct 90/10 split with various amounts
- **State Transitions**: Validating proper state changes through raffle lifecycle

### Running Tests

```bash
# Install dependencies
cd anchor_project/raffle_platform
yarn install

# Run all tests
anchor test

# Run with detailed output
anchor test -- --nocapture
```

### Frontend Testing

The frontend includes comprehensive error handling and user feedback:
- **Wallet Connection**: Clear prompts for wallet connection
- **Transaction Confirmation**: Loading states during blockchain operations
- **Error Messages**: User-friendly error explanations
- **Console Logging**: Detailed transaction information for debugging

## Additional Notes for Evaluators

### Key Learning Experiences

**Slot-Based Randomness Challenge:**
The biggest technical challenge was implementing truly fair randomness without VRF oracles. Initial attempts to predict the winning slot from the frontend led to race conditions - the slot would change between prediction and transaction execution, causing InvalidWinningTicket errors. The solution was implementing the remaining_accounts pattern, where we pass all possible winner accounts and let the on-chain program select the winner based on its current slot. This eliminated race conditions entirely and ensured provably fair randomness.

**Vector Storage Architecture:**
Storing all ticket buyers in a `Vec<Pubkey>` within the raffle account was essential for slot-based winner selection, but required careful space allocation planning. With a max of 20 tickets and 32 bytes per Pubkey, this meant 640 bytes just for the vector, plus overhead for length tracking. This design choice enabled O(1) winner lookup but required understanding Anchor's `#[max_len(20)]` macro and space calculations.

**Account Closure Timing:**
Initially tried to fetch the raffle account after drawing the winner to display results, but the account would already be closed (balance = 0 after prize distribution). The solution was to calculate the winner deterministically using the transaction slot from `getTransaction()`, matching exactly what the on-chain program does. This reinforced the importance of understanding Solana's account lifetime and rent-exempt requirements.

**Remaining Accounts Pattern:**
Learned that Solana requires all accounts that will be modified to be declared upfront in the transaction. This is fundamentally different from Ethereum where you can transfer to any address. The remaining_accounts pattern is the proper Solana idiom for dynamic account arrays, and understanding this pattern was crucial for solving the slot timing issue.

**Prize Distribution Math:**
Implemented checked arithmetic throughout the prize distribution to prevent overflow attacks. The 90/10 split calculation required careful ordering (multiply before divide to avoid rounding issues) and proper error handling with Solana's `checked_mul()` and `checked_div()` patterns.

### Design Decisions

1. **100 Ticket Limit**: Balances storage costs with practical raffle sizes
2. **10% Creator Fee**: Incentivizes raffle creation while keeping prizes attractive
3. **No Ticket Refunds**: Simplifies state management and prevents gaming
4. **Automatic State Transitions**: Raffle ends automatically when sold out
5. **Anyone Can Draw**: Permissionless winner drawing ensures raffles complete
6. **History in LocalStorage**: Keeps frontend lightweight while preserving user history

### Future Enhancements

Potential improvements for production deployment:
- SPL token support (not just SOL)
- Multi-winner raffles with configurable prize splits
- Scheduled raffles with automatic end-time drawing
- NFT raffles with Metaplex integration
- Platform-wide analytics dashboard
- Raffle discovery and filtering
- Social sharing and notifications
