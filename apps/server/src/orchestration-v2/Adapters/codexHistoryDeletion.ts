import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as CodexClient from "effect-codex-app-server/client";

const HistoryPage = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      parentThreadId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
  nextCursor: Schema.NullOr(Schema.String),
});
type HistoryItem = (typeof HistoryPage.Type)["data"][number];
const decodePage = Schema.decodeUnknownEffect(HistoryPage);

class CodexHistoryCursorError extends Schema.TaggedError<CodexHistoryCursorError>()(
  "CodexHistoryCursorError",
  {},
) {}

type HistoryClient = {
  readonly raw: Pick<CodexClient.CodexAppServerClient["Service"]["raw"], "request">;
};

const ALL_SOURCE_KINDS = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown",
];

// `ancestorThreadId` is newer than the vendored protocol schema. No thread can have this
// id, so a non-empty answer means the installed Codex ignores the filter and lists everything.
const ANCESTOR_PROBE_ID = "00000000-0000-4000-8000-000000000000";

const listPage = (
  client: HistoryClient,
  input: {
    readonly ancestorThreadId?: string;
    readonly archived: boolean;
    readonly cursor: string | null;
    readonly limit: number;
  },
) =>
  client.raw
    .request("thread/list", {
      ...input,
      modelProviders: [],
      sourceKinds: ALL_SOURCE_KINDS,
    })
    .pipe(Effect.flatMap(decodePage));

const honorsAncestorFilter = (client: HistoryClient, archived: boolean) =>
  listPage(client, {
    ancestorThreadId: ANCESTOR_PROBE_ID,
    archived,
    cursor: null,
    limit: 1,
  }).pipe(
    Effect.map((page) => page.data.length === 0),
    // A rejected probe is answered by the real listing below, whose errors surface as a failure.
    Effect.orElseSucceed(() => true),
  );

const listAll = Effect.fn("codexHistoryDeletion.listAll")(function* (
  client: HistoryClient,
  input: { readonly archived: boolean; readonly ancestorThreadId?: string },
) {
  const items: HistoryItem[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const page: typeof HistoryPage.Type = yield* listPage(client, { ...input, cursor, limit: 100 });
    items.push(...page.data);
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (cursors.has(cursor)) return yield* new CodexHistoryCursorError({});
      cursors.add(cursor);
    }
  } while (cursor !== null);
  return items;
});

/** Descendants by parent links, for a Codex whose listing cannot filter by ancestor. */
const descendantsOf = (rootId: string, items: ReadonlyArray<HistoryItem>) => {
  const children = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parentThreadId) continue;
    const siblings = children.get(item.parentThreadId) ?? [];
    siblings.push(item.id);
    children.set(item.parentThreadId, siblings);
  }
  const found = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of children.get(queue.pop()!) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
};

export const deleteCodexHistory = Effect.fn("codexHistoryDeletion.deleteCodexHistory")(function* (
  client: HistoryClient,
  threadId: string,
  protectedNativeIds: ReadonlyArray<string>,
) {
  const protectedIds = new Set(protectedNativeIds);
  if (protectedIds.has(threadId)) return "retained" as const;
  // Native deletion cascades, including archived children omitted by ordinary listings.
  const honored = (yield* Effect.forEach([false, true], (archived) =>
    honorsAncestorFilter(client, archived),
  )).every(Boolean);
  const history: HistoryItem[] = [];
  for (const archived of [false, true]) {
    const items = yield* listAll(
      client,
      honored ? { archived, ancestorThreadId: threadId } : { archived },
    );
    if (honored && items.some((item) => protectedIds.has(item.id))) return "retained" as const;
    history.push(...items);
  }
  // A parent chain can cross the archive boundary more than once.
  if (!honored)
    for (const id of descendantsOf(threadId, history))
      if (protectedIds.has(id)) return "retained" as const;
  return yield* client.raw.request("thread/delete", { threadId }).pipe(
    Effect.as("deleted" as const),
    Effect.catchTags({
      CodexAppServerRequestError: (error) =>
        error.code === -32600 && error.errorMessage === `no rollout found for thread id ${threadId}`
          ? Effect.succeed("absent" as const)
          : Effect.fail(error),
    }),
  );
});
