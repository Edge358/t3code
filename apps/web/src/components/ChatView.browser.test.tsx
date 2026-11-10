import { useUiStateStore } from "~/uiStateStore";
import { getProjectOrderKey } from "@t3tools/client-runtime/state/project-grouping";
import { createMemoryHistory } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform (React Compiler over ~4k lines)
// takes 6-11s; importing it here keeps that out of the test's timeout.
import "~/components/ChatView";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests, persistClientSettingsPatch } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  installFakeEnvironment,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("saved empty drafts stay in their folders without loading reserved server threads", async () => {
  await page.viewport(1400, 900);
  const projectA = {
    id: PROJECT_ID,
    title: "render",
    workspaceRoot: "/workspace/render",
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const projectB = {
    ...projectA,
    id: ProjectId.make("project-second"),
    title: "second",
    workspaceRoot: "/workspace/second",
  };
  using _environment = installFakeEnvironment([], { projects: [projectA, projectB] });
  const keyA = getProjectOrderKey({ ...projectA, environmentId: ENVIRONMENT_ID });
  const keyB = getProjectOrderKey({ ...projectB, environmentId: ENVIRONMENT_ID });
  useUiStateStore.setState({
    projectExpandedById: { [keyA]: false, [keyB]: false },
    projectOrder: [],
  });
  useComposerDraftStore.setState(useComposerDraftStore.getInitialState());
  using fetchSpy = vi.spyOn(globalThis, "fetch");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    boringSidebarEnabled: true,
    sidebarProjectSortOrder: "manual",
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const draftId = DraftId.make("draft-27443");
  const threadId = ThreadId.make("thread-27443");
  useComposerDraftStore
    .getState()
    .setLogicalProjectDraftThreadId(keyA, scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, {
      threadId,
    });

  const draftB = DraftId.make("draft-second");
  useComposerDraftStore
    .getState()
    .setLogicalProjectDraftThreadId(keyB, scopeProjectRef(ENVIRONMENT_ID, projectB.id), draftB, {
      threadId: ThreadId.make("thread-second"),
    });
  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  await using _app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  await expect.element(page.getByTestId("sidebar-draft-row")).toBeVisible();
  await expect.element(page.getByTestId("sidebar-project-folder").first()).toBeVisible();
  // The shell snapshot has arrived once the sidebar lists the project, so the connection is up.
  await expect.element(page.getByText("render", { exact: true }).first()).toBeVisible();

  const threadRequests = fetchSpy.mock.calls
    .map(([input]) => String(input instanceof Request ? input.url : input))
    .filter((url) => url.includes(`/api/orchestration/threads/${threadId}/`));
  // A 404 here marks the thread deleted, and the view never loads it once the send creates it.
  expect(threadRequests).toEqual([]);

  const folderA = page.getByTestId("sidebar-project-folder").filter({ hasText: "render" });
  const folderB = page.getByTestId("sidebar-project-folder").filter({ hasText: "second" });
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");
  await expect
    .element(folderB.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "false");
  await act(() => router.navigate({ to: "/draft/$draftId", params: { draftId: draftB } }));
  await expect
    .element(folderB.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");
  await folderA.getByRole("button").first().click();
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "false");
  await act(() => router.navigate({ to: "/draft/$draftId", params: { draftId } }));
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");
  await expect
    .element(folderB.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");

  const transfer = new DataTransfer();
  await act(() => {
    folderA
      .getByRole("button")
      .first()
      .element()
      .dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    folderB
      .element()
      .dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    folderB
      .element()
      .dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
  });
  expect(useUiStateStore.getState().projectOrder).toEqual([keyB, keyA]);
  await expect
    .element(
      page.getByTestId("sidebar-project-folder").first().getByText("second", { exact: true }),
    )
    .toBeVisible();
  await act(() =>
    persistClientSettingsPatch({ sidebarProjectSortOrder: "updated_at" }, async () => {}),
  );
  await expect.element(folderA.getByRole("button").first()).toHaveAttribute("draggable", "false");
  await act(() =>
    folderA
      .element()
      .dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })),
  );
  expect(useUiStateStore.getState().projectOrder).toEqual([keyB, keyA]);

  await page.getByRole("heading", { name: "New thread", exact: true }).dblClick();
  await page.getByRole("textbox", { name: "Thread title" }).fill("My saved name");
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByTestId("sidebar-draft-row").filter({ hasText: "My saved name" }))
    .toBeVisible();
  expect(useComposerDraftStore.getState().getDraftSession(draftId)?.title).toBe("My saved name");
  await page.getByTestId("sidebar-draft-row").filter({ hasText: "My saved name" }).dblClick();
  await page.getByRole("textbox", { name: "Thread title" }).fill("Renamed from sidebar");
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByRole("heading", { name: "Renamed from sidebar", exact: true }))
    .toBeVisible();
  await folderA.getByRole("button").first().click();
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "false");
  await folderA.getByRole("button", { name: "New thread in render" }).click();
  await expect
    .element(folderA.getByRole("button").first())
    .toHaveAttribute("aria-expanded", "true");
  expect(useComposerDraftStore.getState().getDraftSession(draftId)?.title).toBe(
    "Renamed from sidebar",
  );
});
