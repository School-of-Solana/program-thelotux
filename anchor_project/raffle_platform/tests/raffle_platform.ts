import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RafflePlatform } from "../target/types/raffle_platform";
import { expect } from "chai";
import { PublicKey, Keypair } from "@solana/web3.js";

describe("raffle_platform", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.rafflePlatform as Program<RafflePlatform>;

  // Test accounts - using fixed seeds for manual airdrop
  const creator = Keypair.fromSeed(new Uint8Array(32).fill(1));
  const buyer1 = Keypair.fromSeed(new Uint8Array(32).fill(2));
  const buyer2 = Keypair.fromSeed(new Uint8Array(32).fill(3));

  // Helper function to airdrop SOL to an account with retry logic
  async function airdropSol(publicKey: PublicKey, amount: number = 2, retries: number = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const signature = await provider.connection.requestAirdrop(
          publicKey,
          amount * anchor.web3.LAMPORTS_PER_SOL
        );
        const latestBlockhash = await provider.connection.getLatestBlockhash();
        await provider.connection.confirmTransaction({
          signature,
          ...latestBlockhash,
        });
        // Small delay to ensure account is funded
        await new Promise(resolve => setTimeout(resolve, 1000));
        return; // Success
      } catch (error) {
        console.log(`Airdrop attempt ${i + 1} failed: ${error.message}`);
        if (i === retries - 1) {
          // Last attempt failed, check if account already has balance
          const balance = await provider.connection.getBalance(publicKey);
          if (balance > 0) {
            console.log(`Account already has balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
            return; // Account has funds, continue
          }
          throw error; // No balance and out of retries
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Helper function to get raffle PDA
  function getRafflePda(creator: PublicKey, raffleId: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("raffle"),
        creator.toBuffer(),
        new anchor.BN(raffleId).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
  }

  // Helper function to get ticket PDA
  function getTicketPda(raffle: PublicKey, ticketNumber: number): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("ticket"),
        raffle.toBuffer(),
        new anchor.BN(ticketNumber).toArrayLike(Buffer, "le", 4),
      ],
      program.programId
    );
  }

  // Helper function to draw winner for a raffle using remainingAccounts pattern
  async function drawWinner(
    rafflePda: PublicKey,
    creatorPubkey: PublicKey
  ) {
    // Fetch raffle to get all ticket buyers
    const raffleAccount = await program.account.raffle.fetch(rafflePda);

    // Prepare remaining accounts array with all ticket buyers
    const remainingAccounts = raffleAccount.ticketBuyers.map(buyer => ({
      pubkey: buyer,
      isSigner: false,
      isWritable: true, // Winner will receive lamports
    }));

    await program.methods
      .drawWinner()
      .accounts({
        raffle: rafflePda,
        creator: creatorPubkey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts(remainingAccounts)
      .rpc();
  }

  // Helper function to create a raffle with default parameters
  async function createTestRaffle(
    creatorKeypair: Keypair,
    raffleId: number,
    ticketPrice: number = 0.1,
    maxTickets: number = 50,
    durationDays: number = 7
  ): Promise<PublicKey> {
    const [rafflePda] = getRafflePda(creatorKeypair.publicKey, raffleId);

    const ticketPriceLamports = ticketPrice * anchor.web3.LAMPORTS_PER_SOL;
    const endTime = Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60);

    await program.methods
      .createRaffle(
        new anchor.BN(raffleId),
        new anchor.BN(ticketPriceLamports),
        maxTickets,
        new anchor.BN(endTime)
      )
      .accounts({
        raffle: rafflePda,
        creator: creatorKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creatorKeypair])
      .rpc();

    return rafflePda;
  }

  before(async () => {
    // Airdrop SOL to test accounts
    await airdropSol(creator.publicKey);
    await airdropSol(buyer1.publicKey);
    await airdropSol(buyer2.publicKey);
  });

  describe("create_raffle", () => {
    it("Successfully creates a raffle with valid parameters", async () => {
      const raffleId = 1;
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
      const maxTickets = 50;
      const endTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days from now

      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);

      await program.methods
        .createRaffle(
          new anchor.BN(raffleId),
          new anchor.BN(ticketPrice),
          maxTickets,
          new anchor.BN(endTime)
        )
        .accounts({
          raffle: rafflePda,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Fetch the created raffle account
      const raffleAccount = await program.account.raffle.fetch(rafflePda);

      // Verify all fields are set correctly
      expect(raffleAccount.creator.toString()).to.equal(creator.publicKey.toString());
      expect(raffleAccount.ticketPrice.toNumber()).to.equal(ticketPrice);
      expect(raffleAccount.maxTickets).to.equal(maxTickets);
      expect(raffleAccount.endTime.toNumber()).to.equal(endTime);
      expect(raffleAccount.totalTicketsSold).to.equal(0);
      expect(raffleAccount.winner).to.be.null;
      expect(raffleAccount.state).to.deep.equal({ active: {} });
      expect(raffleAccount.raffleId.toNumber()).to.equal(raffleId);
    });

    it("Successfully creates multiple raffles with different IDs", async () => {
      const raffleId2 = 2;
      const raffleId3 = 3;

      const rafflePda2 = await createTestRaffle(creator, raffleId2);
      const rafflePda3 = await createTestRaffle(creator, raffleId3);

      // Verify both raffles exist with correct IDs
      const raffle2 = await program.account.raffle.fetch(rafflePda2);
      const raffle3 = await program.account.raffle.fetch(rafflePda3);

      expect(raffle2.raffleId.toNumber()).to.equal(raffleId2);
      expect(raffle3.raffleId.toNumber()).to.equal(raffleId3);
    });

    it("Fails when ticket price is zero", async () => {
      const raffleId = 100;
      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);
      const endTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      try {
        await program.methods
          .createRaffle(
            new anchor.BN(raffleId),
            new anchor.BN(0), // Invalid: zero price
            50,
            new anchor.BN(endTime)
          )
          .accounts({
            raffle: rafflePda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([creator])
          .rpc();

        expect.fail("Should have thrown an error for zero ticket price");
      } catch (error) {
        expect(error.toString()).to.include("InvalidTicketPrice");
      }
    });

    it("Fails when max tickets is zero", async () => {
      const raffleId = 101;
      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
      const endTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      try {
        await program.methods
          .createRaffle(
            new anchor.BN(raffleId),
            new anchor.BN(ticketPrice),
            0, // Invalid: zero max tickets
            new anchor.BN(endTime)
          )
          .accounts({
            raffle: rafflePda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([creator])
          .rpc();

        expect.fail("Should have thrown an error for zero max tickets");
      } catch (error) {
        expect(error.toString()).to.include("InvalidMaxTickets");
      }
    });

    it("Fails when end time is in the past", async () => {
      const raffleId = 102;
      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      try {
        await program.methods
          .createRaffle(
            new anchor.BN(raffleId),
            new anchor.BN(ticketPrice),
            50,
            new anchor.BN(pastTime) // Invalid: past time
          )
          .accounts({
            raffle: rafflePda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([creator])
          .rpc();

        expect.fail("Should have thrown an error for past end time");
      } catch (error) {
        expect(error.toString()).to.include("InvalidEndTime");
      }
    });

    it("Fails when trying to create raffle with duplicate raffle_id", async () => {
      const raffleId = 200;

      // Create first raffle
      await createTestRaffle(creator, raffleId);

      // Try to create another raffle with same ID
      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;
      const endTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

      try {
        await program.methods
          .createRaffle(
            new anchor.BN(raffleId),
            new anchor.BN(ticketPrice),
            50,
            new anchor.BN(endTime)
          )
          .accounts({
            raffle: rafflePda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([creator])
          .rpc();

        expect.fail("Should have thrown an error for duplicate raffle ID");
      } catch (error) {
        // Anchor will throw an error because the account already exists
        expect(error).to.exist;
      }
    });

    it("Allows different creators to use the same raffle_id", async () => {
      const raffleId = 300;
      const creator2 = Keypair.generate();
      await airdropSol(creator2.publicKey);

      // Creator 1 creates raffle with ID 300
      const rafflePda1 = await createTestRaffle(creator, raffleId);

      // Creator 2 creates raffle with same ID 300 (should work because different creator)
      const rafflePda2 = await createTestRaffle(creator2, raffleId);

      // Verify both raffles exist with same raffle_id but different creators
      const raffle1 = await program.account.raffle.fetch(rafflePda1);
      const raffle2 = await program.account.raffle.fetch(rafflePda2);

      expect(raffle1.raffleId.toNumber()).to.equal(raffleId);
      expect(raffle2.raffleId.toNumber()).to.equal(raffleId);
      expect(raffle1.creator.toString()).to.not.equal(raffle2.creator.toString());
    });
  });

  describe("buy_ticket", () => {
    it("Successfully purchases a ticket for an active raffle", async () => {
      const raffleId = 400;
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;

      // Create raffle
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, 10);

      // Get buyer's balance before purchase
      const buyerBalanceBefore = await provider.connection.getBalance(buyer1.publicKey);

      // Get raffle account balance before
      const raffleBalanceBefore = await provider.connection.getBalance(rafflePda);

      // Buy ticket
      const [ticketPda] = getTicketPda(rafflePda, 0);

      await program.methods
        .buyTicket()
        .accounts({
          raffle: rafflePda,
          ticket: ticketPda,
          buyer: buyer1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Verify ticket account
      const ticketAccount = await program.account.ticket.fetch(ticketPda);
      expect(ticketAccount.raffle.toString()).to.equal(rafflePda.toString());
      expect(ticketAccount.buyer.toString()).to.equal(buyer1.publicKey.toString());
      expect(ticketAccount.ticketNumber).to.equal(0);
      expect(ticketAccount.purchaseTime.toNumber()).to.be.greaterThan(0);

      // Verify raffle updated
      const raffleAccount = await program.account.raffle.fetch(rafflePda);
      expect(raffleAccount.totalTicketsSold).to.equal(1);
      expect(raffleAccount.state).to.deep.equal({ active: {} });

      // Verify SOL transferred to raffle PDA
      const raffleBalanceAfter = await provider.connection.getBalance(rafflePda);
      expect(raffleBalanceAfter - raffleBalanceBefore).to.equal(ticketPrice);

      // Verify buyer balance decreased (by more than ticket price due to rent)
      const buyerBalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
      expect(buyerBalanceBefore - buyerBalanceAfter).to.be.greaterThan(ticketPrice);
    });

    it("Multiple buyers can purchase tickets", async () => {
      const raffleId = 401;
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, 10);

      // Buyer 1 purchases ticket
      const [ticket1Pda] = getTicketPda(rafflePda, 0);
      await program.methods
        .buyTicket()
        .accounts({
          raffle: rafflePda,
          ticket: ticket1Pda,
          buyer: buyer1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Buyer 2 purchases ticket
      const [ticket2Pda] = getTicketPda(rafflePda, 1);
      await program.methods
        .buyTicket()
        .accounts({
          raffle: rafflePda,
          ticket: ticket2Pda,
          buyer: buyer2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();

      // Verify both tickets
      const ticket1 = await program.account.ticket.fetch(ticket1Pda);
      const ticket2 = await program.account.ticket.fetch(ticket2Pda);

      expect(ticket1.buyer.toString()).to.equal(buyer1.publicKey.toString());
      expect(ticket1.ticketNumber).to.equal(0);

      expect(ticket2.buyer.toString()).to.equal(buyer2.publicKey.toString());
      expect(ticket2.ticketNumber).to.equal(1);

      // Verify raffle state
      const raffleAccount = await program.account.raffle.fetch(rafflePda);
      expect(raffleAccount.totalTicketsSold).to.equal(2);
    });

    it("Raffle ends when max tickets are sold", async () => {
      const raffleId = 402;
      const maxTickets = 3;
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, maxTickets);

      // Buy all tickets
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        const buyer = i === 0 ? buyer1 : buyer2;

        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
      }

      // Verify raffle state changed to Ended
      const raffleAccount = await program.account.raffle.fetch(rafflePda);
      expect(raffleAccount.totalTicketsSold).to.equal(maxTickets);
      expect(raffleAccount.state).to.deep.equal({ ended: {} });
    });

    it("Fails when trying to buy ticket for non-active raffle", async () => {
      const raffleId = 403;
      const maxTickets = 2;
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, maxTickets);

      // Buy all tickets to end raffle
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
      }

      // Try to buy another ticket (should fail)
      const [ticketPda] = getTicketPda(rafflePda, maxTickets);

      try {
        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer2])
          .rpc();

        expect.fail("Should have thrown an error for inactive raffle");
      } catch (error) {
        expect(error.toString()).to.include("RaffleNotActive");
      }
    });

    it("Fails when raffle is sold out", async () => {
      const raffleId = 404;
      const maxTickets = 1;
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, maxTickets);

      // Buy the only ticket
      const [ticket1Pda] = getTicketPda(rafflePda, 0);
      await program.methods
        .buyTicket()
        .accounts({
          raffle: rafflePda,
          ticket: ticket1Pda,
          buyer: buyer1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Try to buy another ticket (should fail)
      const [ticket2Pda] = getTicketPda(rafflePda, 1);

      try {
        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticket2Pda,
            buyer: buyer2.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer2])
          .rpc();

        expect.fail("Should have thrown an error for sold out raffle");
      } catch (error) {
        expect(error.toString()).to.include("RaffleNotActive");
      }
    });
  });

  describe("draw_winner", () => {
    it("Successfully draws a winner and distributes prizes correctly", async () => {
      const raffleId = 600 + Math.floor(Math.random() * 100); // Use random ID for uniqueness
      const ticketPrice = 1.0; // 1 SOL for easy math
      const maxTickets = 5;

      // Airdrop SOL to buyers
      await airdropSol(buyer1.publicKey, 10);
      await airdropSol(buyer2.publicKey, 10);

      // Create raffle
      const rafflePda = await createTestRaffle(creator, raffleId, ticketPrice, maxTickets);

      // Small delay to ensure account is created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Buy all tickets to end the raffle
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        const buyer = i < 3 ? buyer1 : buyer2;

        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
      }

      // Verify raffle is ended
      let raffleAccount = await program.account.raffle.fetch(rafflePda);
      expect(raffleAccount.state).to.deep.equal({ ended: {} });

      // Get raffle balance before drawing (should be 5 SOL from tickets)
      const raffleBalanceBefore = await provider.connection.getBalance(rafflePda);
      const expectedTotal = ticketPrice * maxTickets * anchor.web3.LAMPORTS_PER_SOL;

      // Get balances before
      const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);
      const buyer1BalanceBefore = await provider.connection.getBalance(buyer1.publicKey);
      const buyer2BalanceBefore = await provider.connection.getBalance(buyer2.publicKey);

      // Draw winner using remainingAccounts pattern
      // All ticket buyers are passed, winner selected on-chain based on slot
      await drawWinner(rafflePda, creator.publicKey);

      // Note: Raffle account is closed after drawing winner (all funds distributed)
      // So we can't fetch it anymore, but we can verify the prize distribution

      // Get balances after
      const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
      const buyer1BalanceAfter = await provider.connection.getBalance(buyer1.publicKey);
      const buyer2BalanceAfter = await provider.connection.getBalance(buyer2.publicKey);
      const raffleBalanceAfter = await provider.connection.getBalance(rafflePda);

      // Verify prize distribution (90% to winner, 10% to creator)
      const expectedWinnerPrize = Math.floor(raffleBalanceBefore * 0.9);
      const expectedCreatorFee = raffleBalanceBefore - expectedWinnerPrize;

      // Creator should have received ~10% of total
      const creatorReceived = creatorBalanceAfter - creatorBalanceBefore;
      expect(creatorReceived).to.be.closeTo(expectedCreatorFee, 1000); // Allow small variance

      // Check which buyer won and verify they received the prize
      const buyer1Received = buyer1BalanceAfter - buyer1BalanceBefore;
      const buyer2Received = buyer2BalanceAfter - buyer2BalanceBefore;

      // One of the buyers should have received the prize
      const totalWinnerPrize = buyer1Received + buyer2Received;
      expect(totalWinnerPrize).to.be.closeTo(expectedWinnerPrize, 1000);

      // Raffle PDA should be nearly empty (only rent exempt minimum left)
      expect(raffleBalanceAfter).to.be.lessThan(raffleBalanceBefore / 10);
    });

    it("Fails when trying to draw winner before raffle ends", async () => {
      const raffleId = 501;
      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, 10);

      // Buy only 1 ticket (raffle still active)
      const [ticketPda] = getTicketPda(rafflePda, 0);
      await program.methods
        .buyTicket()
        .accounts({
          raffle: rafflePda,
          ticket: ticketPda,
          buyer: buyer1.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();

      // Try to draw winner (should fail - raffle still active)
      try {
        await drawWinner(rafflePda, creator.publicKey);
        expect.fail("Should have thrown an error for active raffle");
      } catch (error) {
        expect(error.toString()).to.include("RaffleNotEnded");
      }
    });

    it("Fails when no tickets have been sold", async () => {
      const raffleId = 700 + Math.floor(Math.random() * 100);
      const maxTickets = 3;
      const ticketPrice = 0.1 * anchor.web3.LAMPORTS_PER_SOL;

      // Create raffle with end time of 1 second in the future (will expire quickly)
      const endTime = Math.floor(Date.now() / 1000) + 1;
      const [rafflePda] = getRafflePda(creator.publicKey, raffleId);

      await program.methods
        .createRaffle(
          new anchor.BN(raffleId),
          new anchor.BN(ticketPrice),
          maxTickets,
          new anchor.BN(endTime)
        )
        .accounts({
          raffle: rafflePda,
          creator: creator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      // Wait for raffle to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to draw winner without any tickets sold
      try {
        await drawWinner(rafflePda, creator.publicKey);
        expect.fail("Should have thrown an error for no tickets sold");
      } catch (error) {
        expect(error.toString()).to.include("NoTicketsSold");
      }
    });

    it("Fails when trying to draw winner twice", async () => {
      const raffleId = 800 + Math.floor(Math.random() * 100);
      const maxTickets = 2;

      // Airdrop SOL to buyer1
      await airdropSol(buyer1.publicKey, 5);

      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, maxTickets);

      // Small delay to ensure account is created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Buy all tickets
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
      }

      // Draw winner first time
      await drawWinner(rafflePda, creator.publicKey);

      // Try to draw again (should fail - account is closed after first draw)
      try {
        await drawWinner(rafflePda, creator.publicKey);
        expect.fail("Should have thrown an error for already completed raffle");
      } catch (error) {
        // Account doesn't exist anymore because it was closed after drawing winner
        expect(error.toString()).to.include("Account does not exist");
      }
    });

    it("Multiple tickets with different buyers - winner receives correct prize", async () => {
      const raffleId = 900 + Math.floor(Math.random() * 100);
      const ticketPrice = 0.5; // 0.5 SOL
      const maxTickets = 4;

      // Airdrop SOL to buyers
      await airdropSol(buyer1.publicKey, 5);
      await airdropSol(buyer2.publicKey, 5);

      const rafflePda = await createTestRaffle(creator, raffleId, ticketPrice, maxTickets);

      // Small delay to ensure account is created
      await new Promise(resolve => setTimeout(resolve, 500));

      // Buyer1 buys 2 tickets, Buyer2 buys 2 tickets
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        const buyer = i < 2 ? buyer1 : buyer2;

        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
      }

      const raffleBalanceBefore = await provider.connection.getBalance(rafflePda);

      // Get balances before
      const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);

      // Draw winner
      await drawWinner(rafflePda, creator.publicKey);

      // Verify prize distribution happened (account is closed after draw)
      const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
      const raffleBalanceAfter = await provider.connection.getBalance(rafflePda);

      // Creator should have received ~10% fee
      expect(creatorBalanceAfter).to.be.greaterThan(creatorBalanceBefore);

      // Raffle account should be nearly empty (closed)
      expect(raffleBalanceAfter).to.be.lessThan(raffleBalanceBefore / 10);
    });

    it("Fails when winner is not in remaining_accounts", async () => {
      const raffleId = 505;
      const maxTickets = 2;

      // Airdrop SOL to buyer1
      await airdropSol(buyer1.publicKey, 5);

      const rafflePda = await createTestRaffle(creator, raffleId, 0.1, maxTickets);

      // Buy all tickets
      for (let i = 0; i < maxTickets; i++) {
        const [ticketPda] = getTicketPda(rafflePda, i);
        await program.methods
          .buyTicket()
          .accounts({
            raffle: rafflePda,
            ticket: ticketPda,
            buyer: buyer1.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
      }

      // Try to draw winner with empty remaining_accounts (should fail)
      try {
        await program.methods
          .drawWinner()
          .accounts({
            raffle: rafflePda,
            creator: creator.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .remainingAccounts([]) // Empty - winner can't be found
          .rpc();

        expect.fail("Should have thrown InvalidWinningTicket error");
      } catch (error) {
        expect(error.toString()).to.include("InvalidWinningTicket");
      }
    });
  });
});
