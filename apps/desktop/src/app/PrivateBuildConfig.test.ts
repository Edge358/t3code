import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { DesktopConfig, layerTest } from "./DesktopConfig.ts";

it.effect("lets a launcher relocate the desktop profile without redirecting APPDATA", () =>
  Effect.gen(function* () {
    const config = yield* DesktopConfig.pipe(
      Effect.provide(
        layerTest({
          T3CODE_DESKTOP_APP_DATA: "E:\\private\\appdata",
          APPDATA: "C:\\Users\\someone\\AppData\\Roaming",
        }),
      ),
    );
    expect(config.appDataDirectory).toEqual(Option.some("E:\\private\\appdata"));
    const inherited = yield* DesktopConfig.pipe(
      Effect.provide(layerTest({ APPDATA: "C:\\Users\\someone\\AppData\\Roaming" })),
    );
    expect(inherited.appDataDirectory).toEqual(Option.some("C:\\Users\\someone\\AppData\\Roaming"));
  }),
);

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
