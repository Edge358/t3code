import { useState, useSyncExternalStore, type ComponentProps, type ComponentType } from "react";
import type { ExtraProps } from "react-markdown";
import { normalizeMarkdownLinkDestination } from "@t3tools/shared/markdownLinks";
import { Button } from "../ui/button";

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

/** Gate before mounting the renderer: asset/proxy hooks must not fetch ahead of consent. */
export function withRemoteMediaConsent(RenderImage: ComponentType<MarkdownImageProps>) {
  return function RemoteMediaConsent(props: MarkdownImageProps) {
    const automatic = useAutomaticRemoteMedia();
    const [approvedSource, setApprovedSource] = useState<string | null>(null);
    const localSource = props.node?.properties?.dataLocalSrc;
    const source = normalizeMarkdownLinkDestination(
      typeof localSource === "string"
        ? localSource
        : typeof props.src === "string"
          ? props.src
          : "",
    );
    const remote = /^(?:https?:)?\/\//i.test(source.trim());
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
