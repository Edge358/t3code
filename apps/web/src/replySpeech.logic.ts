import type { OrchestrationV2ThreadProjection, RunId } from "@t3tools/contracts";

/** A finished main message is speakable before the run finishes its remaining work. */
export function completedReplyMessages(projection: OrchestrationV2ThreadProjection, runId: RunId) {
  const run = projection.runs.find((candidate) => candidate.id === runId);
  if (!run || !["running", "waiting", "completed"].includes(run.status)) return [];
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
  const driver = projection.providerThreads.find(
    (thread) => thread.id === run.providerThreadId,
  )?.driver;
  const source = driver === "codex" ? "codex" : driver === "claudeAgent" ? "claude" : "t3code";
  return messages.flatMap((message) => {
    const text = message.text.trim();
    return text ? [{ id: message.id, text, source } as const] : [];
  });
}

export function createReplySpeechGate(skipExisting: boolean) {
  const handled = new Set<string>();
  return {
    observe(projection: OrchestrationV2ThreadProjection, runId: RunId, enabled = true) {
      const messages = completedReplyMessages(projection, runId);
      const fresh = messages.filter((message) => !handled.has(message.id));
      for (const message of fresh) handled.add(message.id);
      const result = skipExisting || !enabled ? [] : fresh;
      skipExisting = false;
      return result;
    },
  };
}
