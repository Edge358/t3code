/** The existing speaker queue accepts text and handles voices, scrubbing and playback. */
export async function postReplySpeech(
  address: string,
  payload: { text: string; source: string; session: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const url = new URL(address);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error("Use an HTTP or HTTPS speech service address without credentials.");
  }
  const response = await fetcher(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("The speech service could not accept this reply.");
  const result: unknown = await response.json();
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
