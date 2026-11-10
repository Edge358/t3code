import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ChevronDownIcon, SquarePenIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { deriveProjectIdentity } from "../../projectIdentity";
import { projectIconColorClassName } from "../../projectIconColors";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "../Sidebar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const FOLDER_DOT_CLASS_NAME = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-success",
  working: "bg-info",
} as const;

const FOLDER_DOT_LABEL = {
  attention: ", needs you",
  failed: ", failed",
  unread: ", done",
  working: ", working",
} as const;

/** The folder's sidebar tree row; its thread rows name it as their parent. */
export function sidebarFolderRowId(projectKey: string) {
  return `folder:${projectKey}`;
}

/**
 * A project folder in the boring sidebar. It reads like a shelf header: a trailing
 * count and chevron, with the count and a status dot only while it is closed, so a
 * closed folder still says when a hidden thread needs you.
 */
export const SidebarProjectFolderHeader = memo(function SidebarProjectFolderHeader(props: {
  group: SidebarProjectSnapshot;
  collapsed: boolean;
  draggable?: boolean;
  onMove?: (draggedKey: string, targetKey: string) => void;
  hiddenThreads: readonly EnvironmentThreadShell[];
  onToggle: (group: SidebarProjectSnapshot) => void;
  onNewThread: (group: SidebarProjectSnapshot) => void;
  onContextMenu: (group: SidebarProjectSnapshot, position: { x: number; y: number }) => void;
}) {
  const { group, collapsed, hiddenThreads } = props;
  const headingColor =
    group.projectIcon?.kind === "emoji"
      ? null
      : (group.projectIcon?.color ??
        (group.title.trim() ? deriveProjectIdentity(group.title).color : null));
  const [dropTarget, setDropTarget] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clear native drag feedback even when Escape cancels or the drop lands outside this header
  useEffect(() => {
    if (!dropTarget) return;
    const clear = () => setDropTarget(false);
    document.addEventListener("dragend", clear);
    document.addEventListener("drop", clear);
    return () => {
      document.removeEventListener("dragend", clear);
      document.removeEventListener("drop", clear);
    };
  }, [dropTarget]);

  const rowId = sidebarFolderRowId(group.projectKey);
  const localLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const dot = collapsed
    ? resolveSidebarFolderDot(
        hiddenThreads.map((thread) => ({
          ...thread,
          lastVisitedAt: resolveThreadLastVisitedAt(
            thread.lastVisitedAt,
            localLastVisitedAtById[
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
            ],
          ),
        })),
      )
    : null;
  return (
    <li
      data-testid="sidebar-project-folder"
      className={cn(
        "group/project-folder relative mt-2 list-none first:mt-0",
        dropTarget && props.draggable && "rounded-md ring-1 ring-ring",
      )}
      onDragOver={(event) => {
        if (!props.draggable || !event.dataTransfer.types.includes("application/x-t3-project"))
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDropTarget(false);
      }}
      onDrop={(event) => {
        setDropTarget(false);
        if (!props.draggable) return;
        const source = event.dataTransfer.getData("application/x-t3-project");
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        props.onMove?.(source, group.projectKey);
      }}
    >
      <button
        type="button"
        data-sidebar-row={rowId}
        draggable={props.draggable ?? false}
        onDragStart={(event) => {
          if (!props.draggable) {
            event.preventDefault();
            return;
          }
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-t3-project", group.projectKey);
        }}
        onDragEnd={() => setDropTarget(false)}
        aria-expanded={!collapsed}
        onClick={() => props.onToggle(group)}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu(group, { x: event.clientX, y: event.clientY });
        }}
        className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ProjectFavicon project={group} className="size-4 shrink-0" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium",
            headingColor ? projectIconColorClassName(headingColor) : "text-sidebar-foreground/90",
            !group.projectIcon &&
              "group-has-[img:not(.hidden)]/project-folder:text-sidebar-foreground/90",
          )}
        >
          {group.displayName}
        </span>
        {dot ? (
          <span className={cn("size-1.5 shrink-0 rounded-full", FOLDER_DOT_CLASS_NAME[dot])}>
            <span className="sr-only">{FOLDER_DOT_LABEL[dot]}</span>
          </span>
        ) : null}
        {collapsed && hiddenThreads.length > 0 ? (
          <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/project-folder:invisible pointer-coarse:invisible">
            {hiddenThreads.length}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
            collapsed && "-rotate-90",
          )}
        />
      </button>
      {/* Sits over the count, which hides on hover, and left of the chevron. */}
      <span className="absolute inset-y-0 right-6 flex items-center opacity-0 focus-within:opacity-100 group-hover/project-folder:opacity-100 pointer-coarse:opacity-100">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                data-sidebar-action-for={rowId}
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`New thread in ${group.displayName}`}
                onClick={() => props.onNewThread(group)}
              />
            }
          >
            <SquarePenIcon aria-hidden />
          </TooltipTrigger>
          <TooltipPopup>New thread in {group.displayName}</TooltipPopup>
        </Tooltip>
      </span>
    </li>
  );
});
