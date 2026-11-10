import * as Digest from "effect/crypto/Digest";
import * as FileSystem from "effect/FileSystem";
import * as VcsProcess from "../vcs/VcsProcess.ts";
import { checkpointRefForScopeOrdinal } from "./CheckpointService.ts";
import { CheckpointRef, CheckpointScopeId, ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as ProviderEventLoggers from "@t3tools/provider-core/server/ProviderEventLoggers";
import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import { toSafeThreadAttachmentSegment } from "../attachmentStore.ts";
import { resolveThreadSegment } from "../provider/EventNdjsonLogger.ts";
import { ResourceCleanupError } from "./ResourceCleanupService.ts";

export class ThreadResourceCleanup extends Context.Reference<{
  readonly cleanupCheckpoints: (
    threadId: ThreadId,
    group: ReadonlyArray<ThreadId>,
  ) => Effect.Effect<void, ResourceCleanupError>;
  readonly cleanupLogs: (
    threadId: ThreadId,
    group: ReadonlyArray<ThreadId>,
  ) => Effect.Effect<void, ResourceCleanupError>;
}>("t3/orchestration-v2/ThreadResourceCleanup", {
  defaultValue: () => ({
    cleanupCheckpoints: () => Effect.void,
    cleanupLogs: () => Effect.void,
  }),
}) {}

export const layer = Layer.effect(
  ThreadResourceCleanup,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const checkpoints = yield* CheckpointStore.CheckpointStore;
    const vcs = yield* VcsProcess.VcsProcess;
    const digest = yield* Digest.Digest;
    const fs = yield* FileSystem.FileSystem;
    const loggers = yield* ProviderEventLoggers.ProviderEventLoggers;
    return {
      cleanupCheckpoints: Effect.fn("ResourceCleanupService.cleanupCheckpoints")(
        function* (threadId: ThreadId, group: ReadonlyArray<ThreadId>) {
          const scopes = yield* sql<{
            scope_id: string;
            cwd: string;
          }>`SELECT scope_id, json_extract(payload_json, '$.cwd') AS cwd
            FROM orchestration_v2_projection_checkpoint_scopes WHERE thread_id = ${threadId}`;
          const protectedRefs = yield* sql<{
            ref: string;
          }>`SELECT json_extract(c.payload_json, '$.ref') AS ref
            FROM orchestration_v2_projection_checkpoints c JOIN orchestration_v2_projection_threads t ON t.thread_id = c.thread_id
            WHERE t.deleted_at IS NULL AND t.thread_id NOT IN ${sql.in(group)}`;
          for (const scope of scopes) {
            const sharedScope = yield* sql`SELECT 1 FROM orchestration_v2_projection_nodes r
              JOIN orchestration_v2_projection_threads t ON t.thread_id = r.thread_id
              WHERE r.checkpoint_scope_id = ${scope.scope_id} AND t.deleted_at IS NULL AND t.thread_id NOT IN ${sql.in(group)} LIMIT 1`;
            if (sharedScope.length > 0) continue;
            if (!scope.cwd || !(yield* fs.exists(scope.cwd)))
              return yield* new ResourceCleanupError({
                operation: "checkpoints",
                threadId,
                cause: "Checkpoint workspace is unavailable.",
              });
            if (!(yield* checkpoints.isGitRepository(scope.cwd))) continue;
            const baseline = yield* checkpointRefForScopeOrdinal({
              scopeId: CheckpointScopeId.make(scope.scope_id),
              ordinalWithinScope: 0,
            }).pipe(Effect.provideService(Digest.Digest, digest));
            const prefix = baseline.slice(0, -1);
            const listing = yield* vcs.run({
              operation: "ThreadResourceCleanup.listCheckpointRefs",
              command: "git",
              cwd: scope.cwd,
              args: ["for-each-ref", "--format=%(refname)", prefix],
              timeoutMs: 10_000,
            });
            const refs = listing.stdout
              .split(/\r?\n/)
              .filter(
                (ref) =>
                  ref.startsWith(prefix) &&
                  /^\d+$/.test(ref.slice(prefix.length)) &&
                  !protectedRefs.some((kept) => kept.ref === ref),
              )
              .map((ref) => CheckpointRef.make(ref));
            yield* checkpoints.deleteCheckpointRefs({ cwd: scope.cwd, checkpointRefs: refs });
          }
        },
        Effect.mapError((cause) => new ResourceCleanupError({ operation: "checkpoints", cause })),
      ),
      cleanupLogs: Effect.fn("ResourceCleanupService.cleanupLogs")(
        function* (threadId: ThreadId, group: ReadonlyArray<ThreadId>) {
          const kept = yield* sql<{
            thread_id: string;
          }>`SELECT thread_id FROM orchestration_v2_projection_threads
            WHERE deleted_at IS NULL AND thread_id NOT IN ${sql.in(group)}`;
          const segment = resolveThreadSegment(threadId);
          // A kept long-id thread's pre-hash log can share this thread's current name.
          if (
            kept.some(
              (row) =>
                resolveThreadSegment(row.thread_id) === segment ||
                toSafeThreadAttachmentSegment(row.thread_id) === segment,
            )
          )
            return;
          const legacySegment = toSafeThreadAttachmentSegment(threadId);
          const keepSharedLegacyLog = kept.some(
            (row) => toSafeThreadAttachmentSegment(row.thread_id) === legacySegment,
          );
          const remove = loggers.native?.removeThread ?? loggers.canonical?.removeThread;
          if (remove === undefined)
            return yield* new ResourceCleanupError({
              operation: "logs",
              threadId,
              cause: "Provider log cleanup is unavailable.",
            });
          yield* remove(threadId, { keepSharedLegacyLog });
        },
        Effect.mapError((cause) => new ResourceCleanupError({ operation: "logs", cause })),
      ),
    };
  }),
);
