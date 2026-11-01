import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as CodexClient from "effect-codex-app-server/client";

const HistoryPage = Schema.Struct({
  data: Schema.Array(Schema.Struct({ id: Schema.String })),
  nextCursor: Schema.NullOr(Schema.String),
});
const decodePage = Schema.decodeUnknownEffect(HistoryPage);

class CodexHistoryCursorError extends Schema.TaggedError<CodexHistoryCursorError>()(
  "CodexHistoryCursorError",
  {},
) {}

export const deleteCodexHistory = Effect.fn("CodexAdapterV2.deleteHistory")(function* (
  client: { readonly raw: Pick<CodexClient.CodexAppServerClient["Service"]["raw"], "request"> },
  threadId: string,
  protectedNativeIds: ReadonlyArray<string>,
) {
  const protectedIds = new Set(protectedNativeIds);
  if (protectedIds.has(threadId)) return "retained" as const;
  // Native deletion cascades, including archived children omitted by ordinary listings.
  for (const archived of [false, true]) {
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      const page: typeof HistoryPage.Type = yield* client.raw
        .request("thread/list", {
          ancestorThreadId: threadId,
          archived,
          cursor,
          limit: 100,
          modelProviders: [],
          sourceKinds: [
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
          ],
        })
        .pipe(Effect.flatMap(decodePage));
      if (page.data.some((thread) => protectedIds.has(thread.id))) return "retained" as const;
      cursor = page.nextCursor;
      if (cursor !== null) {
        if (cursors.has(cursor)) return yield* new CodexHistoryCursorError({});
        cursors.add(cursor);
      }
    } while (cursor !== null);
  }
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
