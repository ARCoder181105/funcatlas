import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounced } from "./useDebounced";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebounced", () => {
  it("returns the first value without waiting for it", () => {
    // Nothing has changed yet, so there is nothing to hold back -- a palette
    // that starts empty should not spend its first frame pending.
    const { result } = renderHook(() => useDebounced("getUser", 200));
    expect(result.current).toBe("getUser");
  });

  it("holds a change back until the typing stops", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 200), {
      initialProps: { value: "" },
    });

    rerender({ value: "get" });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current).toBe("get");
  });

  it("only lets the last value of a burst through", () => {
    // Typing `getUser` one character at a time is one query, not seven. This
    // is the whole reason the hook exists.
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 200), {
      initialProps: { value: "" },
    });

    for (const value of ["g", "ge", "get", "getU", "getUs", "getUse", "getUser"]) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }

    // Still nothing: no gap in that burst was long enough.
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("getUser");
  });

  it("forgets a value the reader backed out of", () => {
    // Typing and then clearing must settle on the cleared value, not on
    // whatever was longest -- otherwise the palette keeps showing results for
    // a query that is no longer on screen.
    const { result, rerender } = renderHook(({ value }) => useDebounced(value, 200), {
      initialProps: { value: "" },
    });

    rerender({ value: "getUser" });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ value: "" });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("");
  });
});
