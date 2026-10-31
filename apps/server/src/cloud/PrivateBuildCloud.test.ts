import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { makeRelayUrlConfig, resolveRelayClientTracingConfig } from "./publicConfig.ts";
import {
  isAgentActivityPublishingEnabledValue,
  readAgentActivityPublishingActive,
} from "./config.ts";
import type * as ServerSecretStore from "../auth/ServerSecretStore.ts";

describe("private build cloud restrictions", () => {
  it.effect("rejects inherited relay configuration", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        makeRelayUrlConfig("https://relay.invalid").pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromEnvRecord({ T3CODE_RELAY_URL: "https://override.invalid" }),
            ),
          ),
        ),
      );
      expect(exit._tag).toBe("Failure");
      expect(resolveRelayClientTracingConfig({ T3CODE_TELEMETRY_ENABLED: "true" })).toBeNull();
    }),
  );
  it.effect("does not read credentials or publish activity when a saved setting enables it", () =>
    Effect.gen(function* () {
      expect(isAgentActivityPublishingEnabledValue("true")).toBe(false);
      const secrets = new Proxy(
        {},
        {
          get: () => {
            throw new Error("Credentials must not be read");
          },
        },
      ) as ServerSecretStore.ServerSecretStore["Service"];
      expect(yield* readAgentActivityPublishingActive(secrets)).toBe(false);
    }),
  );
});
