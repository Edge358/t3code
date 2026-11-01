import * as ProjectionMaintenance from "./ProjectionMaintenance.ts";
import * as EventStore from "./EventStore.ts";
import * as ThreadResourceCleanup from "./ThreadResourceCleanup.ts";
import { ResourceCleanupError } from "./ResourceCleanupService.ts";
import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderSessionId,
  ThreadId,
  type OrchestrationV2ProviderThread,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as EventSink from "./EventSink.ts";
import * as EffectOutbox from "./EffectOutbox.ts";
import * as Option from "effect/Option";
import * as EffectWorker from "./EffectWorker.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";

it.effect.each([
  "partial",
  "shared",
  "shared-partial",
  "absent",
  "unsupported",
  "restart",
  "worker-failed",
  "side-chat",
  "side-chat-partial",
  "side-chat-double-delete",
  "side-chat-independent",
  "side-chat-independent-failed",
  "side-chat-independent-pending",
  "side-chat-independent-no-parent-history",
  "detached-session",
  "subagent-descendants",
  "cleanup-failure",
  "legacy-sweep",
] as const)(
  "persists a mixed-provider deletion and handles %s without losing retry references",
  (scenario) => {
    const calls: string[] = [];
    const cleanupCalls: string[] = [];
    let failCleanup = scenario === "cleanup-failure";
    const cleanupLayer = Layer.succeed(ThreadResourceCleanup.ThreadResourceCleanup, {
      cleanupCheckpoints: () =>
        Effect.sync(() => {
          cleanupCalls.push("checkpoints");
        }),
      cleanupLogs: () =>
        Effect.suspend(() => {
          cleanupCalls.push("logs");
          return failCleanup
            ? Effect.fail(new ResourceCleanupError({ operation: "logs", cause: "locked fixture" }))
            : Effect.void;
        }),
    });
    const liveSessionId = ProviderSessionId.make("detached-writer-session");
    let writerOpen = false;
    let failClaude =
      scenario === "partial" ||
      scenario === "shared-partial" ||
      scenario === "side-chat-partial" ||
      scenario === "side-chat-independent-failed";
    const hasSideChat =
      scenario.startsWith("side-chat") ||
      scenario === "subagent-descendants" ||
      scenario === "legacy-sweep";
    const independentChild = scenario.startsWith("side-chat-independent");
    const adapters = ["codex", "claudeAgent", "other"].map((name) => {
      const driver = ProviderDriverKind.make(name);
      const instanceId = ProviderInstanceId.make(name);
      return ProviderAdapter.ProviderAdapterV2.of({
        instanceId,
        driver,
        getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
        planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
        openSession: (input) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            if (input.providerSessionId === liveSessionId) {
              writerOpen = true;
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  writerOpen = false;
                }),
              );
            }
            return {
              instanceId,
              driver,
              providerSessionId: input.providerSessionId,
              providerSession: {
                id: input.providerSessionId,
                driver,
                providerInstanceId: instanceId,
                status: "ready",
                cwd: process.cwd(),
                model: "test",
                capabilities: CodexProviderCapabilitiesV2,
                createdAt: now,
                updatedAt: now,
                lastError: null,
              },
              events: Stream.never,
              deleteThreadHistory: ({
                providerThread,
              }: {
                providerThread: OrchestrationV2ProviderThread;
              }) =>
                Effect.gen(function* () {
                  const id = providerThread.nativeThreadRef!.nativeId!;
                  calls.push(id);
                  if (name === "codex" && writerOpen)
                    return yield* new ProviderAdapter.ProviderAdapterProtocolError({
                      driver,
                      detail: "Native history still has an active writer.",
                    });
                  if (
                    name === "claudeAgent" &&
                    failClaude &&
                    (scenario !== "side-chat-independent-failed" || id === "child-history")
                  )
                    return yield* new ProviderAdapter.ProviderAdapterProtocolError({
                      driver,
                      detail: "Synthetic provider failure.",
                    });
                  return scenario === "absent" ? ("absent" as const) : ("deleted" as const);
                }),
            } as unknown as ProviderAdapter.ProviderAdapterV2SessionRuntime;
          }),
      });
    });
    const db = SqlitePersistence.layerMemory;
    const layer = Layer.mergeAll(
      db,
      ProjectionMaintenance.layer.pipe(
        Layer.provide(Layer.mergeAll(EventStore.layer, ProjectionStore.layer)),
        Layer.provide(db),
      ),
      EffectOutbox.layer.pipe(Layer.provide(db)),
      ProjectionStore.layer.pipe(Layer.provide(db)),
      ProviderReplayHarness.layerWithRegistry(
        { name: `history-delete-${scenario}` },
        ProviderAdapterRegistry.layerFromAdapters(adapters),
        { databaseLayer: db, runEffectWorker: false },
      ).pipe(Layer.provide(cleanupLayer)),
    );
    return Effect.gen(function* () {
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const events = yield* EventSink.EventSinkV2;
      const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
      const outbox = yield* EffectOutbox.EffectOutboxV2;
      const sql = yield* SqlClient.SqlClient;
      const target = ThreadId.make("target");
      const neighbor = ThreadId.make("neighbor");
      const create = Effect.fn("test.createHistoryThread")(function* (threadId: ThreadId) {
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make(`create:${threadId}`),
          threadId,
          projectId: ProjectId.make("project"),
          title: threadId,
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: process.cwd(),
          createdBy: "user",
          creationSource: "web",
        });
      });
      yield* create(target);
      yield* create(neighbor);
      const childId = ThreadId.make("side-chat");
      if (hasSideChat && scenario !== "subagent-descendants" && scenario !== "legacy-sweep")
        yield* orchestrator.dispatch({
          type: "thread.fork",
          commandId: CommandId.make("fork-side-chat"),
          sourceThreadId: target,
          targetThreadId: childId,
          sourcePoint: { type: "latest_stable" },
          sideChat: true,
          createdBy: "user",
          creationSource: "web",
        });

      if (scenario === "subagent-descendants" || scenario === "legacy-sweep") {
        for (const [id, parent] of [
          [childId, target],
          [ThreadId.make("grandchild"), childId],
        ] as const) {
          yield* create(id);
          const thread = yield* projections.getThread(id);
          yield* events.write({
            events: [
              {
                id: EventId.make(`lineage:${id}`),
                type: "thread.metadata-updated",
                threadId: id,
                occurredAt: yield* DateTime.now,
                payload: {
                  ...thread,
                  lineage: {
                    parentThreadId: parent,
                    rootThreadId: target,
                    relationshipToParent: "subagent",
                  },
                },
              },
            ],
          });
        }
      }

      const now = yield* DateTime.now;
      const message = {
        id: MessageId.make("purge-message"),
        threadId: target,
        createdBy: "user" as const,
        creationSource: "web" as const,
        runId: null,
        nodeId: null,
        role: "user" as const,
        text: "uniquedeletionphrase verify removal",
        attachments: [],
        streaming: false,
        createdAt: now,
        updatedAt: now,
      };
      yield* events.write({
        events: [
          {
            id: EventId.make("purge-message-event"),
            type: "message.updated",
            threadId: target,
            occurredAt: now,
            payload: message,
          },
        ],
      });
      yield* sql`INSERT INTO mcp_app_model_context (thread_id, item_id, server, tool, text, updated_at)
        VALUES (${target}, 'item', 'server', 'tool', 'uniquedeletionphrase', '2026-11-01')`;
      assert.lengthOf(
        yield* sql`SELECT rowid FROM orchestration_v2_message_search WHERE orchestration_v2_message_search MATCH 'uniquedeletionphrase'`,
        1,
      );
      const addNative = Effect.fn("test.addNativeHistory")(function* (
        threadId: ThreadId,
        id: string,
        driverName: string,
        nativeId = id,
      ) {
        const driver = ProviderDriverKind.make(driverName);
        const payload: OrchestrationV2ProviderThread = {
          id: ProviderThreadId.make(id),
          driver,
          providerInstanceId: ProviderInstanceId.make(driverName),
          providerSessionId:
            scenario === "detached-session" && threadId === target && driverName === "codex"
              ? liveSessionId
              : null,
          appThreadId: threadId,
          ownerNodeId: null,
          nativeThreadRef: { driver, nativeId, strength: "strong" },
          nativeConversationHeadRef: null,
          status: "idle",
          firstRunOrdinal: 1,
          lastRunOrdinal: 1,
          handoffIds: [],
          forkedFrom: null,
          createdAt: now,
          updatedAt: now,
        };
        yield* events.write({
          events: [
            {
              id: EventId.make(`event:${id}`),
              type: "provider-thread.updated",
              threadId,
              driver,
              providerInstanceId: payload.providerInstanceId,
              occurredAt: now,
              payload,
            },
          ],
        });
      });
      if (scenario !== "side-chat-independent-no-parent-history") {
        yield* addNative(target, "codex-first", "codex");
        yield* addNative(target, "claude", "claudeAgent");
        yield* addNative(target, "codex-return", "codex");
      }
      yield* addNative(
        neighbor,
        "neighbor-history",
        "codex",
        scenario.startsWith("shared") ? "codex-first" : "unrelated",
      );
      if (scenario === "unsupported") yield* addNative(target, "other-history", "other");
      if (hasSideChat) yield* addNative(ThreadId.make("side-chat"), "child-history", "claudeAgent");
      for (const type of ["thread.settle", "thread.archive", "thread.unarchive"] as const) {
        yield* orchestrator.dispatch({ type, commandId: CommandId.make(type), threadId: target });
        yield* worker.drain();
      }
      const stoppedSessionId = ProviderSessionId.make("persisted-closed-session");
      yield* events.write({
        events: [
          {
            id: EventId.make("closed-session-record"),
            type: "provider-session.updated",
            threadId: target,
            occurredAt: now,
            payload: {
              id: stoppedSessionId,
              driver: ProviderDriverKind.make("codex"),
              providerInstanceId: ProviderInstanceId.make("codex"),
              status: "stopped",
              cwd: process.cwd(),
              model: "test",
              capabilities: CodexProviderCapabilitiesV2,
              createdAt: now,
              updatedAt: now,
              lastError: null,
            },
          },
        ],
      });
      if (scenario === "detached-session") {
        const manager = yield* ProviderSessionManager.ProviderSessionManagerV2;
        yield* manager.open({
          threadId: target,
          providerSessionId: liveSessionId,
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
          runtimePolicy: {
            cwd: process.cwd(),
            runtimeMode: "full-access",
            interactionMode: "default",
          },
        });
        yield* events.write({
          events: [
            {
              id: EventId.make("detach-display-binding"),
              type: "provider-session.detached",
              threadId: target,
              occurredAt: now,
              payload: {
                providerSessionId: liveSessionId,
                detachedAt: now,
                reason: "Display binding detached; native process remains alive.",
              },
            },
          ],
        });
        const bound = yield* projections.getThreadRecords(target, ["providerSessions"]);
        assert.isFalse(bound.providerSessions.some((session) => session.id === liveSessionId));
        assert.isTrue(writerOpen);
      }
      assert.deepEqual(calls, []);
      if (independentChild) {
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:child-first"),
          threadId: childId,
        });
        if (scenario === "side-chat-independent-pending") {
          const claimed = yield* outbox.claimNext({ workerId: "child-worker" });
          assert.isTrue(Option.isSome(claimed));
          if (Option.isSome(claimed)) assert.equal(claimed.value.threadId, childId);
        }
      }
      if (scenario === "legacy-sweep") {
        const thread = yield* projections.getThread(target);
        yield* events.write({
          events: [
            {
              id: EventId.make("old-soft-deletion"),
              type: "thread.deleted",
              threadId: target,
              occurredAt: now,
              payload: {
                ...thread,
                deletedAt: now,
                historyDeletion: {
                  requestId: CommandId.make("old-delete"),
                  status: "complete",
                  message: "old completion",
                  targets: [],
                },
              },
            },
          ],
        });
        assert.include(yield* projections.getDeletionSweepThreadIds(), target);
        yield* orchestrator.recoverDelegatedTasks;
      } else {
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:first"),
          threadId: target,
        });
      }
      assert.isNull((yield* projections.getThread(target)).deletedAt);
      if (scenario === "side-chat-double-delete") {
        // A second Delete while the first is queued is a no-op for the whole group.
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:second"),
          threadId: target,
        });
      }
      if (scenario === "restart" || scenario === "worker-failed") {
        const claimed = yield* outbox.claimNext({ workerId: "lost-worker" });
        assert.isTrue(Option.isSome(claimed));
        if (Option.isSome(claimed)) {
          assert.equal(claimed.value.request.type, "thread.history-delete");
          if (scenario === "restart") {
            assert.equal((yield* outbox.reconcileAfterProcessLoss).requeued, 1);
          } else {
            yield* outbox.fail({
              effectId: claimed.value.id,
              workerId: "lost-worker",
              error: "Synthetic exhausted worker.",
            });
            yield* orchestrator.dispatch({
              type: "thread.delete",
              commandId: CommandId.make("retry-dead-worker"),
              threadId: target,
            });
          }
        }
      }

      const blocked = yield* orchestrator
        .dispatch({
          type: "thread.model-selection.set",
          commandId: CommandId.make("change-during-delete"),
          threadId: target,
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "another" },
        })
        .pipe(Effect.result);
      assert.equal(blocked._tag, "Failure");
      yield* worker.drain();
      const first = yield* projections.getThread(target);
      if (scenario === "subagent-descendants") {
        assert.isNotNull((yield* projections.getThread(childId)).deletedAt);
        assert.isNotNull((yield* projections.getThread(ThreadId.make("grandchild"))).deletedAt);
      }
      assert.equal(
        first.historyDeletion?.status,
        scenario === "partial" ||
          scenario === "shared-partial" ||
          scenario === "cleanup-failure" ||
          scenario === "side-chat-partial" ||
          scenario === "side-chat-independent-failed" ||
          scenario === "side-chat-independent-pending"
          ? "failed"
          : "complete",
      );
      assert.equal(first.worktreePath, first.deletedAt === null ? process.cwd() : null);
      assert.isNull((yield* projections.getThread(neighbor)).deletedAt);
      assert.notInclude(calls, "unrelated");
      if (scenario === "detached-session") assert.isFalse(writerOpen);
      if (
        scenario === "side-chat" ||
        scenario === "side-chat-double-delete" ||
        (independentChild && !failClaude && scenario !== "side-chat-independent-pending")
      ) {
        assert.isNotNull((yield* projections.getThread(childId)).deletedAt);
        assert.equal(calls[0], "child-history");
        yield* orchestrator.awaitThreadDeletion(target);
        yield* orchestrator.awaitThreadDeletion(childId);
        assert.equal(calls.filter((id) => id === "child-history").length, 1);
      }

      if (scenario === "side-chat-independent-pending") {
        assert.isNull(first.deletedAt);
        assert.equal((yield* projections.getThread(childId)).historyDeletion?.status, "pending");
        assert.deepEqual(calls, []);
        assert.equal((yield* outbox.reconcileAfterProcessLoss).requeued, 1);
        yield* worker.drain();
        yield* orchestrator.awaitThreadDeletion(childId);
        assert.isNull((yield* projections.getThread(target)).deletedAt);
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:after-child-finished"),
          threadId: target,
        });
        yield* worker.drain();
        yield* orchestrator.awaitThreadDeletion(target);
        assert.sameMembers(calls, ["child-history", "codex-first", "claude", "codex-return"]);
      }

      if (scenario === "side-chat-partial" || scenario === "side-chat-independent-failed") {
        assert.isNull(first.deletedAt);
        assert.isNull((yield* projections.getThread(childId)).deletedAt);
        assert.deepEqual(calls, ["child-history"]);
        const firstWait = yield* orchestrator.awaitThreadDeletion(target).pipe(Effect.result);
        assert.equal(firstWait._tag, "Failure");
        failClaude = false;
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:retry-child"),
          threadId: target,
        });
        yield* worker.drain();
        yield* orchestrator.awaitThreadDeletion(target);
        yield* orchestrator.awaitThreadDeletion(childId);
        assert.isNotNull((yield* projections.getThread(childId)).deletedAt);
        assert.isNotNull((yield* projections.getThread(target)).deletedAt);
        assert.deepEqual(calls.slice(0, 2), ["child-history", "child-history"]);
        assert.sameMembers(calls.slice(2), ["codex-first", "claude", "codex-return"]);
      }

      if (scenario === "shared") {
        assert.notInclude(calls, "codex-first");
        assert.isNotNull(first.deletedAt);
      }
      if (scenario === "unsupported") assert.notInclude(calls, "other-history");
      if (scenario === "partial" || scenario === "shared-partial") {
        assert.equal(
          first.historyDeletion!.message.includes("Shared histories are kept."),
          scenario === "shared-partial",
        );
        assert.isNull(first.deletedAt);
        // Archiving stays available while new provider work is blocked after partial cleanup.
        const archived = yield* orchestrator
          .dispatch({
            type: "thread.archive",
            commandId: CommandId.make("archive-after-failed-deletion"),
            threadId: target,
          })
          .pipe(Effect.result);
        assert.equal(archived._tag, "Success");
        yield* worker.drain();
        failClaude = false;
        yield* orchestrator.dispatch({
          type: "thread.delete",
          commandId: CommandId.make("delete:retry"),
          threadId: target,
        });
        yield* worker.drain();
        const completed = yield* projections.getThread(target);
        assert.isNotNull(completed.deletedAt);
        assert.equal(completed.historyDeletion?.status, "complete");
        assert.sameMembers(
          calls,
          scenario === "shared-partial"
            ? ["claude", "codex-return", "claude"]
            : ["codex-first", "claude", "codex-return", "claude"],
        );
      }
      if (scenario === "cleanup-failure") {
        assert.isNull(first.deletedAt);
        assert.lengthOf(
          yield* sql`SELECT * FROM orchestration_v2_projection_messages WHERE thread_id = ${target}`,
          1,
        );
        assert.deepEqual(cleanupCalls, ["checkpoints", "logs"]);
        failCleanup = false;
        yield* orchestrator.dispatch({
          type: "thread.delete",
          threadId: target,
          commandId: CommandId.make("retry-cleanup"),
        });
        yield* worker.drain();
        assert.deepEqual(cleanupCalls, ["checkpoints", "logs", "logs"]);
        assert.sameMembers(calls, ["codex-first", "claude", "codex-return"]);
      }
      const final = yield* projections.getThread(target);
      if (final.deletedAt !== null) {
        assert.equal(final.title, "Deleted conversation");
        assert.isNull(final.worktreePath);
        assert.deepEqual(
          yield* sql`SELECT * FROM orchestration_v2_projection_provider_threads WHERE thread_id = ${target}`,
          [],
        );
        assert.deepEqual(
          yield* sql`SELECT * FROM orchestration_v2_projection_provider_sessions WHERE thread_id = ${target}`,
          [],
        );
        assert.deepEqual(
          yield* sql`SELECT * FROM orchestration_command_receipts WHERE aggregate_id = ${target}`,
          [],
        );
        assert.deepEqual(
          yield* sql`SELECT * FROM orchestration_v2_effect_outbox WHERE thread_id = ${target}`,
          [],
        );
        const remaining = yield* sql<{
          event_type: string;
        }>`SELECT event_type FROM orchestration_events WHERE stream_id = ${target}`;
        assert.sameMembers(
          remaining.map((row) => row.event_type),
          ["thread.created", "thread.deleted"],
        );
        assert.deepEqual(
          yield* sql`SELECT * FROM mcp_app_model_context WHERE thread_id = ${target}`,
          [],
        );
        assert.deepEqual(
          yield* sql`SELECT rowid FROM orchestration_v2_message_search WHERE orchestration_v2_message_search MATCH 'uniquedeletionphrase'`,
          [],
        );
        const maintenance = yield* ProjectionMaintenance.ProjectionMaintenanceV2;
        const verification = yield* maintenance.verify;
        assert.isTrue(verification.valid);
        assert.isTrue((yield* maintenance.rebuild).valid);
        assert.isTrue((yield* projections.getThread(target)).historyDeletion?.purged);
        assert.isNull((yield* projections.getThread(neighbor)).deletedAt);
        assert.deepEqual(
          yield* events.write({
            events: [
              {
                id: EventId.make("late-message"),
                type: "message.updated",
                threadId: target,
                occurredAt: now,
                payload: message,
              },
            ],
          }),
          [],
        );
        assert.deepEqual(
          yield* sql`SELECT * FROM orchestration_v2_projection_messages WHERE thread_id = ${target}`,
          [],
        );
        assert.notInclude(yield* projections.getDeletionSweepThreadIds(), target);
      }
    }).pipe(Effect.provide(layer));
  },
);
