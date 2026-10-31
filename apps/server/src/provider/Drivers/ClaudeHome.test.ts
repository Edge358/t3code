import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import {
  makeClaudeCapabilitiesCacheKey,
  makeClaudeContinuationGroupKey,
  makeClaudeEnvironment,
  resolveClaudeHomePath,
} from "./ClaudeHome.ts";

it.layer(NodeServices.layer)("ClaudeHome", (it) => {
  describe("Claude home resolution", () => {
    it.effect("forces optional traffic off while preserving provider credentials and home", () =>
      Effect.gen(function* () {
        const baseEnv = {
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "0",
          DISABLE_TELEMETRY: "0",
          DISABLE_ERROR_REPORTING: "0",
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_SDK_DISABLED: "false",
          ANTHROPIC_API_KEY: "synthetic-test-key",
          CLAUDE_CONFIG_DIR: "/synthetic/claude",
        };
        for (const homePath of ["", "~/.claude-work"]) {
          const env = yield* makeClaudeEnvironment({ homePath }, baseEnv);
          expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
          expect(env.DISABLE_TELEMETRY).toBe("1");
          expect(env.DISABLE_ERROR_REPORTING).toBe("1");
          expect(env.DISABLE_AUTOUPDATER).toBe("1");
          expect(env.DO_NOT_TRACK).toBe("1");
          expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("0");
          expect(env.OTEL_SDK_DISABLED).toBe("true");
          expect(env.ANTHROPIC_API_KEY).toBe(baseEnv.ANTHROPIC_API_KEY);
          if (!homePath) expect(env.CLAUDE_CONFIG_DIR).toBe(baseEnv.CLAUDE_CONFIG_DIR);
        }
        expect(baseEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("0");
      }),
    );
    it.effect("resolves configured Claude HOME and stamps continuation/cache keys with it", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const homePath = "~/.claude-work";
        const resolved = path.resolve(NodeOS.homedir(), ".claude-work");

        expect(yield* resolveClaudeHomePath({ homePath })).toBe(resolved);
        expect((yield* makeClaudeEnvironment({ homePath })).CLAUDE_CONFIG_DIR).toBe(resolved);
        expect(yield* makeClaudeContinuationGroupKey({ homePath })).toBe(`claude:home:${resolved}`);
        expect(yield* makeClaudeCapabilitiesCacheKey({ binaryPath: "claude", homePath })).toBe(
          `claude\0${resolved}\0`,
        );
      }),
    );

    it.effect("uses inherited CLAUDE_CONFIG_DIR when homePath is empty", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const inherited = path.resolve("/tmp/claude-inherited");
        const environment = { CLAUDE_CONFIG_DIR: inherited };

        expect(yield* resolveClaudeHomePath({ homePath: "" }, environment)).toBe(inherited);
        expect(yield* makeClaudeContinuationGroupKey({ homePath: "" }, environment)).toBe(
          `claude:home:${inherited}`,
        );

        const explicit = path.resolve(NodeOS.homedir(), ".claude-work");
        expect(yield* resolveClaudeHomePath({ homePath: "~/.claude-work" }, environment)).toBe(
          explicit,
        );
      }),
    );

    it.effect("separates capability probes by cwd", () =>
      Effect.gen(function* () {
        const config = { binaryPath: "claude", homePath: "" };
        const first = yield* makeClaudeCapabilitiesCacheKey(config, "/repo-a");
        const second = yield* makeClaudeCapabilitiesCacheKey(config, "/repo-b");
        expect(first).not.toBe(second);
      }),
    );
  });
});
