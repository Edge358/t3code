import { describe, expect, it } from "vite-plus/test";
import { loadRepoEnv } from "./public-config.ts";

describe("private build public configuration", () => {
  it("removes account/relay/export aliases without stripping provider configuration", () => {
    const env = loadRepoEnv({
      baseEnv: {
        T3CODE_CLERK_PUBLISHABLE_KEY: "pk_synthetic",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_synthetic",
        EXPO_PUBLIC_CLERK_JWT_TEMPLATE: "synthetic",
        T3CODE_RELAY_URL: "https://relay.invalid",
        VITE_T3CODE_RELAY_URL: "https://relay.invalid",
        VITE_RELAY_OTLP_TRACES_URL: "https://collector.invalid",
        T3CODE_RELAY_CLIENT_OTLP_TRACES_TOKEN: "synthetic",
        OPENAI_API_KEY: "synthetic-provider-credential",
        ANTHROPIC_API_KEY: "synthetic-provider-credential",
      },
    });
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/CLERK|RELAY/);
    }
    expect(env.OPENAI_API_KEY).toBe("synthetic-provider-credential");
    expect(env.ANTHROPIC_API_KEY).toBe("synthetic-provider-credential");
  });
});
