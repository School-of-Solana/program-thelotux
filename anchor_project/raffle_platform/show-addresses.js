const anchor = require("@coral-xyz/anchor");
const { Keypair } = require("@solana/web3.js");

// Generate keypairs with same seed for consistency
const creator = Keypair.fromSeed(new Uint8Array(32).fill(1));
const buyer1 = Keypair.fromSeed(new Uint8Array(32).fill(2));
const buyer2 = Keypair.fromSeed(new Uint8Array(32).fill(3));

console.log("\n=== Test Account Addresses (Devnet) ===\n");
console.log("Creator:", creator.publicKey.toString());
console.log("Buyer 1:", buyer1.publicKey.toString());
console.log("Buyer 2:", buyer2.publicKey.toString());
console.log("\n=== Airdrop Commands ===\n");
console.log("solana airdrop 2", creator.publicKey.toString(), "--url devnet");
console.log("solana airdrop 2", buyer1.publicKey.toString(), "--url devnet");
console.log("solana airdrop 2", buyer2.publicKey.toString(), "--url devnet");
console.log("\n");
