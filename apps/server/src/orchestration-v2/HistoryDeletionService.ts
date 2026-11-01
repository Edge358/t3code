import * as ThreadResourceCleanup from "./ThreadResourceCleanup.ts";
import * as ResourceCleanup from "./ResourceCleanupService.ts";
import {
  CommandId,
  ProviderSessionId,
  OrchestrationV2ProviderThreadJson,
  type ThreadHistoryDeletion,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderSessionManager from "./ProviderSessionManager.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as UsageService from "../usage/UsageService.ts";
import type { OrchestrationEffectV2 } from "./EffectOutbox.ts";

export class HistoryDeletionError extends Schema.TaggedError<HistoryDeletionError>()(
  "HistoryDeletionError",
  { cause: Schema.Defect() },
) {}

export class HistoryDeletionService extends Context.Service<
  HistoryDeletionService,
  {
    readonly execute: (effect: OrchestrationEffectV2) => Effect.Effect<void, HistoryDeletionError>;
  }
>()("t3/orchestration-v2/HistoryDeletionService") {}

const decodeThread = Schema.decodeUnknownEffect(
  Schema.fromJsonString(OrchestrationV2ProviderThreadJson),
);

export const layer = Layer.effect(
  HistoryDeletionService,
  Effect.gen(function* () {
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const sessions = yield* ProviderSessionManager.ProviderSessionManagerV2;
    const adapters = yield* ProviderAdapterRegistry.ProviderAdapterRegistryV2;
    const threads = yield* ThreadManagementService.ThreadManagementService;
    const projects = yield* ProjectStore.ProjectStoreV2;
    const usage = yield* UsageService.UsageService;
    const sql = yield* SqlClient.SqlClient;
    const cleanup = yield* ResourceCleanup.ResourceCleanupService;
    const threadCleanup = yield* ThreadResourceCleanup.ThreadResourceCleanup;
    const executeOne = Effect.fn("HistoryDeletionService.executeOne")(
      function* (effect: OrchestrationEffectV2) {
        const projection = yield* projections.getThreadRecords(effect.threadId, [
          "providerThreads",
          "providerSessions",
          "runs",
        ]);
        const initial = projection.thread.historyDeletion;
        if (
          initial === undefined ||
          initial.requestId !== effect.commandId ||
          initial.status === "complete"
        )
          return;
        let current = initial;
        let update = 0;
        const save = Effect.fn("HistoryDeletionService.save")(function* (
          next: ThreadHistoryDeletion,
        ) {
          yield* threads.dispatch({
            type: "thread.history-deletion.update",
            threadId: effect.threadId,
            commandId: CommandId.make(
              `${effect.id}:attempt:${effect.attemptCount}:update:${update++}`,
            ),
            state: next,
          });
          current = next;
        });
        yield* Effect.gen(function* () {
          const deletionThreadIds =
            effect.request.type === "thread.history-delete"
              ? (effect.request.threadIds ?? [effect.threadId])
              : [effect.threadId];
          const ownedRecords = yield* Effect.forEach(deletionThreadIds, (id) =>
            projections.getThreadRecords(id, ["providerThreads"]),
          );
          const ownedProviderThreadIds = ownedRecords.flatMap((record) =>
            record.providerThreads.map((thread) => thread.id),
          );
          // Display bindings can be detached while a native history still has a writer in that process.
          const providerSessionIds = new Set([
            ...projection.providerSessions.map((session) => session.id),
            ...ownedRecords.flatMap((record) =>
              record.providerThreads.flatMap((thread) =>
                thread.providerSessionId === null ? [] : [thread.providerSessionId],
              ),
            ),
          ]);
          for (const providerSessionId of providerSessionIds) {
            const otherWorking = yield* sessions.otherWorkingThreads({
              providerSessionId,
              threadId: effect.threadId,
            });
            if (otherWorking.some((id) => !deletionThreadIds.includes(id)))
              return yield* new HistoryDeletionError({
                cause: "Another conversation still has active provider work.",
              });
            const released = yield* sessions.releaseUnlessBusy({
              providerSessionId,
              ownProviderThreadIds: ownedProviderThreadIds,
              reason: "manual_shutdown",
              detail: "Conversation history deletion.",
            });
            if (!released && (yield* sessions.isLive(providerSessionId)))
              return yield* new HistoryDeletionError({
                cause:
                  "Another conversation is using the provider process. Stop its active work and retry Delete.",
              });
            yield* sessions.awaitClosed(providerSessionId);
          }
          const descendantsAfterShutdown = yield* projections.getDescendantThreadIds(
            effect.threadId,
          );
          if (descendantsAfterShutdown.some((id) => !deletionThreadIds.includes(id)))
            return yield* new HistoryDeletionError({
              cause: "A descendant appeared during shutdown. Retry Delete to include it.",
            });
          yield* usage.prepareDeletion;
          const project = yield* projects.get(projection.thread.projectId);
          const records = yield* projections.getThreadRecords(effect.threadId, [
            "providerThreads",
            "providerSessions",
            "runs",
          ]);
          const targets = [...current.targets];
          // A turn finishing during shutdown may have supplied its native ID after the initial request.
          for (const native of records.providerThreads) {
            if (native.appThreadId !== effect.threadId && native.appThreadId !== null) continue;
            const index = targets.findIndex((target) => target.providerThreadId === native.id);
            if (index < 0)
              targets.push({
                providerThreadId: native.id,
                providerInstanceId: native.providerInstanceId,
                driver: native.driver,
                nativeId: native.nativeThreadRef?.nativeId ?? null,
                status:
                  native.driver === "codex" || native.driver === "claudeAgent"
                    ? "pending"
                    : "unsupported",
              });
            else if (targets[index]!.nativeId === null)
              targets[index] = {
                ...targets[index]!,
                nativeId: native.nativeThreadRef?.nativeId ?? null,
              };
          }
          yield* save({ ...current, targets });
          for (let index = 0; index < current.targets.length; index++) {
            const target = current.targets[index]!;
            if (["deleted", "absent", "unsupported"].includes(target.status)) continue;
            const native = records.providerThreads.find(
              (thread) => thread.id === target.providerThreadId,
            );
            const result = yield* Effect.gen(function* () {
              if (
                native === undefined ||
                target.nativeId === null ||
                native.nativeThreadRef?.strength !== "strong"
              ) {
                return yield* new HistoryDeletionError({
                  cause: "The provider has not supplied a reliable native history ID.",
                });
              }
              const protectedRows = yield* sql<{ payload_json: string }>`
              SELECT DISTINCT p.payload_json FROM orchestration_v2_projection_provider_threads p
              WHERE EXISTS (
                SELECT 1 FROM orchestration_v2_projection_threads t
                WHERE t.deleted_at IS NULL AND t.thread_id NOT IN ${sql.in(effect.request.type === "thread.history-delete" ? (effect.request.threadIds ?? [effect.threadId]) : [effect.threadId])}
                AND (t.thread_id = p.thread_id OR EXISTS (
                  SELECT 1 FROM orchestration_v2_projection_subagents s
                  WHERE s.provider_thread_id = p.provider_thread_id
                    AND (s.thread_id = t.thread_id OR s.child_thread_id = t.thread_id)
                ) OR EXISTS (
                  SELECT 1 FROM orchestration_v2_projection_runs r
                  WHERE r.thread_id = t.thread_id AND r.provider_thread_id = p.provider_thread_id
                ))
              )`;
              const protectedThreads = yield* Effect.forEach(protectedRows, (row) =>
                decodeThread(row.payload_json),
              );
              if (
                protectedThreads.some((thread) => thread.forkedFrom?.providerThreadId === native.id)
              )
                return "retained" as const;
              const protectedNativeIds = protectedThreads
                .filter((thread) => thread.driver === target.driver)
                .flatMap((thread) =>
                  thread.nativeThreadRef?.nativeId == null ? [] : [thread.nativeThreadRef.nativeId],
                );
              if (protectedNativeIds.includes(target.nativeId)) return "retained" as const;
              const adapter = yield* adapters.get(target.providerInstanceId);
              const session = records.providerSessions.find(
                (entry) => entry.id === native.providerSessionId,
              );
              const run = records.runs.find((entry) => entry.providerThreadId === native.id);
              const cwd =
                session?.cwd ??
                projection.thread.worktreePath ??
                Option.getOrUndefined(project)?.workspaceRoot;
              if (cwd === undefined)
                return yield* new HistoryDeletionError({
                  cause: "The original provider workspace is unavailable.",
                });
              return yield* Effect.scoped(
                Effect.gen(function* () {
                  const runtime = yield* adapter.openSession({
                    threadId: effect.threadId,
                    providerSessionId: ProviderSessionId.make(
                      `history-delete:${effect.id}:${index}`,
                    ),
                    modelSelection: run?.modelSelection ?? {
                      instanceId: target.providerInstanceId,
                      model: session?.model ?? projection.thread.modelSelection.model,
                    },
                    runtimePolicy: {
                      runtimeMode: projection.thread.runtimeMode,
                      interactionMode: projection.thread.interactionMode,
                      cwd,
                    },
                  });
                  if (runtime.deleteThreadHistory === undefined)
                    return yield* new HistoryDeletionError({
                      cause: "This provider cannot delete local history.",
                    });
                  return yield* runtime.deleteThreadHistory({
                    providerThread: native,
                    protectedNativeIds,
                  });
                }),
              );
            }).pipe(Effect.result);
            if (result._tag === "Failure")
              yield* Effect.logWarning("Conversation native history deletion failed", {
                providerInstanceId: target.providerInstanceId,
                nativeId: target.nativeId,
                cause: result.failure,
              });
            const status = result._tag === "Success" ? result.success : "failed";
            yield* save({
              ...current,
              targets: current.targets.map((entry, position) =>
                position === index ? { ...entry, status } : entry,
              ),
            });
          }
          const remaining = current.targets.filter(
            (target) => target.status === "failed" || target.status === "pending",
          );
          const summary = current.targets
            .map(
              (target) =>
                `${target.driver === "claudeAgent" ? "Claude" : target.driver}: ${target.status}`,
            )
            .join("; ");
          const sharedHistoryMessage = current.targets.some(
            (target) => target.status === "retained",
          )
            ? " Shared histories are kept."
            : "";
          if (remaining.length === 0) {
            const unsettled = yield* sql`SELECT 1 FROM orchestration_v2_effect_outbox
              WHERE thread_id = ${effect.threadId} AND status IN ('pending', 'running')
                AND effect_type <> 'thread.history-delete' LIMIT 1`;
            if (unsettled.length > 0)
              return yield* new HistoryDeletionError({
                cause: "Conversation work has not settled.",
              });
            const attachmentIds = yield* projections.getThreadAttachmentIds(effect.threadId);
            const protectedAttachments = new Set<string>();
            for (const attachmentId of attachmentIds) {
              const references = yield* sql`SELECT 1 FROM (
                SELECT thread_id, payload_json FROM orchestration_v2_projection_messages
                UNION ALL SELECT thread_id, payload_json FROM orchestration_v2_projection_turn_items
                UNION ALL SELECT thread_id, payload_json FROM orchestration_v2_projection_threads
              ) content JOIN orchestration_v2_projection_threads t ON t.thread_id = content.thread_id
              WHERE t.deleted_at IS NULL AND t.thread_id NOT IN ${sql.in(deletionThreadIds)}
                AND instr(content.payload_json, ${attachmentId}) > 0 LIMIT 1`;
              if (references.length > 0) protectedAttachments.add(attachmentId);
            }
            const steps = [
              ["scheduled-tasks", cleanup.cleanupScheduledTasks(effect.threadId)],
              ["terminal", cleanup.cleanupTerminals(effect.threadId)],
              ["preview", cleanup.cleanupPreviews(effect.threadId)],
              [
                "attachments",
                cleanup.cleanupAttachments(
                  attachmentIds.filter((id) => !protectedAttachments.has(id)),
                ),
              ],
              ["checkpoints", threadCleanup.cleanupCheckpoints(effect.threadId, deletionThreadIds)],
              ["logs", threadCleanup.cleanupLogs(effect.threadId, deletionThreadIds)],
            ] as const;
            for (const [step, operation] of steps) {
              if (current.completedCleanup?.includes(step)) continue;
              yield* operation;
              yield* save({
                ...current,
                completedCleanup: [...(current.completedCleanup ?? []), step],
              });
            }
          }
          yield* save({
            ...current,
            status: remaining.length > 0 ? "failed" : "complete",
            message:
              remaining.length > 0
                ? `Conversation deletion is incomplete. ${summary}.${sharedHistoryMessage} Use Delete again to retry.`
                : `Local conversation deletion finished. ${summary}. Unsupported provider histories are kept.`,
          });
        }).pipe(
          Effect.catch((cause) =>
            save({
              ...current,
              status: "failed",
              message:
                "Conversation cleanup could not finish. Project files were kept. Use Delete again to retry the unfinished cleanup.",
            }).pipe(
              Effect.tap(() =>
                Effect.logWarning("Conversation history deletion preparation failed", { cause }),
              ),
            ),
          ),
        );
      },
      Effect.mapError((cause) => new HistoryDeletionError({ cause })),
    );
    return HistoryDeletionService.of({
      execute: Effect.fn("HistoryDeletionService.execute")(
        function* (effect) {
          const root = yield* projections.getThread(effect.threadId);
          if (root.historyDeletion?.requestId !== effect.commandId || root.deletedAt !== null)
            return;
          const group =
            effect.request.type === "thread.history-delete"
              ? (effect.request.threadIds ?? [effect.threadId])
              : [effect.threadId];
          for (const threadId of group) {
            const thread = yield* projections.getThread(threadId);
            const state = thread.historyDeletion;
            // Another request owns an independently deleting child; the parent still checks it below.
            if (
              state === undefined ||
              state.status === "complete" ||
              state.requestId !== effect.commandId
            )
              continue;
            {
              const descendantIds = yield* projections.getDescendantThreadIds(threadId);
              const children = yield* Effect.forEach(
                descendantIds.filter((id) => group.includes(id)),
                (id) => projections.getThread(id),
              );
              if (children.some((child) => child.deletedAt === null)) {
                yield* threads.dispatch({
                  type: "thread.history-deletion.update",
                  threadId,
                  commandId: CommandId.make(
                    `${effect.id}:attempt:${effect.attemptCount}:children-incomplete`,
                  ),
                  state: {
                    ...state,
                    status: "failed",
                    message:
                      "A descendant conversation could not be fully deleted. Its remaining history was kept. Use Delete again to retry.",
                  },
                });
                continue;
              }
            }
            yield* executeOne({
              ...effect,
              id: `${effect.id}:${threadId}`,
              threadId,
              commandId: state.requestId,
            });
          }
        },
        Effect.mapError((cause) => new HistoryDeletionError({ cause })),
      ),
    });
  }),
);
