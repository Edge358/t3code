export function installDesktopMouseNavigationGuard(target: EventTarget): () => void {
  const cancelHistory = (event: Event) => {
    const button = (event as MouseEvent).button;
    if (button === 3 || button === 4) event.preventDefault();
  };
  // Chromium can navigate on an isolated mouseup when a global dictation hook
  // consumed only the press. Preserve propagation for preview-owned history.
  const events = ["mousedown", "mouseup", "auxclick"] as const;
  for (const type of events) target.addEventListener(type, cancelHistory, true);
  return () => {
    for (const type of events) target.removeEventListener(type, cancelHistory, true);
  };
}
