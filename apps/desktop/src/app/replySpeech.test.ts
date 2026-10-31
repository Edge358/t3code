import { describe, expect, it, vi } from "vite-plus/test";
import { postReplySpeech } from "./replySpeech.ts";

const payload = { text: "A completed reply", source: "codex", session: "test-run" };
describe("speaker queue delivery", () => {
  it("posts to the explicit address, without following redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ queued: true }));
    await postReplySpeech("http://127.0.0.1:8011/say", payload, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("http://127.0.0.1:8011/say");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      body: JSON.stringify(payload),
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(["", "file:///tmp/voice", "http://user:secret@localhost/say"])(
    "rejects invalid address %s without contacting anything",
    async (address) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(postReplySpeech(address, payload, fetcher)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("reports a queue refusal and does not retry", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ queued: false, reason: "auto-speak off" }));
    await expect(postReplySpeech("http://127.0.0.1:8011/say", payload, fetcher)).rejects.toThrow(
      "did not queue",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not retry an uncertain network result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection lost"));
    await expect(postReplySpeech("http://127.0.0.1:8011/say", payload, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
