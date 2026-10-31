import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { postReplySpeech } from "../../app/replySpeech.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as DesktopClientSettings from "../../settings/DesktopClientSettings.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

class ReplySpeechError extends Schema.TaggedError<ReplySpeechError>()("ReplySpeechError", {
  message: Schema.String,
}) {}

export const speakReply = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SPEAK_REPLY_CHANNEL,
  payload: Schema.Struct({
    text: Schema.String.check(Schema.isMaxLength(1_000_000)),
    source: Schema.Literals(["codex", "claude", "t3code"]),
    session: Schema.String.check(Schema.isMaxLength(500)),
    test: Schema.optionalKey(Schema.Boolean),
  }),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.speakReply")(function* (input, event) {
    const main = yield* (yield* ElectronWindow.ElectronWindow).main;
    if (!event || Option.isNone(main) || main.value.webContents.id !== event.sender.id) {
      return yield* new ReplySpeechError({ message: "Speech request was rejected." });
    }
    const stored = yield* (yield* DesktopClientSettings.DesktopClientSettings).get;
    const settings = Option.getOrNull(stored);
    if (!settings || (!settings.readRepliesAloud && !input.test)) return;
    if (!settings.speechServiceAddress.trim()) {
      return yield* new ReplySpeechError({
        message: "Enter a speech service address in Chat settings.",
      });
    }
    yield* Effect.tryPromise({
      try: () =>
        postReplySpeech(settings.speechServiceAddress, {
          text: input.test ? "T3 Code speech test. Reading replies aloud is ready." : input.text,
          source: input.source,
          session: input.session,
        }),
      catch: () =>
        new ReplySpeechError({
          message:
            "Speech was not confirmed. Check your speech service and its address in Chat settings.",
        }),
    });
  }),
});
