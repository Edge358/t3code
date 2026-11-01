import { ClientSettingsSchema } from "@t3tools/contracts";
import { validateSpeechServiceAddress } from "@t3tools/shared/speechServiceAddress";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopClientSettings from "../../settings/DesktopClientSettings.ts";
import * as DesktopSnapShot from "../../snapShot/DesktopSnapShot.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getClientSettings = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_CLIENT_SETTINGS_CHANNEL,
  payload: Schema.Void,
  result: Schema.NullOr(ClientSettingsSchema),
  handler: Effect.fn("desktop.ipc.clientSettings.get")(function* () {
    const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
    return Option.getOrNull(yield* clientSettings.get);
  }),
});

export const setClientSettings = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_CLIENT_SETTINGS_CHANNEL,
  payload: ClientSettingsSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.clientSettings.set")(function* (settings) {
    // The renderer validates before saving; this backstop keeps a bad address out of the file
    // without rejecting the write, since the renderer applies every patch optimistically.
    const address = settings.speechServiceAddress.trim();
    const accepted =
      address.length === 0 || typeof validateSpeechServiceAddress(address) !== "string"
        ? settings
        : { ...settings, speechServiceAddress: "", readRepliesAloud: false };
    const clientSettings = yield* DesktopClientSettings.DesktopClientSettings;
    const snapShot = yield* DesktopSnapShot.DesktopSnapShot;
    yield* clientSettings.set(accepted);
    yield* snapShot.configure(accepted);
  }),
});
