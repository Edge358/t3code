import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { expect } from "vite-plus/test";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import { HttpClientError } from "effect/http";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";
import { readClaudePlanUsage } from "./claudePlanUsage.ts";
import { claudeUsageResponseToLimits } from "./claudeUsageLimits.ts";
import { resolveClaudeConfigDirPath } from "./Drivers/ClaudeSkills.ts";

const login = (token?: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped();
    if (token)
      yield* fs.writeFileString(
        path.join(dir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: token } }),
      );
    return dir;
  });
const read = (dir: string, client: HttpClient.HttpClient) =>
  readClaudePlanUsage(dir, "2.1.316").pipe(
    Effect.provideService(HostProcess.Platform, "win32"),
    Effect.provideService(HttpClient.HttpClient, client),
  );

it.layer(NodeServices.layer)("private Claude plan usage", (it) => {
  it.effect("resolves an inherited relative login folder against the probe cwd", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const probeCwd = yield* fs.makeTempDirectoryScoped();
      const selectedDir = path.join(probeCwd, "account");
      yield* fs.makeDirectory(selectedDir);
      yield* fs.writeFileString(
        path.join(selectedDir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: "probe-account" } }),
      );
      const resolved = yield* resolveClaudeConfigDirPath(
        { homePath: "" },
        { CLAUDE_CONFIG_DIR: "account" },
        probeCwd,
      );
      expect(resolved).toBe(selectedDir);
      const result = yield* read(
        resolved,
        HttpClient.make((request) =>
          Effect.sync(() => {
            expect(request.headers.authorization).toBe("Bearer probe-account");
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ seven_day: { utilization: 27, resets_at: null } }),
            );
          }),
        ),
      );
      expect("usage" in result).toBe(true);
      const explicitDir = yield* login("explicit-account");
      expect(
        yield* resolveClaudeConfigDirPath(
          { homePath: explicitDir },
          { CLAUDE_CONFIG_DIR: "account" },
          probeCwd,
        ),
      ).toBe(path.resolve(explicitDir));
    }),
  );
  it.effect("reports connection failure without exposing credentials or raw errors", () =>
    Effect.gen(function* () {
      const dir = yield* login("secret-test-token");
      const result = yield* read(
        dir,
        HttpClient.make((request) =>
          Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({
                request,
                cause: "private transport details",
              }),
            }),
          ),
        ),
      );
      expect(result).toEqual({ message: expect.stringContaining("connection") });
      expect(JSON.stringify(result)).not.toMatch(/secret-test-token|private transport/);
    }),
  );
  it.effect("uses the selected login and maps only returned usage without redirects", () =>
    Effect.gen(function* () {
      const dir = yield* login("selected-account");
      yield* login("another-account");
      const client = HttpClient.make((request, _url, _signal, fiber) =>
        Effect.sync(() => {
          expect(request.method).toBe("GET");
          expect(request.url).toBe("https://api.anthropic.com/api/oauth/usage");
          expect(request.body._tag).toBe("Empty");
          expect(request.headers.authorization).toBe("Bearer selected-account");
          expect(request.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
          expect(Context.getOrUndefined(fiber.context, FetchHttpClient.RequestInit)?.redirect).toBe(
            "manual",
          );
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              five_hour: null,
              seven_day: { utilization: 27, resets_at: "2026-11-04T00:00:00Z" },
              spend: {
                enabled: true,
                used: { amount_minor: 25, currency: "USD", exponent: 2 },
                limit: { amount_minor: 100, currency: "USD", exponent: 2 },
              },
            }),
          );
        }),
      );
      const result = yield* read(dir, client);
      expect("usage" in result).toBe(true);
      if ("usage" in result) {
        const mapped = claudeUsageResponseToLimits({
          checkedAt: "2026-10-31T00:00:00Z",
          response: result.usage,
        });
        expect(mapped.limits.windows.map((w) => [w.id, w.usedPercent])).toEqual([
          ["seven_day", 27],
          ["monthly_spend", 25],
        ]);
      }
    }),
  );

  it.effect.each([
    { status: 401, text: "Sign in" },
    { status: 403, text: "refused" },
    { status: 429, text: "rate limiting" },
    { status: 500, text: "Try again later" },
    { status: 302, text: "could not return" },
  ])("reports $status without exposing response details", ({ status, text }) =>
    Effect.gen(function* () {
      const dir = yield* login("selected-account");
      const result = yield* read(
        dir,
        HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ error: "private response" }, { status }),
            ),
          ),
        ),
      );
      expect(result).toEqual({ message: expect.stringContaining(text) });
      expect(JSON.stringify(result)).not.toContain("private response");
    }),
  );

  it.effect("does not request without a login or fall back to another home", () =>
    Effect.gen(function* () {
      yield* login("other");
      const result = yield* read(
        yield* login(),
        HttpClient.make(() => Effect.die("must not request")),
      );
      expect(result).toEqual({ message: expect.stringContaining("local subscription login") });
    }),
  );

  it.effect.each([{}, { seven_day: { utilization: "wrong", resets_at: null } }])(
    "rejects malformed usage",
    (body) =>
      Effect.gen(function* () {
        const result = yield* read(
          yield* login("selected"),
          HttpClient.make((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(body))),
          ),
        );
        expect("message" in result).toBe(true);
      }),
  );

  it.effect("stops a stalled request after five seconds", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const dir = yield* login("selected");
      const client = HttpClient.make(() =>
        Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
      );
      const pending = yield* Effect.forkChild(read(dir, client));
      yield* Deferred.await(started);
      yield* TestClock.adjust("5 seconds");
      expect(yield* Fiber.join(pending)).toEqual({ message: expect.stringContaining("timed out") });
    }),
  );
});
