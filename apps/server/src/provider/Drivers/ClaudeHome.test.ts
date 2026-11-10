import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  makeClaudeCapabilitiesCacheKey,
  makeClaudeContinuationGroupKey,
  makeClaudeEnvironment,
  mergeClaudeProcessEnvironment,
  resolveClaudeHomePath,
} from "./ClaudeHome.ts";
import { readClaudeSettingsEnv } from "./ClaudeSkills.ts";

it.layer(NodeServices.layer)("ClaudeHome", (it) => {
  describe("Claude home resolution", () => {
    it.effect(
      "isolates Claude identity and honors instance and settings overrides without losing privacy",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const homePath = yield* fs.makeTempDirectoryScoped({ prefix: "t3-claude-identity-" });
          const host = {
            CLAUDE_CODE_ENTRYPOINT: "claude-desktop",
            CLAUDECODE: "1",
            CLAUDE_CODE_SESSION_ID: "host-session",
            CLAUDE_CODE_HOST_SESSION_ID: "host-parent",
            CLAUDE_CODE_CHILD_SESSION: "1",
            CLAUDE_CODE_SESSION_ATTENDED: "1",
            CLAUDE_CODE_MESSAGING_SOCKET: "host-socket",
            CLAUDE_CODE_MESSAGING_TOKEN: "synthetic-host-token",
            CLAUDE_CODE_EXECPATH: "host-executable",
            CLAUDE_CODE_DESKTOP_APP_VERSION: "host-version",
            CLAUDE_EFFORT: "high",
            CLAUDE_PID: "123",
            CLAUDE_AGENT_SDK_VERSION: "host-sdk",
            CLAUDE_CODE_SHELL: "user-shell",
            CLAUDE_ENV_FILE: "user-env-file",
            ANTHROPIC_API_KEY: "synthetic-test-key",
            ANTHROPIC_BASE_URL: "http://127.0.0.1:1",
            DISABLE_TELEMETRY: "0",
          };
          const originalHost = { ...host };
          const kept = {
            CLAUDE_CODE_ENTRYPOINT: "t3-code",
            CLAUDE_CODE_SHELL: host.CLAUDE_CODE_SHELL,
            CLAUDE_ENV_FILE: host.CLAUDE_ENV_FILE,
            ANTHROPIC_API_KEY: host.ANTHROPIC_API_KEY,
            ANTHROPIC_BASE_URL: host.ANTHROPIC_BASE_URL,
            DISABLE_TELEMETRY: "0",
          };
          expect(yield* mergeClaudeProcessEnvironment({ homePath }, undefined, {})).toEqual({
            CLAUDE_CODE_ENTRYPOINT: "t3-code",
          });
          expect(yield* mergeClaudeProcessEnvironment({ homePath }, undefined, host)).toEqual(kept);
          for (const instanceValue of ["instance", ""]) {
            const instance = [
              { name: "CLAUDE_CODE_ENTRYPOINT", value: instanceValue, sensitive: false },
              { name: "CLAUDE_EFFORT", value: "low", sensitive: false },
              { name: "DISABLE_TELEMETRY", value: "0", sensitive: false },
            ];
            for (const settingsValue of [undefined, "settings", ""]) {
              yield* fs.writeFileString(
                path.join(homePath, "settings.json"),
                JSON.stringify({ env: { CLAUDE_CODE_ENTRYPOINT: settingsValue } }),
              );
              const merged = yield* mergeClaudeProcessEnvironment({ homePath }, instance, host);
              expect(merged).toEqual({
                ...kept,
                CLAUDE_CODE_ENTRYPOINT: settingsValue || instanceValue,
                CLAUDE_EFFORT: "low",
              });
              const launch = yield* makeClaudeEnvironment({ homePath }, merged);
              expect(launch.CLAUDE_CODE_ENTRYPOINT).toBe(settingsValue || instanceValue);
              expect(launch.DISABLE_TELEMETRY).toBe("1");
              expect(launch.DISABLE_ERROR_REPORTING).toBe("1");
              expect(launch.DISABLE_AUTOUPDATER).toBe("1");
              expect(launch.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
              expect(launch.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("0");
              expect(launch.CLAUDE_CONFIG_DIR).toBe(homePath);
            }
          }
          yield* fs.writeFileString(
            path.join(homePath, "settings.json"),
            '{"env":{"ANTHROPIC_BASE_URL":"http://127.0.0.1:2","CLAUDE_CODE_ENTRYPOINT":"configured"}}',
          );
          expect(yield* readClaudeSettingsEnv({ homePath }, undefined, host)).toEqual({
            ANTHROPIC_BASE_URL: "http://127.0.0.1:2",
            CLAUDE_CODE_ENTRYPOINT: "configured",
          });
          expect(
            (yield* mergeClaudeProcessEnvironment({ homePath: "" }, undefined, {
              ...host,
              CLAUDE_CONFIG_DIR: homePath,
            })).CLAUDE_CODE_ENTRYPOINT,
          ).toBe("configured");
          yield* fs.writeFileString(path.join(homePath, "settings.json"), "invalid JSON");
          expect(yield* mergeClaudeProcessEnvironment({ homePath }, undefined, host)).toEqual(kept);
          expect(host).toEqual(originalHost);
        }),
    );
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
          expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("0");
          // Generic opt-outs would reach the agent's tool processes; leave them as inherited.
          expect(env.OTEL_SDK_DISABLED).toBe(baseEnv.OTEL_SDK_DISABLED);
          expect(env.DO_NOT_TRACK).toBeUndefined();
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

  it.effect(
    "drops the launching Claude session and Electron's run-as-Node flag, and labels processes t3-code unless overridden",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const homePath = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-claude-home-" });
        const host = {
          CLAUDE_CODE_ENTRYPOINT: "claude-desktop",
          CLAUDECODE: "1",
          CLAUDE_CODE_SESSION_ID: "host-session",
          CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/host-claude.sock",
          CLAUDE_EFFORT: "high",
          ELECTRON_RUN_AS_NODE: "1",
          KEEP: "1",
        };
        const instance = [
          { name: "CLAUDE_CODE_ENTRYPOINT", value: "instance", sensitive: false },
          { name: "CLAUDE_EFFORT", value: "low", sensitive: false },
        ];

        expect(yield* mergeClaudeProcessEnvironment({ homePath }, undefined, host)).toEqual({
          CLAUDE_CODE_ENTRYPOINT: "t3-code",
          KEEP: "1",
        });
        expect(yield* mergeClaudeProcessEnvironment({ homePath }, instance, host)).toEqual({
          CLAUDE_CODE_ENTRYPOINT: "instance",
          CLAUDE_EFFORT: "low",
          KEEP: "1",
        });

        yield* fileSystem.writeFileString(
          path.join(homePath, "settings.json"),
          JSON.stringify({ env: { CLAUDE_CODE_ENTRYPOINT: "custom" } }),
        );
        expect(
          (yield* mergeClaudeProcessEnvironment({ homePath }, instance, host))
            .CLAUDE_CODE_ENTRYPOINT,
        ).toBe("custom");
      }),
  );
});
