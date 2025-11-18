const anchor = require("@coral-xyz/anchor");
const { Keypair, Connection, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");

async function transfer() {
  // Generate keypairs with same seed
  const buyer1 = Keypair.fromSeed(new Uint8Array(32).fill(2));
  const buyer2 = Keypair.fromSeed(new Uint8Array(32).fill(3));

  console.log("From (buyer1):", buyer1.publicKey.toString());
  console.log("To (buyer2):", buyer2.publicKey.toString());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Check balance before
  const balanceBefore = await connection.getBalance(buyer1.publicKey);
  console.log("Buyer1 balance before:", balanceBefore / LAMPORTS_PER_SOL, "SOL");

  // Create transfer instruction
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: buyer1.publicKey,
    toPubkey: buyer2.publicKey,
    lamports: 1 * LAMPORTS_PER_SOL,
  });

  const transaction = new Transaction().add(transferInstruction);

  console.log("\nSending 1 SOL...");
  const signature = await sendAndConfirmTransaction(connection, transaction, [buyer1]);

  console.log("✅ Transfer successful!");
  console.log("Signature:", signature);

  // Check balances after
  const buyer1BalanceAfter = await connection.getBalance(buyer1.publicKey);
  const buyer2BalanceAfter = await connection.getBalance(buyer2.publicKey);

  console.log("\nBalances after:");
  console.log("Buyer1:", buyer1BalanceAfter / LAMPORTS_PER_SOL, "SOL");
  console.log("Buyer2:", buyer2BalanceAfter / LAMPORTS_PER_SOL, "SOL");
}

transfer().catch(console.error);
