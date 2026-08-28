import { useSyncExternalStore, type ComponentPropsWithoutRef, type MouseEvent } from "react";

/**
 * Two routes, so this is the router.
 *
 * `/` is the landing page and `/app` is the canvas -- no parameters, no nested
 * layouts, no data loading. TanStack Query already owns everything from the
 * server and Zustand owns the canvas, so a router library would arrive with a
 * data layer that has nothing to do and a config about as long as this file.
 *
 * The part worth getting right is `Link`: a hand-rolled one usually swallows
 * the modifier-click that means "open this in a new tab". This one does not.
 */

/** `pushState` raises no event of its own, so `navigate` raises this one.
 *  `popstate` covers the back and forward buttons; nothing covers our own
 *  pushes. */
const NAVIGATED = "funcatlas:navigated";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
}

function currentPath(): string {
  return window.location.pathname;
}

/** The active path. Read from `location` every time rather than mirrored into
 *  state, which is the copy that drifts when the back button moves one and not
 *  the other. */
export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath);
}

export function navigate(to: string): void {
  if (to === currentPath()) return;

  window.history.pushState(null, "", to);
  // A push is a new page, not a new position on this one. Going back is left
  // alone: the browser restores that scroll itself.
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(NAVIGATED));
}

type LinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & { to: string };

/**
 * A real anchor with a real `href`, so it is copyable, middle-clickable and
 * announced as a link. The click handler claims only a plain left click --
 * anything holding a modifier means "somewhere else", and the browser is
 * better at that than we are.
 */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    navigate(to);
  };

  return <a {...rest} href={to} onClick={handleClick} />;
}
