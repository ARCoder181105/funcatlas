import { useEffect, useState } from "react";

/**
 * The value, once it has stopped changing.
 *
 * Every keystroke reaching `GET /api/repos/:id/search` is a self-inflicted load
 * test: typing `getUser` is seven queries against Postgres for six answers
 * nobody reads. This holds the last value back until the typing pauses.
 *
 * Deliberately not a debounced *callback*. A held value is a render input --
 * it can be passed to a query key, compared, and tested without a component --
 * whereas a debounced function has to be kept stable across renders or it
 * cancels itself on every one.
 */
export function useDebounced<T>(value: T, delay = 180): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    // Every change cancels the pending one, which is the whole mechanism: only
    // the last value in a burst survives to be set.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
