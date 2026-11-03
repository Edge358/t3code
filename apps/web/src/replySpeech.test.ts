import {
  EnvironmentId,
  RunId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import {
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), stateAtom: vi.fn() }));
vi.mock("./hooks/useSettings", () => ({ getClientSettings: mocks.settings }));
vi.mock("./state/threads", () => ({ environmentThreadDetails: { stateAtom: mocks.stateAtom } }));
import { createReplySpeechObserver } from "./replySpeech";

const environmentId = EnvironmentId.make("local");
const runId = RunId.make("run");
const threadId = ThreadId.make("thread");
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}) {
  return {
    id: threadId,
    latestRunId: runId,
    activeRunId: runId,
    archivedAt: null,
    ...overrides,
  } as OrchestrationV2ThreadShell;
}
function projection(messages: Array<[string, string, boolean]>, status = "running") {
  return {
    runs: [{ id: runId, status, rootNodeId: "root", providerThreadId: "provider" }],
    nodes: [],
    providerThreads: [{ id: "provider", driver: "codex" }],
    messages: messages.map(([id, text, streaming]) => ({
      id,
      text,
      streaming,
      runId,
      nodeId: "root",
      role: "assistant",
    })),
  } as unknown as OrchestrationV2ThreadProjection;
}
function setup() {
  const settings = { readRepliesAloud: true, speechServiceAddress: "http://localhost:8011/say" };
  mocks.settings.mockReturnValue(settings);
  const tasks: Array<() => void> = [];
  const registry = AtomRegistry.make({
    scheduleTask: (task) => {
      tasks.push(task);
      return () => {};
    },
  });
  const atom = Atom.make<EnvironmentThreadState>(EMPTY_ENVIRONMENT_THREAD_STATE).pipe(
    Atom.keepAlive,
  );
  mocks.stateAtom.mockReturnValue(atom);
  const speak = vi.fn(async (_payload: { text: string; session: string }) => {});
  vi.stubGlobal("window", { desktopBridge: { speakReply: speak } });
  const error = vi.fn();
  const visibility = { allowed: true };
  const observer = createReplySpeechObserver(
    registry,
    environmentId,
    error,
    () => visibility.allowed,
  );
  return {
    observer,
    settings,
    speak,
    error,
    visibility,
    publish(
      value: OrchestrationV2ThreadProjection,
      status: EnvironmentThreadState["status"] = "live",
    ) {
      registry.set(atom, { ...EMPTY_ENVIRONMENT_THREAD_STATE, status, data: Option.some(value) });
      for (let task = tasks.shift(); task; task = tasks.shift()) task();
    },
    [Symbol.dispose]() {
      observer.dispose();
      registry.dispose();
      vi.unstubAllGlobals();
    },
  };
}

it("speaks updates during work and the final separately, despite shell/detail ordering and reconnects", async () => {
  using h = setup();
  h.observer.sync([shell({ latestRunId: null, activeRunId: null })]);
  h.observer.sync([shell()]);
  h.publish(projection([["update", "Working", true]]));
  await h.observer.whenIdle();
  expect(h.speak).not.toHaveBeenCalled();
  h.publish(projection([["update", "Working", false]]));
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual(["Working"]);
  h.publish(projection([["update", "Working", false]]), "synchronizing");
  h.publish(projection([["update", "Working", false]]));
  h.observer.sync([shell({ activeRunId: null })]);
  h.publish(
    projection(
      [
        ["update", "Working", false],
        ["final", "Done", false],
      ],
      "completed",
    ),
  );
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual(["Working", "Done"]);
  expect(new Set(h.speak.mock.calls.map(([p]) => p.session)).size).toBe(2);
  h.publish(
    projection(
      [
        ["update", "Working", false],
        ["final", "Done", false],
      ],
      "completed",
    ),
  );
  await h.observer.whenIdle();
  expect(h.speak).toHaveBeenCalledTimes(2);
});

it("does not read startup history, but does read a message completed afterward", async () => {
  using h = setup();
  h.publish(projection([["old", "Old", false]]));
  h.observer.sync([shell()]);
  await h.observer.whenIdle();
  expect(h.speak).not.toHaveBeenCalled();
  h.publish(
    projection([
      ["old", "Old", false],
      ["new", "New", false],
    ]),
  );
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual(["New"]);
});

it("keeps the current final answer when a queued follow-up becomes latest before detail catches up", async () => {
  using h = setup();
  const nextRun = RunId.make("next-run");
  h.observer.sync([shell({ latestRunId: null, activeRunId: null })]);
  h.observer.sync([shell()]);
  h.publish(projection([["update", "Working", false]]));
  await h.observer.whenIdle();
  h.observer.sync([shell({ latestRunId: nextRun })]);
  h.observer.sync([shell({ latestRunId: nextRun, activeRunId: nextRun })]);
  const old = projection(
    [
      ["update", "Working", false],
      ["final", "First final", false],
    ],
    "completed",
  );
  const next = projection([["next", "Next update", false]]);
  h.publish({
    ...old,
    runs: [...old.runs, ...next.runs.map((run) => ({ ...run, id: nextRun }))],
    messages: [
      ...old.messages,
      ...next.messages.map((message) => ({ ...message, runId: nextRun })),
    ],
  });
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual([
    "Working",
    "First final",
    "Next update",
  ]);
});

it("reads a new thread's already-finished update and cancels speech for a hidden thread", async () => {
  using h = setup();
  h.observer.sync([]);
  h.publish(projection([["update", "New thread", false]]));
  h.observer.sync([shell()]);
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual(["New thread"]);
  h.publish(
    projection([
      ["update", "New thread", false],
      ["hidden", "Hidden update", false],
    ]),
  );
  h.visibility.allowed = false;
  await h.observer.whenIdle();
  expect(h.speak).toHaveBeenCalledOnce();
  h.visibility.allowed = true;
  h.publish(
    projection([
      ["update", "New thread", false],
      ["hidden", "Hidden update", false],
    ]),
  );
  await h.observer.whenIdle();
  expect(h.speak).toHaveBeenCalledOnce();
});

it("preserves send order while an acknowledgement is delayed, without retrying a failed item", async () => {
  using h = setup();
  const ack = signal();
  const started = signal();
  h.speak.mockImplementationOnce(async () => {
    started.resolve();
    await ack.promise;
    throw new Error("offline");
  });
  h.observer.sync([shell({ latestRunId: null, activeRunId: null })]);
  h.observer.sync([shell()]);
  h.publish(
    projection([
      ["a", "First", false],
      ["b", "Second", false],
    ]),
  );
  await started.promise;
  expect(h.speak).toHaveBeenCalledTimes(1);
  ack.resolve();
  await h.observer.whenIdle();
  expect(h.speak.mock.calls.map(([p]) => p.text)).toEqual(["First", "Second"]);
  expect(h.error).toHaveBeenCalledOnce();
});

it.each(["off", "address", "stop", "archive", "removed", "dispose"])(
  "drops pending delivery after %s",
  async (change) => {
    using h = setup();
    h.observer.sync([shell({ latestRunId: null, activeRunId: null })]);
    h.observer.sync([shell()]);
    h.publish(projection([["a", "Do not send", false]]));
    if (change === "off") h.settings.readRepliesAloud = false;
    if (change === "address") h.settings.speechServiceAddress = "http://localhost:9999/say";
    if (change === "stop") h.observer.sync([shell({ latestRunStopRequested: true })]);
    if (change === "archive")
      h.observer.sync([shell({ archivedAt: DateTime.makeUnsafe("2026-11-03T00:00:00Z") })]);
    if (change === "removed") h.observer.sync([]);
    if (change === "dispose") h.observer.dispose();
    await h.observer.whenIdle();
    expect(h.speak).not.toHaveBeenCalled();
  },
);
