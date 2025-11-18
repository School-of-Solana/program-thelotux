# Raffle Platform - Frontend

A modern, responsive web application for interacting with the Raffle Platform Solana program. Built with Next.js 15, TypeScript, and Solana Wallet Adapter.

## Features

- 🎯 Create custom raffles with configurable parameters
- 🎫 Buy raffle tickets with SOL
- 🏆 Draw winners with provably fair slot-based randomness
- 📊 Real-time raffle status and ticket tracking
- 📜 Complete raffle history with transaction signatures
- 💰 Automatic prize distribution visualization
- 🔌 Multi-wallet support (Phantom, Backpack, Solflare)
- 📱 Responsive design for mobile and desktop

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Blockchain**: Solana (Devnet)
- **Smart Contract Framework**: Anchor
- **Wallet Integration**: Solana Wallet Adapter
- **Styling**: Tailwind CSS
- **State Management**: React Hooks + LocalStorage

## Prerequisites

- Node.js 18+
- Yarn or npm
- A Solana wallet (Phantom, Backpack, or Solflare recommended)
- SOL on Devnet for testing

## Getting Started

### 1. Installation

```bash
# Install dependencies
yarn install
# or
npm install
```

### 2. Configuration

The application is pre-configured to use the deployed program on Solana Devnet. The program ID is automatically loaded from:

```
utils/raffle_platform.json
```

**Current Program ID**: `9Vu2g7S8oxYbk3JmHzjQXdoHguwEwPgVDq6KxAKAGWiW`

### 3. Get Devnet SOL

To interact with the dApp on devnet, you'll need SOL:

```bash
# Using Solana CLI
solana airdrop 2 YOUR_WALLET_ADDRESS --url devnet

# Or use the devnet faucet
# Visit: https://faucet.solana.com/
```

### 4. Run Development Server

```bash
yarn dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout with wallet provider
│   └── page.tsx            # Main page component
├── components/
│   ├── RafflePlatform.tsx  # Main raffle interface
│   └── WalletProvider.tsx  # Wallet adapter configuration
├── utils/
│   └── raffle_platform.json # Program IDL
├── public/                 # Static assets
└── package.json
```

## Components

### RafflePlatform.tsx

Main component handling all raffle interactions:

**State Management:**
- Active raffles list
- Raffle history (localStorage)
- Loading states
- Error handling

**Key Functions:**
- `createRaffle()` - Creates new raffle on-chain
- `buyTicket()` - Purchases ticket for raffle
- `drawWinner()` - Triggers winner selection and prize distribution
- `loadRaffles()` - Fetches all active raffles

**Features:**
- Tab navigation (Active Raffles, Create Raffle, History)
- Real-time ticket count updates
- Transaction confirmation feedback
- Automatic history tracking

### WalletProvider.tsx

Wallet adapter configuration:

**Supported Wallets:**
- Phantom
- Backpack
- Solflare

**Configuration:**
- Network: Devnet
- Auto-connect: Enabled
- Error handling: User-friendly messages

## Usage Guide

### For Raffle Creators

1. **Connect Your Wallet**
   - Click "Select Wallet" button
   - Choose your wallet (Phantom, Backpack, or Solflare)
   - Approve the connection

2. **Create a Raffle**
   - Navigate to "Create Raffle" tab
   - Fill in the form:
     - **Raffle ID**: Unique number for your raffle
     - **Ticket Price**: Price in SOL (e.g., 0.01)
     - **Max Tickets**: Maximum tickets to sell (1-20)
     - **End Time**: When raffle closes (date/time picker)
   - Click "Create Raffle"
   - Approve the transaction in your wallet
   - Wait for confirmation

3. **Monitor Your Raffle**
   - Check "Active Raffles" tab to see ticket sales
   - Each ticket purchase updates the count in real-time

4. **Draw the Winner**
   - After raffle ends or sells out, click "Draw Winner"
   - Approve the transaction
   - Winner selected using blockchain slot randomness
   - 90% of funds go to winner, 10% to you automatically

### For Participants

1. **Connect Your Wallet**
   - Click "Select Wallet" and connect

2. **Browse Active Raffles**
   - View all active raffles in the "Active Raffles" tab
   - See ticket price, availability, and time remaining

3. **Buy a Ticket**
   - Click "Buy Ticket" on desired raffle
   - Approve the transaction (pays ticket price)
   - Wait for confirmation
   - Your ticket is recorded on-chain

4. **Check Results**
   - Go to "History" tab after raffle completes
   - See winner, your ticket number, and transaction details
   - If you won, funds are already in your wallet!

## Key Features Explained

### Slot-Based Randomness

Winner selection uses Solana's blockchain slot for provably fair randomness:

```typescript
// Frontend calculates from transaction slot
const txDetails = await provider.connection.getTransaction(tx);
const actualWinningIndex = txDetails.slot % raffleAccount.totalTicketsSold;
const actualWinner = raffleAccount.ticketBuyers[actualWinningIndex];
```

**Why It's Fair:**
- Uses blockchain state (slot) - cannot be manipulated
- Same formula on-chain and frontend
- Completely transparent and verifiable
- No external oracles needed

### Remaining Accounts Pattern

To handle slot timing, all potential winners are passed to the transaction:

```typescript
const remainingAccounts = raffleAccount.ticketBuyers.map(buyer => ({
  pubkey: buyer,
  isSigner: false,
  isWritable: true,
}));

await program.methods
  .drawWinner()
  .remainingAccounts(remainingAccounts)
  .rpc();
```

This eliminates race conditions where the slot changes between calculation and execution.

### History Tracking

Raffle history is stored in browser localStorage:

```typescript
interface RaffleHistoryEntry {
  raffleId: string;
  raffleAddress: string;
  creator: string;
  ticketPrice: number;
  maxTickets: number;
  totalTicketsSold: number;
  endTime: number;
  winner: string;
  winningTicketNumber: number;
  completedAt: number;
  transactionSignature: string;
}
```

**Benefits:**
- Persists across sessions
- No backend required
- Fast local access
- Privacy-friendly

## Development

### Available Scripts

```bash
# Start development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start

# Run linter
yarn lint
```

### Environment Variables

Create a `.env.local` file for custom configuration:

```env
# Optional: Custom RPC endpoint
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com

# Optional: Network (devnet, testnet, mainnet-beta)
NEXT_PUBLIC_NETWORK=devnet
```

### Adding New Wallets

To add support for additional wallets, update `WalletProvider.tsx`:

```typescript
import { NewWalletAdapter } from '@solana/wallet-adapter-new-wallet';

const wallets = useMemo(
  () => [
    new PhantomWalletAdapter(),
    new BackpackWalletAdapter(),
    new SolflareWalletAdapter(),
    new NewWalletAdapter(), // Add new wallet here
  ],
  []
);
```

## Deployment

### Vercel Deployment (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel auto-detects Next.js
   - Click "Deploy"

3. **Update Program ID** (if needed)
   - If you deploy your own program, update `utils/raffle_platform.json`
   - Redeploy

### Other Platforms

The app can be deployed to any platform supporting Next.js:
- Netlify
- AWS Amplify
- Cloudflare Pages
- Self-hosted

## Troubleshooting

### Wallet Not Connecting

**Issue**: Wallet connection fails
**Solutions**:
- Ensure wallet extension is installed
- Refresh the page
- Check browser console for errors
- Try a different wallet

### Transaction Failing

**Issue**: Transactions fail with errors
**Solutions**:
- Ensure sufficient SOL balance for fees
- Check raffle is Active (for buying tickets)
- Check raffle is Ended (for drawing winner)
- Verify network is Devnet

### No Raffles Showing

**Issue**: Active raffles not loading
**Solutions**:
- Check console for errors
- Verify program ID in `utils/raffle_platform.json`
- Ensure network is Devnet
- Refresh the page

### History Not Showing

**Issue**: Raffle history empty
**Solutions**:
- History is stored in localStorage (browser-specific)
- Check same browser/device where you participated
- Clear and re-complete raffles to rebuild history

## Security Considerations

### Frontend Security

✅ **Input Validation**: All user inputs validated before submission
✅ **Transaction Verification**: All transactions confirmed before state updates
✅ **Error Handling**: Comprehensive error messages for debugging
✅ **Wallet Security**: Never requests private keys or seed phrases

### Best Practices

- Always verify transaction details in your wallet before approving
- Start with small amounts on devnet for testing
- Check the raffle creator address before buying tickets
- Verify transaction signatures on Solana Explorer

## Testing

### Manual Testing Checklist

**Create Raffle:**
- [ ] Valid parameters accepted
- [ ] Invalid parameters rejected (price=0, tickets=0, past time)
- [ ] Transaction confirmation shown
- [ ] Raffle appears in Active Raffles

**Buy Ticket:**
- [ ] Ticket purchase succeeds
- [ ] Correct SOL amount deducted
- [ ] Ticket count updates
- [ ] Multiple tickets can be bought

**Draw Winner:**
- [ ] Cannot draw before raffle ends
- [ ] Winner selection works
- [ ] Prize distribution correct (90/10 split)
- [ ] Winner shown in History

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Solana Wallet Adapter](https://github.com/solana-labs/wallet-adapter)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)


## License

MIT
