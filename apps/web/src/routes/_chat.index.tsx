import { createFileRoute } from "@tanstack/react-router";

import { NoProjectsHero } from "../components/NoProjectsHero";
import { HostedEmptyState } from "../components/HostedEmptyState";
import { useAllEnvironmentShellsBootstrapped } from "../state/entities";
import { useEnvironments } from "../state/environments";

function ChatIndexRouteView() {
  const { authGateState } = Route.useRouteContext();
  const { environments, isReady } = useEnvironments();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();

  if (authGateState.status === "hosted-static") {
    if (!isReady) return null;
    if (environments.length === 0) return <HostedEmptyState />;
  }

  // Keep home neutral until the user explicitly chooses to start a thread.
  return bootstrapped ? <NoProjectsHero /> : null;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
