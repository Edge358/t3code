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
import { withRemoteMediaConsent, setAutomaticRemoteMedia } from "./RemoteMediaConsent";

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
