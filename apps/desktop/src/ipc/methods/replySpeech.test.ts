import { it } from "@effect/vitest";
import { beforeEach, expect, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import { DesktopClientSettings } from "../../settings/DesktopClientSettings.ts";
import { ElectronWindow } from "../../electron/ElectronWindow.ts";
import { postReplySpeech } from "../../app/replySpeech.ts";
import { speakReply } from "./replySpeech.ts";

vi.mock("../../app/replySpeech.ts", () => ({
  postReplySpeech: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => vi.clearAllMocks());
const input = { text: "reply", source: "codex", session: "test" };
function invoke(enabled: boolean, senderId = 7, test = false) {
  return speakReply.handler({ ...input, test }, { sender: { id: senderId } }).pipe(
    Effect.provideService(DesktopClientSettings, {
      get: Effect.succeedSome({
        ...DEFAULT_CLIENT_SETTINGS,
        readRepliesAloud: enabled,
        speechServiceAddress: "http://127.0.0.1:8011/say",
      }),
      set: () => Effect.void,
    }),
    Effect.provideService(ElectronWindow, {
      main: Effect.succeedSome({ webContents: { id: 7 } }),
    } as unknown as ElectronWindow["Service"]),
  );
}
it.effect("makes no speech request when automatic speech is off", () =>
  Effect.gen(function* () {
    yield* invoke(false);
    expect(postReplySpeech).not.toHaveBeenCalled();
  }),
);
it.effect("allows an explicit fixed test sentence while automatic speech is off", () =>
  Effect.gen(function* () {
    yield* invoke(false, 7, true);
    expect(postReplySpeech).toHaveBeenCalledWith(
      "http://127.0.0.1:8011/say",
      expect.objectContaining({ text: "T3 Code speech test. Reading replies aloud is ready." }),
    );
  }),
);
it.effect("rejects a request from a browser preview or another renderer", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(invoke(true, 99));
    expect(exit._tag).toBe("Failure");
    expect(postReplySpeech).not.toHaveBeenCalled();
  }),
);
