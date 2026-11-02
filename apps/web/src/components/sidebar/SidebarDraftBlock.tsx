import { discardComposerDraft } from "../../lib/discardComposerDraft";
import { SquarePenIcon, XIcon } from "lucide-react";
import {
  memo,
  useState,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { cn } from "~/lib/utils";
import { resolveSidebarRowAccessibility } from "../Sidebar.logic";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { DraftId, useComposerDraftStore, type DraftSessionState } from "../../composerDraftStore";
import { draftPenClassName, draftSurfaceClassName } from "./SidebarThreadRow";

const SidebarDraftRow = memo(function SidebarDraftRow(props: {
  draftId: DraftId;
  title: string;
  parentRowId?: string;
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  isActive: boolean;
  onNavigate: (draftId: DraftId) => void;
  onDiscard: (draftId: DraftId) => void;
  onContextMenu: (
    draftId: DraftId,
    position: { x: number; y: number },
    onRename?: () => void,
  ) => void;
}) {
  const { draftId, onContextMenu, onDiscard, onNavigate } = props;
  const preview = props.title;
  const [renameTitle, setRenameTitle] = useState<string | null>(null);
  const renameCommitted = useRef(false);
  const startRename = () => {
    renameCommitted.current = false;
    setRenameTitle(props.title);
  };
  const commitRename = (value: string) => {
    if (renameCommitted.current) return;
    renameCommitted.current = true;
    const title = value.trim();
    setRenameTitle(null);
    const session = useComposerDraftStore.getState().getDraftSession(draftId);
    if (title && session && !session.promotedTo)
      useComposerDraftStore.getState().setDraftThreadContext(draftId, { title });
  };

  const accessibility = resolveSidebarRowAccessibility({
    title: preview,
    statusLabel: "Unsent draft",
    projectDisplayName: props.projectDisplayName,
    isActive: props.isActive,
  });
  const handleActivate = () => onNavigate(draftId);
  const handleKeyDown = (event: ReactKeyboardEvent) => {
    // Keys targeting the nested discard button belong to the button:
    // preventDefault here would swallow Space's synthesized click and
    // navigate instead of discarding.
    if ((event.target as HTMLElement).closest("button, input")) return;
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      onContextMenu(draftId, { x: rect.left, y: rect.bottom }, startRename);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate(draftId);
    }
  };
  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    onContextMenu(draftId, { x: event.clientX, y: event.clientY }, startRename);
  };
  const handleDiscard = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onDiscard(draftId);
  };
  return (
    <li className="list-none py-0.5">
      <div
        role="treeitem"
        tabIndex={-1}
        data-sidebar-row={`draft:${draftId}`}
        data-sidebar-parent={props.parentRowId}
        aria-label={accessibility.label}
        aria-current={accessibility.current}
        data-testid="sidebar-draft-row"
        className={cn(
          "group/sidebar-row relative w-full cursor-pointer overflow-hidden rounded-md text-left text-sidebar-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          props.isActive ? "bg-sidebar-row-active" : draftSurfaceClassName,
        )}
        onClick={handleActivate}
        onDoubleClick={startRename}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        <span className="sr-only">{preview}</span>
        <div className="relative z-10 px-(--sidebar-row-content-inset) py-(--sidebar-content-inset)">
          <div className="flex h-5 min-w-0 items-center gap-1.5">
            <SquarePenIcon aria-hidden className={draftPenClassName} />
            {props.project && !props.parentRowId ? (
              <ProjectFavicon project={props.project} className="size-4 shrink-0" />
            ) : null}
            {renameTitle !== null ? (
              <input
                autoFocus
                aria-label="Thread title"
                defaultValue={renameTitle}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-sm outline-none ring-1 ring-ring"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onBlur={(event) => commitRename(event.currentTarget.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename(event.currentTarget.value);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    renameCommitted.current = true;
                    setRenameTitle(null);
                  }
                }}
              />
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
                {props.parentRowId ? preview : props.projectDisplayName}
              </span>
            )}
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-end">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Discard draft"
                      onClick={handleDiscard}
                      className="pointer-events-none inline-flex cursor-pointer items-center rounded-md bg-transparent px-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/sidebar-row:pointer-events-auto group-hover/sidebar-row:opacity-100"
                    >
                      <XIcon className="size-3" />
                    </button>
                  }
                />
                <TooltipPopup side="top">Discard draft</TooltipPopup>
              </Tooltip>
            </span>
          </div>
          {!props.parentRowId && (
            <div aria-hidden className="mt-0.5 truncate text-sm font-medium text-foreground/90">
              {preview}
            </div>
          )}
        </div>
      </div>
    </li>
  );
});

interface SidebarDraftRowData {
  draftId: DraftId;
  session: DraftSessionState;
}

export const SidebarDraftBlock = memo(function SidebarDraftBlock(props: {
  projectByKey: ReadonlyMap<string, EnvironmentProject>;
  projectDisplayNameByKey: ReadonlyMap<string, string>;
  scopedProjectKeys: ReadonlySet<string> | null;
  routeDraftId: string | null;
  parentRowId?: string;
  onNavigateToDraft: (draftId: DraftId) => void;
  onDraftContextMenu: (
    draftId: DraftId,
    position: { x: number; y: number },
    onRename?: () => void,
  ) => void;
}) {
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const drafts = (() => {
    const rows: SidebarDraftRowData[] = [];
    for (const [draftKey, session] of Object.entries(draftThreadsByThreadKey)) {
      if (session.promotedTo != null) {
        continue;
      }
      if (
        props.scopedProjectKeys !== null &&
        !props.scopedProjectKeys.has(`${session.environmentId}:${session.projectId}`)
      ) {
        continue;
      }
      rows.push({ draftId: DraftId.make(draftKey), session });
    }
    rows.sort((left, right) => right.session.createdAt.localeCompare(left.session.createdAt));
    return rows;
  })();
  if (drafts.length === 0) {
    return null;
  }
  return (
    <>
      {drafts.map(({ draftId, session }) => {
        const projectKey = `${session.environmentId}:${session.projectId}`;
        return (
          <SidebarDraftRow
            key={draftId}
            draftId={draftId}
            title={session.title ?? "New thread"}
            {...(props.parentRowId ? { parentRowId: props.parentRowId } : {})}
            project={props.projectByKey.get(projectKey) ?? null}
            projectDisplayName={props.projectDisplayNameByKey.get(projectKey) ?? null}
            isActive={draftId === props.routeDraftId}
            onNavigate={props.onNavigateToDraft}
            onDiscard={discardComposerDraft}
            onContextMenu={props.onDraftContextMenu}
          />
        );
      })}
      {!props.parentRowId && (
        <li
          aria-hidden
          data-testid="sidebar-draft-divider"
          className="mx-2.5 my-1.5 h-px list-none bg-sidebar-border/60"
        />
      )}
    </>
  );
});
