import { describe, expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";

const appearance = vi.hoisted(() => ({
  value: "light" as "light" | "dark",
  listeners: new Set<() => void>(),
}));
vi.mock(import("../../hooks/useTheme"), async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRenderedAppearance: () =>
      useSyncExternalStore(
        (listener) => {
          appearance.listeners.add(listener);
          return () => {
            appearance.listeners.delete(listener);
          };
        },
        () => appearance.value,
      ),
  };
});
import {
  RemoteContentGate,
  withRemoteMediaConsent,
  setAutomaticRemoteMedia,
} from "./RemoteMediaConsent";
import { PullRequestActorAvatar } from "../pullRequest/pullRequestPresentation";
import { TimelineRowCtx } from "./timelineRowContext";
import { ToolActivityIconView } from "./TimelineToolActivityIcon";
import { markdownImageGallery, markdownImageItems } from "./markdownImageGallery";

const mounted = vi.fn();
const GatedImage = withRemoteMediaConsent((props) => {
  mounted(props.src);
  return <span data-testid="loaded-media">{String(props.src)}</span>;
});

function resetMediaPreference() {
  setAutomaticRemoteMedia(false);
  mounted.mockClear();
  appearance.value = "light";
  return { [Symbol.dispose]: () => setAutomaticRemoteMedia(false) };
}

describe("external media consent", () => {
  it("does not mount loaders before approval, and approval applies only to that source", async () => {
    using _preference = resetMediaPreference();
    await using screen = await render(
      <GatedImage src="https://example.invalid/a.png" alt="diagram" />,
    );
    expect(mounted).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Load external media" }).click();
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    expect(mounted).toHaveBeenCalledWith("https://example.invalid/a.png");
    await screen.rerender(<GatedImage src="//example.invalid/b.png" alt="diagram" />);
    await expect
      .element(screen.getByRole("button", { name: "Load external media" }))
      .toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalledWith("//example.invalid/b.png");
    // Slashless and backslash forms still resolve to a remote host.
    for (const source of ["https:example.invalid/c.png", "\\\\example.invalid/d.png"]) {
      await screen.rerender(<GatedImage src={source} alt="diagram" />);
      await expect
        .element(screen.getByRole("button", { name: "Load external media" }))
        .toBeInTheDocument();
      expect(mounted).not.toHaveBeenCalledWith(source);
    }
  });

  it("requires fresh consent when a picture theme selects an external source", async () => {
    using _preference = resetMediaPreference();
    const picture = (remote: string) => (
      <GatedImage
        src="/api/attachments/local.png"
        node={{
          type: "element",
          tagName: "img",
          children: [],
          properties: { dataDarkSrc: remote },
        }}
      />
    );
    await using screen = await render(picture("https://example.invalid/dark.png"));
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    await act(() => {
      appearance.value = "dark";
      for (const listener of appearance.listeners) listener();
    });
    await expect.element(screen.getByTestId("loaded-media")).not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Load external media" }).click();
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    await screen.rerender(picture("https://example.invalid/other-dark.png"));
    await expect.element(screen.getByTestId("loaded-media")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Load external media" }))
      .toBeInTheDocument();
  });

  it("renders local attachments without a prompt", async () => {
    using _preference = resetMediaPreference();
    await using screen = await render(<GatedImage src="/api/attachments/test.png" />);
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
  });

  it("keeps tool pages and videos unmounted until approved, then remembers that approval", async () => {
    using _preference = resetMediaPreference();
    const Content = () => {
      mounted("page");
      return <span data-testid="loaded-media">page</span>;
    };
    const gate = (
      <RemoteContentGate approvalKey="mcp-app:a" message="Wants a page" actionLabel="Show page">
        <Content />
      </RemoteContentGate>
    );
    await using screen = await render(gate);
    await expect.element(screen.getByText("Wants a page")).toBeInTheDocument();
    expect(mounted).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "Show page" }).click();
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    // A remounted row (scrolled away and back) keeps the approval for the same content.
    await screen.rerender(<span>elsewhere</span>);
    await screen.rerender(gate);
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    await screen.rerender(
      <RemoteContentGate approvalKey="mcp-app:b" message="Another page" actionLabel="Show page">
        <Content />
      </RemoteContentGate>,
    );
    await expect.element(screen.getByRole("button", { name: "Show page" })).toBeInTheDocument();
  });

  it("never loads remote connector logos, and loads PR avatars only after opt-in", async () => {
    using _preference = resetMediaPreference();
    await using screen = await render(
      <TimelineRowCtx value={{ resolvedTheme: "light" } as never}>
        <ToolActivityIconView
          icon={{
            _tag: "themed-logo",
            logoUrl: "https://www.google.com/s2/favicons?domain=example.invalid&sz=64",
          }}
          fallbackName="bot"
          className="size-4"
          muted={false}
        />
        <PullRequestActorAvatar
          actor={{ login: "octo", name: null, avatarUrl: "https://example.invalid/octo.png" }}
        />
      </TimelineRowCtx>,
    );
    expect(screen.container.querySelector("img")).toBeNull();
    // The unreachable avatar fails and falls back at once, so record images as they mount.
    const loaded: Array<string | null> = [];
    const observer = new MutationObserver(() => {
      for (const image of screen.container.querySelectorAll("img")) {
        loaded.push(image.getAttribute("src"));
      }
    });
    observer.observe(screen.container, { childList: true, subtree: true });
    using _observer = { [Symbol.dispose]: () => observer.disconnect() };
    setAutomaticRemoteMedia(true);
    await vi.waitFor(() => expect(loaded).toContain("https://example.invalid/octo.png"));
    expect(new Set(loaded)).toEqual(new Set(["https://example.invalid/octo.png"]));
  });

  it("keeps a linked web image out of the image viewer until external media is allowed", () => {
    using _preference = resetMediaPreference();
    const scope = document.createElement("div");
    scope.className = "chat-markdown";
    const first = document.createElement("img");
    const link = document.createElement("a");
    link.setAttribute("href", "https://example.invalid/full.png");
    const second = document.createElement("img");
    link.append(second);
    scope.append(first, link);
    using _scope = { [Symbol.dispose]: () => scope.remove() };
    document.body.append(scope);
    const selected = { src: "/api/attachments/first.png", name: "first" };
    markdownImageItems.set(first, selected);
    markdownImageItems.set(second, { src: "/api/attachments/second.png", name: "second" });
    expect(markdownImageGallery(first, selected).images[1]?.src).toBe(
      "/api/attachments/second.png",
    );
    setAutomaticRemoteMedia(true);
    expect(markdownImageGallery(first, selected).images[1]?.src).toBe(
      "https://example.invalid/full.png",
    );
  });

  it("supports deliberate opt-in and returns to click-to-load when switched off", async () => {
    using _preference = resetMediaPreference();
    setAutomaticRemoteMedia(true);
    await using screen = await render(<GatedImage src="https://example.invalid/a.png" />);
    await expect.element(screen.getByTestId("loaded-media")).toBeInTheDocument();
    setAutomaticRemoteMedia(false);
    await expect
      .element(screen.getByRole("button", { name: "Load external media" }))
      .toBeInTheDocument();
  });
});
