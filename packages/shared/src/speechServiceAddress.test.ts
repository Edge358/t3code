import { describe, expect, it } from "vite-plus/test";
import { validateSpeechServiceAddress } from "./speechServiceAddress.ts";

describe("speech service address", () => {
  it.each([
    "http://127.0.0.1:8011/say",
    "http://localhost:8011/say",
    "http://192.168.1.50:8011/say",
    "http://10.0.0.7/say",
    "http://100.101.102.103:8011/say",
    "http://[::1]:8011/say",
    "http://[fd7a:115c:a1e0::1]/say",
    "https://speaker.lan/say",
  ])("accepts the local or LAN address %s", (address) => {
    expect(validateSpeechServiceAddress(address)).toBeInstanceOf(URL);
  });
  it.each([
    ["", "full speech service address"],
    ["file:///tmp/voice", "HTTP or HTTPS"],
    ["http://user:secret@localhost/say", "without credentials"],
    ["http://localhost/say#fragment", "without credentials"],
    ["http://8.8.8.8/say", "local network"],
    ["http://[2001:db8::1]/say", "local network"],
    ["http://0.0.0.0/say", "local network"],
  ])("refuses %s with a reason", (address, reason) => {
    expect(validateSpeechServiceAddress(address)).toEqual(expect.stringContaining(reason));
  });
});
