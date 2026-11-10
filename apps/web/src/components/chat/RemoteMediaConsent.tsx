import {
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import type { ExtraProps } from "react-markdown";
import { normalizeMarkdownLinkDestination } from "@t3tools/shared/markdownLinks";
import { Button } from "../ui/button";
import { useRenderedAppearance } from "../../hooks/useTheme";

const STORAGE_KEY = "t3.private-build.automatic-remote-media";
const CHANGE_EVENT = "t3-remote-media-preference";

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

/** For non-React code; components use `useAutomaticRemoteMedia`. */
export function automaticRemoteMediaEnabled(): boolean {
  return readPreference();
}

export function useAutomaticRemoteMedia() {
  return useSyncExternalStore(subscribe, readPreference, () => false);
}

export function setAutomaticRemoteMedia(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // A blocked storage area leaves the default (explicit loading) in effect.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

type MarkdownImageProps = ComponentProps<"img"> & ExtraProps;

export function isRemoteMediaSource(source: string): boolean {
  return /^(?:https?:|[\\/]{2})/i.test(source.trim());
}

// Approvals last for this window session, so scrolling a row away and back does not ask again.
const approvedContent = new Set<string>();

/** Asks before mounting content that can contact outside hosts, unless automatic loading is on. */
export function RemoteContentGate(props: {
  readonly approvalKey: string;
  readonly message: string;
  readonly actionLabel: string;
  readonly children: ReactNode;
}) {
  const automatic = useAutomaticRemoteMedia();
  const [approvedKey, setApprovedKey] = useState<string | null>(null);
  // Keyed, so content that replaces approved content in the same slot still asks.
  const approved = approvedKey === props.approvalKey || approvedContent.has(props.approvalKey);
  if (automatic || approved) return props.children;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border/40 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1">{props.message}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          approvedContent.add(props.approvalKey);
          setApprovedKey(props.approvalKey);
        }}
      >
        {props.actionLabel}
      </Button>
    </div>
  );
}

/** Gate before mounting the renderer: asset/proxy hooks must not fetch ahead of consent. */
export function withRemoteMediaConsent(RenderImage: ComponentType<MarkdownImageProps>) {
  return function RemoteMediaConsent(props: MarkdownImageProps) {
    const automatic = useAutomaticRemoteMedia();
    const [approvedSource, setApprovedSource] = useState<string | null>(null);
    const appearance = useRenderedAppearance();
    const themeSource =
      props.node?.properties?.[appearance === "dark" ? "dataDarkSrc" : "dataLightSrc"];
    const localSource =
      typeof themeSource === "string" ? themeSource : props.node?.properties?.dataLocalSrc;
    const source = normalizeMarkdownLinkDestination(
      typeof localSource === "string"
        ? localSource
        : typeof props.src === "string"
          ? props.src
          : "",
    );
    // Browsers resolve "https:host" and "\host" to remote URLs too.
    const remote = isRemoteMediaSource(source);
    if (remote && !automatic && approvedSource !== source) {
      return (
        <span className="inline-flex items-center gap-2 rounded border border-border/40 px-2 py-1 text-xs">
          <span>{props.alt || "External media"}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setApprovedSource(source);
            }}
          >
            Load external media
          </Button>
        </span>
      );
    }
    // Do not allow a secondary srcSet to bypass the decision for the primary source.
    return <RenderImage {...props} srcSet={undefined} referrerPolicy="no-referrer" />;
  };
}
