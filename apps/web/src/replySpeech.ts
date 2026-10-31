import {
  ORCHESTRATION_V2_WS_METHODS,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcQueryAtomFamily,
  executeAtomQuery,
} from "@t3tools/client-runtime/state/runtime";
import type { AtomRegistry } from "effect/reactivity";
import { connectionAtomRuntime } from "./connection/runtime";
import { getClientSettings } from "./hooks/useSettings";
import { completedReply } from "./replySpeech.logic";

const projectionForSpeech = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "reply-speech:completed-reply",
  tag: ORCHESTRATION_V2_WS_METHODS.getThreadProjection,
  idleTtlMs: 0,
  staleTimeMs: 0,
});

export async function speakCompletedReply(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  thread: OrchestrationV2ThreadShell,
  stillCurrent: () => boolean,
) {
  const settings = getClientSettings();
  if (
    !settings.readRepliesAloud ||
    !settings.speechServiceAddress ||
    !window.desktopBridge?.speakReply ||
    !thread.latestRunId
  )
    return;
  const result = await executeAtomQuery(
    registry,
    projectionForSpeech({ environmentId, input: { threadId: thread.id } }),
    {
      refresh: true,
      reportFailure: false,
      reportDefect: false,
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (
    !stillCurrent() ||
    !getClientSettings().readRepliesAloud ||
    getClientSettings().speechServiceAddress !== settings.speechServiceAddress
  )
    return;
  if (result._tag === "Failure") throw new Error("Could not read the completed reply for speech.");
  const reply = completedReply(result.value, thread.latestRunId);
  if (!reply) return;
  await window.desktopBridge.speakReply({
    ...reply,
    session: `t3code:${environmentId}:${thread.id}:${thread.latestRunId}`,
  });
}
