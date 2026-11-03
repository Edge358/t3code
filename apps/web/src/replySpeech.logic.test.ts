import { describe, expect, it } from "vite-plus/test";
import { MessageId, RunId, type OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import {
  completedReplyMessages as completedReply,
  createReplySpeechGate,
} from "./replySpeech.logic";

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
      {
        id: "update",
        runId,
        nodeId: "reply-node",
        role: "assistant",
        text: "Current reply",
        streaming: false,
      },
    ],
  } as unknown as OrchestrationV2ThreadProjection;
}
describe("completed reply selection", () => {
  it("delivers a finished update while the run is still working", () => {
    const projection = fixture("codex");
    expect(
      completedReply(
        { ...projection, runs: projection.runs.map((run) => ({ ...run, status: "running" })) },
        runId,
      ),
    ).toEqual([{ id: "update", text: "Current reply", source: "codex" }]);
  });
  it("keeps progress and the final answer as separate speech items", () => {
    const projection = fixture("codex");
    expect(
      completedReply(
        {
          ...projection,
          messages: [
            { ...projection.messages[4]!, id: MessageId.make("update"), text: "Progress update" },
            { ...projection.messages[4]!, id: MessageId.make("final"), text: "Final answer" },
          ],
        },
        runId,
      ),
    ).toEqual([
      { id: "update", text: "Progress update", source: "codex" },
      { id: "final", text: "Final answer", source: "codex" },
    ]);
  });
  it.each(["codex", "claude"])("selects only the main completed reply for %s", (driver) => {
    expect(completedReply(fixture(driver === "claude" ? "claudeAgent" : driver), runId)).toEqual([
      {
        id: "update",
        text: "Current reply",
        source: driver,
      },
    ]);
  });
  it("does not read a stopped or failed run", () => {
    const projection = fixture("codex");
    expect(
      completedReply(
        { ...projection, runs: projection.runs.map((run) => ({ ...run, status: "failed" })) },
        runId,
      ),
    ).toEqual([]);
  });
  it("does not fall back to an older answer when the new run has none", () => {
    const projection = fixture("claude");
    expect(
      completedReply({ ...projection, messages: projection.messages.slice(0, 4) }, runId),
    ).toEqual([]);
  });
  it("does not replay a message after completion, reconnection or a text correction", () => {
    const gate = createReplySpeechGate(false);
    const projection = fixture("codex");
    expect(gate.observe(projection, runId)).toHaveLength(1);
    expect(gate.observe(projection, runId)).toEqual([]);
    expect(
      gate.observe(
        { ...projection, messages: projection.messages.map((m) => ({ ...m, text: "corrected" })) },
        runId,
      ),
    ).toEqual([]);
  });
  it("skips startup history but speaks a message that finishes afterward", () => {
    const gate = createReplySpeechGate(true);
    const projection = fixture("claudeAgent");
    expect(gate.observe(projection, runId)).toEqual([]);
    const final = { ...projection.messages[4]!, id: MessageId.make("final"), text: "Final answer" };
    expect(
      gate.observe(
        {
          ...projection,
          messages: [...projection.messages, final],
        },
        runId,
      ),
    ).toEqual([{ id: "final", text: "Final answer", source: "claude" }]);
    expect(gate.observe(projection, runId)).toEqual([]);
  });
  it("does not replay deliberately muted messages", () => {
    const gate = createReplySpeechGate(false);
    const projection = fixture("codex");
    expect(gate.observe(projection, runId, false)).toEqual([]);
    expect(gate.observe(projection, runId, true)).toEqual([]);
  });
});
