import type { ChildThreadApproval } from "@t3tools/client-runtime/state/thread-requests";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({ respond: vi.fn(), approvalsAtom: null as unknown }));

vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.respond }));
vi.mock("../../state/threads", () => ({
  childThreadApprovalsAtom: () => state.approvalsAtom,
  threadEnvironment: { respondToApproval: {} },
}));

import { ChildThreadApprovals } from "./ChildThreadApprovals";

function setup() {
  state.respond.mockReset();
  state.respond
    .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Child environment offline"))))
    .mockResolvedValue(AsyncResult.success(undefined));
  const thread = {
    environmentId: EnvironmentId.make("child-env"),
    threadId: ThreadId.make("child"),
  };
  state.approvalsAtom = Atom.make<ReadonlyArray<ChildThreadApproval>>([
    {
      thread,
      title: "Compile task",
      approval: {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        detail: "Run compiler",
        createdAt: "2026-11-01T00:00:00.000Z",
        responseCapability: "live",
      },
    },
    {
      thread: { ...thread, environmentId: EnvironmentId.make("other-env") },
      title: "Review task",
      approval: {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        detail: "Run review",
        createdAt: "2026-11-01T00:00:00.000Z",
        responseCapability: "live",
      },
    },
  ]);
  return thread;
}

it("routes each child decision to its environment and keeps failures retryable", async () => {
  const thread = setup();
  await using screen = await render(<ChildThreadApprovals threadRef={thread} />);
  const compile = screen.getByRole("region", { name: "Approval from Compile task" });
  const review = screen.getByRole("region", { name: "Approval from Review task" });
  await compile.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toHaveTextContent("Child environment offline");
  await compile.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(state.respond.mock.calls).toEqual(
    [1, 2].map(() => [
      {
        environmentId: thread.environmentId,
        input: { threadId: thread.threadId, requestId: "approval", decision: "accept" },
      },
    ]),
  );
  await review.getByRole("button", { name: "Decline", exact: true }).click();
  expect(state.respond).toHaveBeenLastCalledWith({
    environmentId: "other-env",
    input: { threadId: thread.threadId, requestId: "approval", decision: "decline" },
  });
});
