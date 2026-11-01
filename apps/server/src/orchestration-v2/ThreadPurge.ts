import { OrchestrationV2AppThreadJson, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/sql/SqlClient";

const decodeThread = Schema.decodeUnknownEffect(
  Schema.fromJsonString(OrchestrationV2AppThreadJson),
);
const encodeThread = Schema.encodeEffect(Schema.fromJsonString(OrchestrationV2AppThreadJson));

export const descendantThreadIds = Effect.fn("ThreadPurge.descendantThreadIds")(function* (
  sql: SqlClient.SqlClient,
  threadId: ThreadId,
) {
  const rows = yield* sql<{ thread_id: string; parent_id: string | null }>`
    WITH RECURSIVE descendants(thread_id) AS (
      SELECT ${threadId}
      UNION
      SELECT t.thread_id FROM orchestration_v2_projection_threads t
      JOIN descendants d ON json_extract(t.payload_json, '$.lineage.parentThreadId') = d.thread_id
        OR (json_extract(t.payload_json, '$.lineage.parentThreadId') IS NULL
          AND json_extract(t.payload_json, '$.lineage.rootThreadId') = d.thread_id)
    )
    SELECT t.thread_id, json_extract(t.payload_json, '$.lineage.parentThreadId') AS parent_id FROM descendants d JOIN orchestration_v2_projection_threads t USING(thread_id)
    WHERE t.thread_id <> ${threadId} AND COALESCE(json_extract(t.payload_json, '$.historyDeletion.purged'), 0) = 0
  `;
  const children = new Map<string, string[]>();
  const members = new Set(rows.map((row) => row.thread_id));
  for (const row of rows) {
    const parent = row.parent_id !== null && members.has(row.parent_id) ? row.parent_id : threadId;
    children.set(parent, [...(children.get(parent) ?? []), row.thread_id]);
  }
  const result: ThreadId[] = [];
  const seen = new Set<string>([threadId]);
  const visit = (parent: string) => {
    for (const child of children.get(parent) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      visit(child);
      result.push(ThreadId.make(child));
    }
  };
  visit(threadId);
  return result;
});

// Final deletion and content removal commit together; running outbox leases settle afterward.
export const purgeCompletedThreads = Effect.fn("ThreadPurge.purgeCompletedThreads")(function* (
  sql: SqlClient.SqlClient,
  threadIds: ReadonlyArray<string>,
) {
  for (const threadId of threadIds) {
    const rows = yield* sql<{
      payload_json: string;
    }>`SELECT payload_json FROM orchestration_v2_projection_threads
      WHERE thread_id = ${threadId} AND deleted_at IS NOT NULL
        AND json_extract(payload_json, '$.historyDeletion.status') = 'complete'
        AND COALESCE(json_extract(payload_json, '$.historyDeletion.purged'), 0) = 0`;
    if (!rows[0]) continue;
    const thread = yield* decodeThread(rows[0].payload_json);
    const payload = yield* encodeThread({
      id: thread.id,
      projectId: thread.projectId,
      title: "Deleted conversation",
      providerInstanceId: thread.providerInstanceId,
      modelSelection: { instanceId: thread.providerInstanceId, model: "deleted" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, rootThreadId: thread.id, relationshipToParent: null },
      forkedFrom: null,
      createdBy: "system",
      creationSource: "server",
      createdAt: thread.deletedAt!,
      updatedAt: thread.deletedAt!,
      deletedAt: thread.deletedAt,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      historyDeletion: {
        requestId: thread.historyDeletion!.requestId,
        status: "complete",
        message:
          "Conversation deleted. Shared resources and unsupported provider histories are kept.",
        targets: [],
        purged: true,
      },
    });
    // Keep replay anchors and their sequence numbers; neither retains conversation content.
    yield* sql`DELETE FROM orchestration_events WHERE aggregate_kind = 'thread' AND stream_id = ${threadId}
      AND sequence NOT IN (
        SELECT MIN(sequence) FROM orchestration_events WHERE stream_id = ${threadId} AND event_type = 'thread.created'
        UNION SELECT MAX(sequence) FROM orchestration_events WHERE stream_id = ${threadId} AND event_type = 'thread.deleted'
      )`;
    yield* sql`UPDATE orchestration_events SET payload_json = ${payload}, metadata_json = '{"applicationEventVersion":2}',
      command_id = NULL, correlation_id = NULL, causation_event_id = NULL, actor_kind = 'server'
      WHERE aggregate_kind = 'thread' AND stream_id = ${threadId}`;
    const tables = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'
      AND (name GLOB 'orchestration_v2_projection_*' OR name IN (
        'orchestration_v2_turn_item_positions', 'orchestration_v2_events', 'orchestration_v2_command_receipts',
        'orchestration_v2_thread_launch_workflows', 'orchestration_v2_legacy_imports', 'mcp_app_model_context', 'provider_session_runtime',
        'projection_thread_messages', 'projection_thread_sessions', 'projection_thread_pull_requests', 'projection_threads'
      ))`;
    for (const { name } of tables) {
      if (name === "orchestration_v2_projection_threads") continue;
      const columns = yield* sql<{ name: string }>`SELECT name FROM pragma_table_info(${name})`;
      if (columns.some((column) => column.name === "thread_id"))
        yield* sql`DELETE FROM ${sql(name)} WHERE thread_id = ${threadId}`;
    }
    yield* sql`DELETE FROM orchestration_v2_projection_context_transfers WHERE source_thread_id = ${threadId} OR target_thread_id = ${threadId}`;
    yield* sql`DELETE FROM orchestration_command_receipts WHERE aggregate_kind = 'thread' AND aggregate_id = ${threadId}`;
    yield* sql`DELETE FROM orchestration_v2_effect_outbox WHERE thread_id = ${threadId} AND status NOT IN ('pending', 'running')`;
    yield* sql`UPDATE orchestration_v2_projection_threads SET title = 'Deleted conversation', payload_json = ${payload},
      active_provider_thread_id = NULL, archived_at = NULL, runtime_mode = 'full-access', interaction_mode = 'default',
      created_at = deleted_at, updated_at = deleted_at WHERE thread_id = ${threadId}`;
  }
});
