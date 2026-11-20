import {
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Decoder,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  verifySignature,
} from "@solana/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MEMO_PROGRAM, ReceiptUnavailable, sendMemo } from "@/domains/receipts/send";

const MEMO = '{"app":"cushion","v":1,"id":"8c1f2b3a-5d4e-4f60-9a7b-1c2d3e4f5a6b"}';
const BLOCKHASH = getBase58Decoder().decode(new Uint8Array(32).fill(7));

async function newKey() {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", signer.keyPair.publicKey));
  return { signer, secret: new Uint8Array([...seed, ...publicKey]) };
}

interface FakeChain {
  /** Wire transactions the node was asked to send, base64. */
  sent: string[];
  urls: string[];
  /** Answer for each getSignatureStatuses call. */
  status: (call: number) => unknown;
  sendError?: { code: number; message: string; data?: unknown };
}

function stubChain(chain: Partial<FakeChain> = {}) {
  const state: FakeChain = { sent: [], urls: [], status: () => ({ slot: 1, confirmations: 0, err: null, confirmationStatus: "confirmed" }), ...chain };
  let statusCalls = 0;
  const reply = (id: number, body: object) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id, ...body }), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      state.urls.push(url);
      const { id, method, params } = JSON.parse(init.body as string);
      if (method === "getLatestBlockhash") {
        return reply(id, { result: { context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100 } } });
      }
      if (method === "sendTransaction") {
        if (state.sendError) return reply(id, { error: state.sendError });
        state.sent.push(params[0]);
        const tx = getTransactionDecoder().decode(getBase64Encoder().encode(params[0]));
        return reply(id, { result: getSignatureFromTransaction(tx) });
      }
      if (method === "getSignatureStatuses") return reply(id, { result: { context: { slot: 1 }, value: [state.status(statusCalls++)] } });
      throw new Error(`unexpected rpc method ${method}`);
    }),
  );
  return state;
}

beforeEach(() => vi.stubEnv("SOLANA_RPC_URL", "http://rpc.test"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendMemo", () => {
  it.each([
    ["a base58 secret key", (secret: Uint8Array) => getBase58Decoder().decode(secret)],
    ["a JSON array of 64 bytes", (secret: Uint8Array) => JSON.stringify([...secret])],
  ])("sends one signed Memo transaction from %s and returns its signature", async (_name, encode) => {
    const { signer, secret } = await newKey();
    vi.stubEnv("SOLANA_RECEIPT_KEY", encode(secret));
    const chain = stubChain({ status: (call) => (call === 0 ? null : { slot: 2, confirmations: 1, err: null, confirmationStatus: "confirmed" }) });

    const signature = await sendMemo(MEMO);

    expect(chain.sent).toHaveLength(1);
    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(chain.sent[0]));
    expect(signature).toBe(getSignatureFromTransaction(transaction));

    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (message.version === 1) throw new Error("expected a version 0 message");
    expect(message.staticAccounts[0]).toBe(signer.address);
    expect(message.header.numSignerAccounts).toBe(1);
    expect(message.lifetimeToken).toBe(BLOCKHASH);
    expect(message.instructions).toHaveLength(1);
    const [instruction] = message.instructions;
    expect(message.staticAccounts[instruction.programAddressIndex]).toBe(MEMO_PROGRAM);
    expect(new TextDecoder().decode(instruction.data)).toBe(MEMO);

    const signed = transaction.signatures[signer.address];
    expect(signed && (await verifySignature(signer.keyPair.publicKey, signed, transaction.messageBytes))).toBe(true);
  });

  it("uses SOLANA_RPC_URL, and devnet when it is not set", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    const chain = stubChain();
    await sendMemo(MEMO);
    expect(new Set(chain.urls)).toEqual(new Set(["http://rpc.test"]));

    vi.stubEnv("SOLANA_RPC_URL", "");
    const devnet = stubChain();
    await sendMemo(MEMO);
    expect(new Set(devnet.urls)).toEqual(new Set(["https://api.devnet.solana.com"]));
  });

  it("says receipts are not set up when there is no key, without touching the network", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", "");
    const chain = stubChain();
    await expect(sendMemo(MEMO)).rejects.toThrow(new ReceiptUnavailable("Receipts are not set up on this server."));
    expect(chain.urls).toEqual([]);
  });

  it.each(["not-a-key", "[1,2,3]", "{", `[${Array(64).fill(1)}]`])("rejects the bad key %s without quoting it", async (key) => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", key);
    stubChain();
    const error = await sendMemo(MEMO).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ReceiptUnavailable);
    expect((error as Error).message).toBe("The receipt key on this server is not valid.");
    expect((error as Error).cause).toBeUndefined();
  });

  it.each([
    ["AccountNotFound", "Could not write the receipt: the receipt wallet cannot pay the network fee, so it needs devnet SOL."],
    ["InvalidAccountForFee", "Could not write the receipt: the receipt wallet cannot pay the network fee, so it needs devnet SOL."],
    ["BlockhashNotFound", "Could not write the receipt: Transaction simulation failed: Blockhash not found."],
  ])("turns the node's %s rejection into a plain failure", async (err, message) => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    stubChain({ sendError: { code: -32002, message: `Transaction simulation failed: ${err}`, data: { err, logs: [] } } });
    await expect(sendMemo(MEMO)).rejects.toThrow(new ReceiptUnavailable(message));
  });

  it("turns an unreachable node into a plain failure", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED") })));
    await expect(sendMemo(MEMO)).rejects.toThrow(/^Could not write the receipt: .*fetch failed.*\.$/);
  });

  it("fails when the transaction lands with an error", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    stubChain({ status: () => ({ slot: 1, confirmations: 0, err: { InstructionError: [0, "Custom"] }, confirmationStatus: "confirmed" }) });
    await expect(sendMemo(MEMO)).rejects.toThrow("The network rejected the receipt.");
  });

  it("gives up when the network never confirms", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    stubChain({ status: () => null });
    await expect(sendMemo(MEMO, 300)).rejects.toThrow("the network took too long");
  });

  it("gives up when the node hangs", async () => {
    vi.stubEnv("SOLANA_RECEIPT_KEY", getBase58Decoder().decode((await newKey()).secret));
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    await expect(sendMemo(MEMO, 100)).rejects.toThrow("the network took too long");
  });
});
