import {
  address,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  devnet,
  getBase58Encoder,
  getSignatureFromTransaction,
  isSolanaError,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type KeyPairSigner,
  type Rpc,
  type GetSignatureStatusesApi,
  type Signature,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  SOLANA_ERROR__TRANSACTION_ERROR__INVALID_ACCOUNT_FOR_FEE,
} from "@solana/kit";

export const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_TIMEOUT_MS = 15_000;
const POLL_MS = 500;

/** A failure with a message safe to show the app, never a stack, never key material. */
export class ReceiptUnavailable extends Error {}

// An unfunded fee payer shows up under one of these. Devnet answered InvalidAccountForFee for the real unfunded key.
const CANNOT_PAY_FEE = [
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  SOLANA_ERROR__TRANSACTION_ERROR__INVALID_ACCOUNT_FOR_FEE,
] as const;

function explain(error: unknown): string {
  if (
    isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE) &&
    CANNOT_PAY_FEE.some((code) => isSolanaError(error.cause, code))
  ) {
    return "the receipt wallet cannot pay the network fee, so it needs devnet SOL";
  }
  const messages: string[] = [];
  for (let e = error; e instanceof Error; e = e.cause) messages.push(e.message);
  return messages.join(": ") || "unknown error";
}

async function loadSigner(): Promise<KeyPairSigner> {
  const raw = process.env.SOLANA_RECEIPT_KEY?.trim();
  if (!raw) throw new ReceiptUnavailable("Receipts are not set up on this server.");
  try {
    const secret = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : getBase58Encoder().encode(raw);
    if (secret.length !== 64) throw new Error("wrong length");
    return await createKeyPairSignerFromBytes(secret);
  } catch {
    // The parser's own error text can quote its input, so none of it is kept.
    throw new ReceiptUnavailable("The receipt key on this server is not valid.");
  }
}

async function untilConfirmed(rpc: Rpc<GetSignatureStatusesApi>, signature: Signature, abortSignal: AbortSignal) {
  for (;;) {
    abortSignal.throwIfAborted();
    const { value } = await rpc.getSignatureStatuses([signature]).send({ abortSignal });
    const status = value[0];
    if (status?.err) throw new ReceiptUnavailable("The network rejected the receipt.");
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Writes `memo` to the Memo program in one transaction, paid and signed by the app's key. Resolves with the signature once confirmed. */
export async function sendMemo(memo: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const abortSignal = AbortSignal.timeout(timeoutMs);
  try {
    const signer = await loadSigner();
    const rpc = createSolanaRpc(devnet(process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL));
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send({ abortSignal });
    const transaction = await signTransactionMessageWithSigners(
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(signer, m),
        (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        (m) => appendTransactionMessageInstruction({ programAddress: MEMO_PROGRAM, data: new TextEncoder().encode(memo) }, m),
      ),
    );
    await sendTransactionWithoutConfirmingFactory({ rpc })(transaction, { commitment: "confirmed", abortSignal });
    const signature = getSignatureFromTransaction(transaction);
    await untilConfirmed(rpc, signature, abortSignal);
    return signature;
  } catch (error) {
    if (error instanceof ReceiptUnavailable) throw error;
    const detail = abortSignal.aborted ? "the network took too long" : explain(error);
    throw new ReceiptUnavailable(`Could not write the receipt: ${detail}.`, { cause: error });
  }
}
