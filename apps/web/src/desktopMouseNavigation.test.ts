import { expect, it } from "vite-plus/test";
import { installDesktopMouseNavigationGuard } from "./desktopMouseNavigation";

function mouse(type: string, button: number) {
  return Object.assign(new Event(type, { cancelable: true }), { button });
}

it.each([3, 4])(
  "cancels a lone history-button release (%s) and full clicks, then removes the guard",
  (button) => {
    const target = new EventTarget();
    const stop = installDesktopMouseNavigationGuard(target);
    try {
      const release = mouse("mouseup", button);
      target.dispatchEvent(release);
      expect(release.defaultPrevented).toBe(true);
      for (const type of ["mousedown", "mouseup", "auxclick"]) {
        const event = mouse(type, button);
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }
    } finally {
      stop();
    }
    const release = mouse("mouseup", button);
    target.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(false);
  },
);

it("preserves other inputs and lets preview handlers receive history buttons", () => {
  const target = new EventTarget();
  const stop = installDesktopMouseNavigationGuard(target);
  try {
    for (const type of ["mousedown", "mouseup", "auxclick", "wheel", "keydown"]) {
      for (const button of [0, 1, 2]) {
        const event = mouse(type, button);
        target.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      }
    }
    let received = false;
    target.addEventListener("mouseup", () => {
      received = true;
    });
    target.dispatchEvent(mouse("mouseup", 3));
    expect(received).toBe(true);
  } finally {
    stop();
  }
});
