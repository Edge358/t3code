import "../index.css";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { CommandPaletteContent } from "./CommandPaletteContent";
import { CommandDialog, CommandDialogPopup, CommandItem, CommandList } from "./ui/command";

function SubmenuPalette() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup aria-label="Command palette">
          <CommandPaletteContent
            onEscape={() => setOpen(false)}
            items={["Project A"]}
            inputProps={{
              placeholder: "Search projects",
              startAddon: (
                <button type="button" aria-label="Back">
                  Back
                </button>
              ),
            }}
          >
            <CommandList>
              {(item: string) => (
                <CommandItem key={item} value={item}>
                  {item}
                </CommandItem>
              )}
            </CommandList>
          </CommandPaletteContent>
        </CommandDialogPopup>
      </CommandDialog>
    </>
  );
}

describe("CommandPaletteContent", () => {
  it("focuses the submenu search input and closes from the footer", async () => {
    await using _screen = await render(<SubmenuPalette />);

    await userEvent.click(page.getByRole("button", { name: "Open" }));

    await expect.element(page.getByPlaceholder("Search projects")).toHaveFocus();
    await userEvent.click(page.getByRole("button", { name: "Close", exact: true }));
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });
});
