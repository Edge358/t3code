import type { OrchestrationV2ThreadProjection, RunId } from "@t3tools/contracts";

/** Select only this completed run's main reply, never history, tools or child-agent messages. */
export function completedReply(projection: OrchestrationV2ThreadProjection, runId: RunId) {
  const run = projection.runs.find((candidate) => candidate.id === runId);
  if (!run || run.status !== "completed") return null;
  const replyNodes = new Set(
    projection.nodes
      .filter(
        (node) =>
          node.runId === runId &&
          node.kind === "assistant_message" &&
          node.parentNodeId === run.rootNodeId,
      )
      .map((node) => node.id),
  );
  const messages = projection.messages.filter(
    (message) =>
      message.runId === runId &&
      message.role === "assistant" &&
      !message.streaming &&
      (message.nodeId === null ||
        message.nodeId === run.rootNodeId ||
        replyNodes.has(message.nodeId)) &&
      !message.notification,
  );
  const text = messages
    .map((message) => message.text.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) return null;
  const driver = projection.providerThreads.find(
    (thread) => thread.id === run.providerThreadId,
  )?.driver;
  const source = driver === "codex" ? "codex" : driver === "claudeAgent" ? "claude" : "t3code";
  return { text, source } as const;
}
