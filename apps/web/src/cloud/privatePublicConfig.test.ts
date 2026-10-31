import { afterEach, expect, it, vi } from "vite-plus/test";
import { hasCloudPublicConfig, resolveRelayTracingConfig } from "./publicConfig.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("cannot enable account initialization or relay tracing through inherited configuration", () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", `pk_live_${btoa("clerk.example.com$")}`);
  vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
  vi.stubEnv("VITE_T3CODE_RELAY_URL", "https://relay.example.test");
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_URL", "https://collector.example.test/v1/traces");
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_DATASET", "test-dataset");
  vi.stubEnv("VITE_RELAY_OTLP_TRACES_TOKEN", "test-token");
  vi.stubGlobal("window", { location: new URL("file:///app/index.html"), desktopBridge: {} });

  expect(hasCloudPublicConfig()).toBe(false);
  expect(resolveRelayTracingConfig()).toBeNull();
});
