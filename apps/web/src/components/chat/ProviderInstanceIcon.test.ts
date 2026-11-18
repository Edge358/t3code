import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { resolveProviderInstanceAcpRegistryIconUrl } from "./ProviderInstanceIcon";

// Retain upstream allowlist coverage and exercise the shipping policy below.
const testPolicy = vi.hoisted(() => ({ remoteIcons: true }));
vi.mock("@t3tools/shared/privateBuildPolicy", () => ({ privateBuildPolicy: testPolicy }));

describe("resolveProviderInstanceAcpRegistryIconUrl", () => {
  it("uses allowlisted catalog metadata and rejects untrusted overrides", () => {
    expect(
      resolveProviderInstanceAcpRegistryIconUrl({
        driverKind: ProviderDriverKind.make("acpRegistry"),
        agentId: "kilo",
        iconUrl: "https://cdn.agentclientprotocol.com/registry/icons/kilo.svg",
      }),
    ).toBe("https://cdn.agentclientprotocol.com/registry/icons/kilo.svg");
    expect(
      resolveProviderInstanceAcpRegistryIconUrl({
        driverKind: ProviderDriverKind.make("acpRegistry"),
        agentId: "generic-agent",
        iconUrl: "https://example.com/not-official.svg",
      }),
    ).toBe("https://cdn.agentclientprotocol.com/registry/v1/latest/generic-agent.svg");
  });

  it("resolves no icon URL under the private policy", () => {
    testPolicy.remoteIcons = false;
    try {
      expect(
        resolveProviderInstanceAcpRegistryIconUrl({
          driverKind: ProviderDriverKind.make("acpRegistry"),
          agentId: "kilo",
          iconUrl: "https://cdn.agentclientprotocol.com/registry/icons/kilo.svg",
        }),
      ).toBeNull();
    } finally {
      testPolicy.remoteIcons = true;
    }
  });
});
