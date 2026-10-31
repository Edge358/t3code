import { describe, expect, it } from "@effect/vitest";

import { faviconUrlForOrigin, toolActivityFaviconUrl } from "./favicon.ts";

describe("faviconUrlForOrigin", () => {
  it("does not send public hostnames to any favicon service", () => {
    expect(
      faviconUrlForOrigin("https://github.com:8443/pingdotgg/t3code?private=query", 64),
    ).toBeNull();
  });

  // regression: #5838 no favicon request for missing or non-http origins
  it.each([null, "invalid URL", "file:///tmp/private"])(
    "rejects an invalid or unsupported origin %s",
    (origin) => {
      expect(faviconUrlForOrigin(origin)).toBeNull();
    },
  );
});

describe("toolActivityFaviconUrl", () => {
  it("does not request icons from the page origin either", () => {
    expect(
      toolActivityFaviconUrl({ pageUrl: "https://example.com/docs/page?q=1" }, "light"),
    ).toBeNull();
    expect(toolActivityFaviconUrl({ pageUrl: "http://localhost:5173/app" }, "light")).toBeNull();
  });

  it("ignores provider-supplied remote and extension URLs", () => {
    expect(
      toolActivityFaviconUrl(
        { pageUrl: "https://example.com/docs", faviconUrl: "https://example.com/icon.png" },
        "light",
      ),
    ).toBeNull();
    expect(
      toolActivityFaviconUrl(
        { pageUrl: "https://example.com/docs", faviconUrl: "chrome-extension://example/_favicon/" },
        "light",
      ),
    ).toBeNull();
  });
});
