import { validateSpeechServiceAddress } from "@t3tools/shared/speechServiceAddress";

const MAX_ACK_BYTES = 4_096;

/** Reads at most MAX_ACK_BYTES; a longer or absent body yields null without buffering the rest. */
async function readAcknowledgement(response: Response): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_ACK_BYTES || response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ACK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The existing speaker queue accepts text and handles voices, scrubbing and playback. */
export async function postReplySpeech(
  address: string,
  payload: { text: string; source: string; session: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const url = validateSpeechServiceAddress(address);
  if (typeof url === "string") throw new Error(url);
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("The speech service could not accept this reply.");
  const raw = await readAcknowledgement(response);
  if (raw === null || raw.length === 0) {
    throw new Error("The speech service answered with an unexpected response.");
  }
  const result: unknown = JSON.parse(raw);
  if (
    typeof result !== "object" ||
    result === null ||
    !("queued" in result) ||
    result.queued !== true
  ) {
    throw new Error(
      "The speech service did not queue the reply. Check that speech is enabled there.",
    );
  }
}
