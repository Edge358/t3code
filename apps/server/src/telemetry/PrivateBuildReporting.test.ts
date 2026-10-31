// @effect-diagnostics unsafeEffectTypeAssertion:off - Deliberately omit I/O services to prove the disabled path never acquires them.
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Analytics from "./AnalyticsService.ts";
import { getServerOwnersForHome, getTelemetryIdentityForHome } from "./Identify.ts";

// Intentionally omit filesystem, identity, HTTP, and crypto services. Any attempt to
// acquire them fails the test instead of touching the developer's credentials/network.
function withoutIo<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect as Effect.Effect<A, E>;
}

describe("private build analytics", () => {
  it.effect("does not acquire identities or I/O even when reporting is explicitly enabled", () =>
    Effect.gen(function* () {
      const service = yield* withoutIo(
        Effect.scoped(Analytics.make).pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromEnvRecord({
                T3CODE_TELEMETRY_ENABLED: "true",
                T3CODE_POSTHOG_HOST: "https://collector.invalid",
              }),
            ),
          ),
        ),
      );
      yield* withoutIo(service.record("test", { prompt: "synthetic secret" }));
      yield* withoutIo(
        service.recordOwners([{ source: "openai", ownerId: "synthetic" }], "server"),
      );
      yield* withoutIo(service.flush);
      expect(yield* withoutIo(getTelemetryIdentityForHome("unused"))).toEqual({
        distinctId: null,
        installId: null,
      });
      expect(yield* withoutIo(getServerOwnersForHome("unused"))).toEqual([]);
    }),
  );
});
