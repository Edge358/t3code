import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { privateBuildPolicy } from "./privateBuildPolicy.ts";
import * as OtelEnvironment from "./otelEnvironment.ts";
import { faviconUrlForOrigin, toolActivityFaviconUrl } from "./favicon.ts";

describe("private build restrictions", () => {
  it("keeps reports, cloud services, remote icons, and automatic downloads off", () => {
    expect(Object.values(privateBuildPolicy).every((allowed) => allowed === false)).toBe(true);
    expect(Object.isFrozen(privateBuildPolicy)).toBe(true);
  });

  it.effect("cannot enable diagnostic or relay exports using environment overrides", () =>
    Effect.gen(function* () {
      const env = {
        T3CODE_TELEMETRY_ENABLED: "true",
        T3CODE_OTEL_SDK_DISABLED: "false",
        OTEL_SDK_DISABLED: "false",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://collector.invalid",
      };
      const resolved = yield* OtelEnvironment.load.pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
      );
      expect(resolved.disabled).toBe(true);
      expect(OtelEnvironment.isRelayTracingEnabled(env)).toBe(false);
      expect(
        OtelEnvironment.resolveSignalEndpoint(
          resolved,
          "traces",
          {
            url: "https://collector.invalid",
            export: { protocol: "http/json", exportIntervalMs: 1000, headers: {} },
          },
          { bootstrapUrl: "https://fallback.invalid", settingsUrl: undefined },
        ),
      ).toBeUndefined();
    }),
  );

  it("never produces an external favicon URL, including provider-supplied icons", () => {
    expect(faviconUrlForOrigin("https://private-project.example/path")).toBeNull();
    for (const theme of ["light", "dark"] as const) {
      expect(
        toolActivityFaviconUrl(
          {
            pageUrl: "https://github.com/private/repository",
            faviconUrl: "https://tracker.example/icon?id=secret",
            faviconUrlDark: "https://tracker.example/dark",
          },
          theme,
        ),
      ).toBeNull();
    }
  });
});
