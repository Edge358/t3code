import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { createRef } from "react";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { CommandPalette } from "./CommandPalette";
import { SidebarThreadHeader } from "./sidebar/SidebarThreadHeader";
import { SidebarProvider } from "./ui/sidebar";

function setup() {
  useCommandPaletteStore.setState(useCommandPaletteStore.getInitialState(), true);
}

describe("CommandPalette open intents", () => {
  it("allows choosing a folder from New thread when there are no projects", async () => {
    setup();
    await using screen = await render(
      <SidebarProvider>
        <SidebarThreadHeader
          hasProjects={false}
          projectScope={null}
          onNewProject={() => {}}
          onNewThread={() => openCommandPalette({ open: "new-thread-in" })}
          newThreadShortcutLabel={undefined}
          newThreadInProjectShortcutLabel={undefined}
          showNewThreadInProjectHint
          searchInputRef={createRef<HTMLInputElement>()}
          searchQuery=""
          onSearchQueryChange={() => {}}
          onSearchKeyDown={() => {}}
          isSearching={false}
          searchResultCount={0}
          activeSearchResultIndex={0}
          onClearSearch={() => {}}
        />
        <CommandPalette>{null}</CommandPalette>
      </SidebarProvider>,
    );
    await screen.getByRole("button", { name: "New thread", exact: true }).click();
    await expect
      .element(page.getByText("Add project / choose folder…", { exact: true }))
      .toBeVisible();
  });

  it("opens New thread in... with focus in the search input, not the Back button", async () => {
    setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ open: "new-thread-in" });

    await expect.element(page.getByPlaceholder("Search...")).toHaveFocus();
  });

  it("opens a search intent with its query in the focused input", async () => {
    setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ query: "acme" });

    const input = page.getByPlaceholder("Search commands, projects, and threads...");
    await expect.element(input).toHaveFocus();
    await expect.element(input).toHaveValue("acme");
  });
});
