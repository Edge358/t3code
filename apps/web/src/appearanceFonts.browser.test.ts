import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
import { applyAppearanceFontVariables } from "./appearanceFonts";

function renderedFontSize(style: (probe: HTMLElement) => void): string {
  const probe = document.createElement("div");
  style(probe);
  document.body.append(probe);
  try {
    return getComputedStyle(probe).fontSize;
  } finally {
    probe.remove();
  }
}

const composerFontSize = () =>
  renderedFontSize((probe) => {
    // The composer editor's own size class.
    probe.className = "text-(length:--font-size-prompt,var(--text-sm))";
  });

const touchComposerFontSize = () =>
  renderedFontSize((probe) => {
    probe.style.fontSize = "var(--font-size-prompt-touch)";
  });

describe("applyAppearanceFontVariables", () => {
  it("ties chat and typing size to code size while keeping menus and the interface independent", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const preferences = {
      sans: "",
      code: "",
      composer: "",
      sizeInterface: 24,
      sizePrompt: 14,
      sizeCode: 20,
      sizeContextMenu: 18,
      smoothing: true,
    };
    try {
      applyAppearanceFontVariables(root, { ...preferences, separate: false });
      expect(composerFontSize()).toBe("20px");
      expect(touchComposerFontSize()).toBe("20px");

      applyAppearanceFontVariables(root, { ...preferences, sizeCode: 22, separate: false });
      expect(composerFontSize()).toBe("22px");
      expect(
        renderedFontSize((probe) => {
          probe.className = "chat-markdown text-chat-body";
        }),
      ).toBe("22px");
      expect(getComputedStyle(root).fontSize).toBe("24px");
      expect(
        renderedFontSize((probe) => {
          probe.style.fontSize = "var(--font-size-context-menu)";
        }),
      ).toBe("18px");

      applyAppearanceFontVariables(root, { ...preferences, sizeContextMenu: 22, separate: false });
      expect(composerFontSize()).toBe("20px");
      expect(
        renderedFontSize((probe) => {
          probe.style.fontSize = "var(--font-size-context-menu)";
        }),
      ).toBe("22px");

      applyAppearanceFontVariables(root, { ...preferences, separate: true });
      expect(composerFontSize()).toBe("14px");
      // iOS zooms into inputs under 16px.
      expect(touchComposerFontSize()).toBe("16px");
    } finally {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });
});
