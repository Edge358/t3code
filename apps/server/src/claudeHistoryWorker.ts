import { forkSession, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";
import * as Schema from "effect/Schema";
import { deleteClaudeHistory } from "./claudeHistoryDeletion.ts";

// Bundled import.meta.main is always true; imports must have no side effects.
const decodeHistoryOptions = Schema.decodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      dir: Schema.optionalKey(Schema.String),
      protectedNativeIds: Schema.optionalKey(Schema.Array(Schema.String)),
      includeSystemMessages: Schema.optionalKey(Schema.Boolean),
      upToMessageId: Schema.optionalKey(Schema.String),
    }),
  ),
);

export async function runClaudeHistoryWorker(
  method: string | undefined,
  sessionId: string | undefined,
  rawOptions: string | undefined,
): Promise<void> {
  const options = decodeHistoryOptions(rawOptions ?? "{}");
  if (!sessionId) throw new Error("Claude history session id is required.");
  const result =
    method === "deleteSession"
      ? await deleteClaudeHistory(sessionId, options.protectedNativeIds)
      : method === "getSessionMessages"
        ? await getSessionMessages(sessionId, options)
        : method === "forkSession"
          ? await forkSession(sessionId, options).then(async (forked) => {
              const headMessageId = await getSessionMessages(forked.sessionId, options)
                .then((messages) => messages.at(-1)?.uuid)
                .catch(() => undefined);
              return headMessageId === undefined ? forked : { ...forked, headMessageId };
            })
          : (() => {
              throw new Error("Unknown Claude history operation.");
            })();
  process.stdout.write(JSON.stringify(result));
}
