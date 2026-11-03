import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadState } from "@t3tools/client-runtime/state/threads";
import type {
  EnvironmentId,
  OrchestrationV2ThreadShell,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";
import { getClientSettings } from "./hooks/useSettings";
import { createReplySpeechGate } from "./replySpeech.logic";
import { environmentThreadDetails } from "./state/threads";

interface WatchedRun {
  readonly gate: ReturnType<typeof createReplySpeechGate>;
  finished: boolean;
  quiet: boolean;
}
interface WatchedReply {
  readonly runs: Map<RunId, WatchedRun>;
  stop: (() => void) | null;
  shell: OrchestrationV2ThreadShell;
  refresh: () => void;
}

/** Shares existing detail streams while work runs, including the last message after shell completion. */
export function createReplySpeechObserver(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  onError: () => void,
  isAllowed: (threadId: ThreadId) => boolean = () => true,
) {
  const watched = new Map<ThreadId, WatchedReply>();
  const knownThreads = new Set<ThreadId>();
  let address: string | null = null;
  let delivery = Promise.resolve();
  let baseline = true;
  const clear = () => {
    for (const entry of watched.values()) entry.stop?.();
    watched.clear();
    knownThreads.clear();
  };
  const enabled = (
    threadId: ThreadId,
    entry: WatchedReply,
    run: WatchedRun,
    destination: string,
  ) => {
    const settings = getClientSettings();
    return (
      watched.get(threadId) === entry &&
      settings.readRepliesAloud &&
      settings.speechServiceAddress === destination &&
      !run.quiet &&
      entry.shell.archivedAt === null &&
      isAllowed(threadId)
    );
  };
  return {
    sync(threads: ReadonlyArray<OrchestrationV2ThreadShell>) {
      const settings = getClientSettings();
      const destination =
        settings.readRepliesAloud && window.desktopBridge?.speakReply
          ? settings.speechServiceAddress || null
          : null;
      if (destination !== address) {
        clear();
        address = destination;
        baseline = true;
      }
      if (destination === null) return;
      const retained = new Set(threads.map((thread) => thread.id));
      for (const [id, entry] of watched) {
        if (retained.has(id)) continue;
        entry.stop?.();
        watched.delete(id);
      }
      for (const shell of threads) {
        const prior = watched.get(shell.id);
        const skipExisting = !prior && (baseline || knownThreads.has(shell.id));
        const entry = prior ?? {
          runs: new Map<RunId, WatchedRun>(),
          shell,
          stop: null,
          refresh: () => {},
        };
        entry.shell = shell;
        watched.set(shell.id, entry);
        knownThreads.add(shell.id);
        // A queued follow-up can become latestRunId while its predecessor is still speaking.
        let changed = false;
        for (const runId of [shell.activeRunId, shell.latestRunId]) {
          if (!runId || entry.runs.has(runId)) continue;
          entry.runs.set(runId, {
            gate: createReplySpeechGate(skipExisting),
            finished:
              !prior &&
              !shell.activeRunId &&
              !["queued", "preparing", "starting", "running", "waiting"].includes(shell.status),
            quiet: false,
          });
          changed = true;
        }
        if (shell.latestRunStopRequested && shell.latestRunId) {
          const run = entry.runs.get(shell.latestRunId);
          if (run && !run.quiet) {
            run.quiet = true;
            changed = true;
          }
        }
        if (entry.stop) {
          if (changed) entry.refresh();
          continue;
        }
        if (shell.archivedAt !== null || [...entry.runs.values()].every((run) => run.finished))
          continue;
        let finished = false;
        const atom = environmentThreadDetails.stateAtom(scopeThreadRef(environmentId, shell.id));
        const observe = (state: EnvironmentThreadState) => {
          if (state.status !== "live" || Option.isNone(state.data)) return;
          const projection = state.data.value;
          for (const [runId, tracked] of entry.runs) {
            if (tracked.finished) continue;
            const run = projection.runs.find((candidate) => candidate.id === runId);
            if (!run) continue;
            if (["failed", "interrupted", "cancelled", "rolled_back"].includes(run.status))
              tracked.quiet = true;
            for (const message of tracked.gate.observe(
              projection,
              runId,
              enabled(shell.id, entry, tracked, destination),
            )) {
              // Serialize acknowledgements, not playback, to preserve queue order.
              delivery = delivery
                .then(async () => {
                  if (!enabled(shell.id, entry, tracked, destination)) return;
                  await window.desktopBridge?.speakReply?.({
                    text: message.text,
                    source: message.source,
                    session: `t3code:${environmentId}:${shell.id}:${runId}:${message.id}`,
                  });
                })
                .catch(onError);
            }
            tracked.finished = run.status === "completed" || tracked.quiet;
          }
          if ([...entry.runs.values()].every((run) => run.finished)) {
            finished = true;
            entry.stop?.();
            entry.stop = null;
          }
        };
        entry.refresh = () => observe(registry.get(atom));
        const stop = registry.subscribe(atom, observe, { immediate: true });
        if (finished) stop();
        else entry.stop = stop;
      }
      baseline = false;
    },
    whenIdle: () => delivery,
    dispose: clear,
  };
}
