import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { DesktopConfig, layerTest } from "./DesktopConfig.ts";

it.effect("keeps app updates disabled even when the environment requests them", () =>
  Effect.gen(function* () {
    const config = yield* DesktopConfig.pipe(
      Effect.provide(
        layerTest({
          T3CODE_DISABLE_AUTO_UPDATE: "false",
        }),
      ),
    );
    expect(config.disableAutoUpdate).toBe(true);
  }),
);
