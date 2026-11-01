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
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { environmentThreadDetails } from "./state/threads";

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
  isOpen: boolean,
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
  // The open thread already holds its live projection. Reading the atom for any other thread
  // would start a throwaway subscription, so those go straight to the fetch.
  const loaded = isOpen
    ? registry.get(environmentThreadDetails.threadAtom(scopeThreadRef(environmentId, thread.id)))
    : null;
  let reply = loaded === null ? null : completedReply(loaded.projection, thread.latestRunId);
  if (reply === null) {
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
    if (result._tag === "Failure")
      throw new Error("Could not read the completed reply for speech.");
    reply = completedReply(result.value, thread.latestRunId);
  }
  if (
    !stillCurrent() ||
    !getClientSettings().readRepliesAloud ||
    getClientSettings().speechServiceAddress !== settings.speechServiceAddress
  )
    return;
  if (!reply) return;
  await window.desktopBridge.speakReply({
    ...reply,
    session: `t3code:${environmentId}:${thread.id}:${thread.latestRunId}`,
  });
}
