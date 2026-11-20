// Creates the Solana key that signs Cushion receipts and appends it to .env.local, or funds the one already there.
//   node scripts/make-receipt-key.mjs           create the key (never overwrites) and print its public address
//   node scripts/make-receipt-key.mjs --fund    also ask the devnet faucet for 1 SOL and print the balance
import { generateKeyPairSync } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { address, createSolanaRpc, devnet, getBase58Decoder, getBase58Encoder, lamports } from "@solana/kit";

const envFile = new URL("../.env.local", import.meta.url);
const name = "SOLANA_RECEIPT_KEY";
const base58 = getBase58Decoder();
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const existing = (existsSync(envFile) ? readFileSync(envFile, "utf8") : "").match(new RegExp(`^${name}=(.*)$`, "m"));
let secret;
if (existing) {
  const raw = existing[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!raw) fail(`.env.local has an empty ${name} line. Delete that line and run this again.`);
  secret = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : getBase58Encoder().encode(raw);
  if (secret.length !== 64) fail(`${name} in .env.local is not a 64-byte secret key. Fix or delete it.`);
  console.log(`${name} is already set in .env.local. Left unchanged.`);
} else {
  const { d, x } = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" });
  secret = Buffer.concat([Buffer.from(d, "base64url"), Buffer.from(x, "base64url")]);
  const prefix = existsSync(envFile) && !readFileSync(envFile, "utf8").endsWith("\n") ? "\n" : "";
  appendFileSync(envFile, `${prefix}${name}=${base58.decode(secret)}\n`, { mode: 0o600 });
  console.log(`Wrote ${name} to .env.local. Restart the dev server if it is running.`);
}

const publicAddress = address(base58.decode(secret.subarray(32)));
console.log(`Public address: ${publicAddress}`);

if (process.argv.includes("--fund")) {
  const rpc = createSolanaRpc(devnet(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com"));
  try {
    await rpc.requestAirdrop(publicAddress, lamports(1_000_000_000n), { commitment: "confirmed" }).send();
    let balance = 0n;
    for (let tries = 0; tries < 30 && balance === 0n; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      balance = (await rpc.getBalance(publicAddress, { commitment: "confirmed" }).send()).value;
    }
    console.log(`Balance: ${Number(balance) / 1e9} SOL${balance === 0n ? " (the airdrop has not landed yet, check again soon)" : ""}`);
  } catch (error) {
    fail(`Airdrop failed: ${error.message}\nThe public faucet limits requests. Send devnet SOL to ${publicAddress} at https://faucet.solana.com instead.`);
  }
}
