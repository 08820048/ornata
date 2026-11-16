import { useCallback, useRef, useState } from "react";

const callbacks = new WeakMap<Element, () => void>();
let observer: IntersectionObserver | null = null;

function watch(element: Element, onSeen: () => void) {
  if (typeof IntersectionObserver === "undefined") {
    onSeen();
    return () => undefined;
  }
  // One observer for every card; a card is "seen" a screen before it scrolls in.
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        callbacks.get(entry.target)?.();
        callbacks.delete(entry.target);
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "800px 0px" },
  );
  callbacks.set(element, onSeen);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
  };
}

/**
 * True once the element has come near the viewport, and from then on. A big
 * folder builds its miniatures as they are scrolled to, not all at once.
 */
export function useSeen(): [(element: HTMLElement | null) => void, boolean] {
  const [seen, setSeen] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const ref = useCallback((element: HTMLElement | null) => {
    stop.current?.();
    stop.current = element ? watch(element, () => setSeen(true)) : null;
  }, []);
  return [ref, seen];
}
