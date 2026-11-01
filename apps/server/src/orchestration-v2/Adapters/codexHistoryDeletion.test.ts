import { assert, it } from "@effect/vitest";
import { CodexAppServerRequestError } from "effect-codex-app-server/errors";
import * as Effect from "effect/Effect";
import { deleteCodexHistory } from "./codexHistoryDeletion.ts";

it.effect.each(["root", "archived-child", "none"] as const)(
  "protects %s while checking every descendant page before deleting",
  (protectedId) =>
    Effect.gen(function* () {
      const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
      const request = (method: string, params: Record<string, unknown>) =>
        Effect.sync(() => {
          calls.push({ method, params });
          if (method === "thread/delete") return {};
          if (params.archived === false) return { data: [], nextCursor: null };
          return params.cursor === null
            ? { data: [{ id: "child" }], nextCursor: "page-2" }
            : { data: [{ id: "archived-child" }], nextCursor: null };
        });
      const client = { raw: { request } } as Parameters<typeof deleteCodexHistory>[0];
      const outcome = yield* deleteCodexHistory(
        client,
        "root",
        protectedId === "none" ? [] : [protectedId],
      );
      assert.equal(outcome, protectedId === "none" ? "deleted" : "retained");
      assert.equal(
        calls.some((call) => call.method === "thread/delete"),
        protectedId === "none",
      );
      if (protectedId !== "root") {
        assert.equal(calls.filter((call) => call.method === "thread/list").length, 3);
        assert.include(calls[0]!.params.sourceKinds, "subAgentThreadSpawn");
      }
    }),
);

it.effect("does not delete when descendant pagination cannot be completed", () =>
  Effect.gen(function* () {
    let deleted = false;
    const client = {
      raw: {
        request: (method: string) =>
          Effect.sync(() => {
            if (method === "thread/delete") deleted = true;
            return { data: [], nextCursor: "repeated" };
          }),
      },
    } as Parameters<typeof deleteCodexHistory>[0];
    const result = yield* deleteCodexHistory(client, "root", []).pipe(Effect.result);
    assert.equal(result._tag, "Failure");
    assert.isFalse(deleted);
  }),
);

it.effect.each([
  "no rollout found for thread id root",
  "permission denied",
  "no rollout found for thread id another",
])("only treats the exact native already-absent response as success: %s", (errorMessage) =>
  Effect.gen(function* () {
    const client = {
      raw: {
        request: (method: string) =>
          method === "thread/list"
            ? Effect.succeed({ data: [], nextCursor: null })
            : Effect.fail(new CodexAppServerRequestError({ code: -32600, errorMessage })),
      },
    } as Parameters<typeof deleteCodexHistory>[0];
    const result = yield* deleteCodexHistory(client, "root", []).pipe(Effect.result);
    assert.equal(
      result._tag,
      errorMessage === "no rollout found for thread id root" ? "Success" : "Failure",
    );
    if (result._tag === "Success") assert.equal(result.success, "absent");
  }),
);
