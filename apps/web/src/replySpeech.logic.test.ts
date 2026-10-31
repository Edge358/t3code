import { describe, expect, it } from "vite-plus/test";
import { RunId, type OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { completedReply } from "./replySpeech.logic";

const runId = RunId.make("run-new");
function fixture(driver: string) {
  return {
    runs: [{ id: runId, status: "completed", rootNodeId: "root", providerThreadId: "native" }],
    nodes: [{ id: "reply-node", kind: "assistant_message", parentNodeId: "root", runId }],
    providerThreads: [{ id: "native", driver }],
    messages: [
      { runId: "old", nodeId: "root", role: "assistant", text: "old history" },
      { runId, nodeId: "root", role: "user", text: "user prompt" },
      { runId, nodeId: "child", role: "assistant", text: "child agent" },
      { runId, nodeId: "root", role: "assistant", text: "unfinished", streaming: true },
      { runId, nodeId: "reply-node", role: "assistant", text: "Current reply", streaming: false },
    ],
  } as unknown as OrchestrationV2ThreadProjection;
}
describe("completed reply selection", () => {
  it.each(["codex", "claude"])("selects only the main completed reply for %s", (driver) => {
    expect(completedReply(fixture(driver === "claude" ? "claudeAgent" : driver), runId)).toEqual({
      text: "Current reply",
      source: driver,
    });
  });
  it("does not read a stopped or failed run", () => {
    const projection = fixture("codex");
    expect(
      completedReply(
        { ...projection, runs: projection.runs.map((run) => ({ ...run, status: "failed" })) },
        runId,
      ),
    ).toBeNull();
  });
  it("does not fall back to an older answer when the new run has none", () => {
    const projection = fixture("claude");
    expect(
      completedReply({ ...projection, messages: projection.messages.slice(0, 4) }, runId),
    ).toBeNull();
  });
});
