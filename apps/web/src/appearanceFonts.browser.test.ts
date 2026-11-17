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
  it("sizes the composer from the interface size until fonts are set separately", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const preferences = {
      sans: "",
      code: "",
      composer: "",
      sizeInterface: 20,
      sizePrompt: 14,
      sizeCode: 13,
      sizeContextMenu: null,
      sizeThread: null,
      sizeFolder: null,
      sizeConversation: null,
      smoothing: true,
    };
    try {
      applyAppearanceFontVariables(root, { ...preferences, separate: false });
      expect(composerFontSize()).toBe("17.5px");
      expect(touchComposerFontSize()).toBe("17.5px");

      applyAppearanceFontVariables(root, { ...preferences, separate: true });
      expect(composerFontSize()).toBe("14px");
      // iOS zooms into inputs under 16px.
      expect(touchComposerFontSize()).toBe("16px");
    } finally {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });

  it("keeps stock sizes when separate fonts is off and restores independent sizes when on", () => {
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
      sizeThread: 22,
      sizeFolder: 20,
      sizeConversation: 23,
      smoothing: true,
    };
    const sizes = () =>
      [
        "var(--font-size-thread, 0.875rem)",
        "var(--font-size-folder, 0.875rem)",
        "var(--font-size-context-menu, 0.875rem)",
        "var(--font-size-conversation, 0.875rem)",
      ].map((value) =>
        renderedFontSize((probe) => {
          probe.style.fontSize = value;
        }),
      );
    const markdownSizes = () => {
      const markdown = document.createElement("div");
      markdown.className = "chat-markdown text-chat-body";
      markdown.innerHTML =
        "<h1>Heading</h1><p>Reply <code>inline</code></p><div class='chat-markdown-codeblock'><pre><code>code</code></pre></div><table><tr><td>table</td></tr></table>";
      document.body.append(markdown);
      try {
        return [
          markdown,
          markdown.querySelector("h1")!,
          markdown.querySelector("pre code")!,
          markdown.querySelector("table")!,
        ].map((el) => getComputedStyle(el).fontSize);
      } finally {
        markdown.remove();
      }
    };
    try {
      applyAppearanceFontVariables(root, { ...preferences, separate: false });
      expect(sizes()).toEqual(["21px", "21px", "21px", "21px"]);
      expect(markdownSizes()).toEqual(["21px", "30px", "20px", "21px"]);
      applyAppearanceFontVariables(root, { ...preferences, separate: true });
      expect(sizes()).toEqual(["19.25px", "17.5px", "18px", "23px"]);
      expect(markdownSizes()).toEqual(["23px", "23px", "20px", "23px"]);
      applyAppearanceFontVariables(root, { ...preferences, separate: false });
      expect(sizes()).toEqual(["21px", "21px", "21px", "21px"]);
      expect(markdownSizes()).toEqual(["21px", "30px", "20px", "21px"]);
      applyAppearanceFontVariables(root, {
        ...preferences,
        separate: true,
        sizeThread: null,
        sizeFolder: null,
        sizeContextMenu: null,
        sizeConversation: null,
      });
      expect(sizes()).toEqual(["21px", "21px", "21px", "21px"]);
      expect(markdownSizes()).toEqual(["21px", "30px", "20px", "21px"]);
      applyAppearanceFontVariables(root, { ...preferences, separate: true });
      expect(sizes()).toEqual(["19.25px", "17.5px", "18px", "23px"]);
    } finally {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });

  it("widens the numbered-list gutter only when the interface font's marker would clip", () => {
    const root = document.documentElement;
    const style = root.getAttribute("style");
    const gutter = (sans: string) => {
      applyAppearanceFontVariables(root, {
        sans,
        code: "",
        composer: "",
        sizeInterface: 16,
        sizePrompt: 14,
        sizeCode: 13,
        sizeContextMenu: 16,
        sizeThread: 16,
        sizeFolder: null,
        sizeConversation: null,
        smoothing: true,
        separate: false,
      });
      const markdown = document.createElement("div");
      markdown.className = "chat-markdown";
      markdown.style.fontSize = "14px";
      const list = document.createElement("ol");
      markdown.append(list);
      document.body.append(markdown);
      try {
        return Number.parseFloat(getComputedStyle(list).paddingInlineStart);
      } finally {
        markdown.remove();
      }
    };
    try {
      // `0. ` in a 14px monospace font is past the 20px default: about 25px, or 23px on Windows.
      expect(gutter("monospace")).toBeGreaterThan(20);
      expect(gutter("sans-serif")).toBe(20);
    } finally {
      if (style === null) root.removeAttribute("style");
      else root.setAttribute("style", style);
    }
  });
});
