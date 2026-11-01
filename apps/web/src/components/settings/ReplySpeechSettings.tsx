import { validateSpeechServiceAddress } from "@t3tools/shared/speechServiceAddress";
import { useRef, useState } from "react";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { DraftInput } from "../ui/draft-input";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function ReplySpeechSettings() {
  const settings = useClientSettings();
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const available = Boolean(window.desktopBridge?.speakReply);
  // The desktop reads the saved address, so a test must wait for the last save to land.
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const save = async (patch: Parameters<typeof updateClientSettings>[0]) => {
    const saving = updateClientSettings(patch);
    pendingSave.current = saving.then(
      () => undefined,
      () => undefined,
    );
    try {
      await saving;
      setStatus("");
    } catch {
      setStatus("Could not save the speech setting. Please try again.");
    }
  };
  return (
    <SettingsSection id="reply-speech" title="Read replies aloud">
      <SettingsRow
        title="Read replies aloud"
        description={
          available
            ? "Send newly completed replies to your speech service while this app is open. Off by default; applies to this device."
            : "Available in the desktop application."
        }
        control={
          <Switch
            aria-label="Read replies aloud"
            checked={settings.readRepliesAloud}
            disabled={!available || !settings.speechServiceAddress.trim()}
            onCheckedChange={(checked) => void save({ readRepliesAloud: Boolean(checked) })}
          />
        }
      />
      <SettingsRow
        title="Speech service address"
        description="Full address, including port and /say. Uses your existing speaker queue; no voice engine is installed by this setting."
        control={
          <DraftInput
            aria-label="Speech service address"
            className="w-80 max-w-full"
            value={settings.speechServiceAddress}
            disabled={!available}
            onCommit={(value) => {
              const address = value.trim();
              if (address.length > 0) {
                const checked = validateSpeechServiceAddress(address);
                if (typeof checked === "string") {
                  setStatus(checked);
                  return;
                }
              }
              void save({ speechServiceAddress: address, readRepliesAloud: false });
            }}
          />
        }
      />
      <SettingsRow
        title="Test speech"
        description={
          <span role="status">
            {status ||
              "Sends one test sentence to the saved address. Your service controls the voice and playback."}
          </span>
        }
        control={
          <Button
            disabled={!available || testing || !settings.speechServiceAddress.trim()}
            onClick={async () => {
              setTesting(true);
              try {
                await pendingSave.current;
                await window.desktopBridge!.speakReply!({
                  text: "",
                  source: "t3code",
                  session: "t3code-speech-test",
                  test: true,
                });
                setStatus("Test sentence queued. Listen for it from your speech service.");
              } catch {
                setStatus(
                  "Speech was not confirmed. Check that the service is running and the address is correct.",
                );
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "Testing…" : "Test speech"}
          </Button>
        }
      />
    </SettingsSection>
  );
}
