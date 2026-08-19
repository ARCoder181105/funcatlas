import type { SearchResult } from "@funcatlas/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useUiStore } from "../store/ui";
import { CommandPalette } from "./CommandPalette";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, search: vi.fn() } };
});

const mocked = vi.mocked(api);

function hit(id: number, name: string, path = "source/core/Ky.ts"): SearchResult {
  return {
    id,
    name,
    qualifiedName: name,
    packagePath: "source/core",
    overloadIndex: 0,
    startLine: 42,
    endLine: 50,
    fileId: 7,
    path,
  };
}

function renderPalette() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.getState().clearSelection();
  useUiStore.getState().setPaletteOpen(false);
  mocked.search.mockResolvedValue({ repoId: 1, query: "", results: [] });
});

describe("CommandPalette", () => {
  it("opens on the keyboard shortcut", async () => {
    const user = userEvent.setup();
    renderPalette();

    expect(useUiStore.getState().paletteOpen).toBe(false);
    await user.keyboard("{Control>}k{/Control}");

    expect(useUiStore.getState().paletteOpen).toBe(true);
  });

  it("does not steal the shortcut from a field the reader is typing in", async () => {
    // The repository URL box takes a pasted GitHub URL. Swallowing a keystroke
    // inside it to open a palette over the top is worse than no shortcut.
    const user = userEvent.setup();
    renderPalette();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();

    await user.keyboard("{Control>}k{/Control}");

    expect(useUiStore.getState().paletteOpen).toBe(false);
    field.remove();
  });

  it("says search is repo-scoped when no repository is chosen", async () => {
    useUiStore.getState().setPaletteOpen(true);
    renderPalette();

    expect(
      await screen.findByText(/Choose a repository first/),
    ).toBeInTheDocument();
    // And it does not ask the API for /api/repos/null/search.
    expect(mocked.search).not.toHaveBeenCalled();
  });

  it("asks for a name before searching for one", async () => {
    useUiStore.getState().selectRepo(1);
    useUiStore.getState().setPaletteOpen(true);
    renderPalette();

    expect(await screen.findByText("Type part of a function name.")).toBeInTheDocument();
    // An empty box is not a query: asking for "" returns the first N functions
    // in the repository, which looks like a result and is not one.
    expect(mocked.search).not.toHaveBeenCalled();
  });

  it("lists what the server returned, in the order it returned it", async () => {
    // The API ranks prefix matches above substring matches. cmdk filters by
    // default, which would re-sort that ranking by its own fuzzy score.
    mocked.search.mockResolvedValue({
      repoId: 1,
      query: "user",
      results: [hit(1, "getUser"), hit(2, "createUserSession", "source/core/session.ts")],
    });
    const user = userEvent.setup();
    useUiStore.getState().selectRepo(1);
    useUiStore.getState().setPaletteOpen(true);
    renderPalette();

    await user.type(await screen.findByPlaceholderText("Find a function…"), "user");

    expect(await screen.findByText("getUser")).toBeInTheDocument();
    expect(screen.getByText("createUserSession")).toBeInTheDocument();

    const shown = screen.getAllByRole("option").map((option) => option.textContent);
    expect(shown[0]).toContain("getUser");
    expect(shown[1]).toContain("createUserSession");
  });

  it("says so when nothing matches, quoting what was searched for", async () => {
    mocked.search.mockResolvedValue({ repoId: 1, query: "zzz", results: [] });
    const user = userEvent.setup();
    useUiStore.getState().selectRepo(1);
    useUiStore.getState().setPaletteOpen(true);
    renderPalette();

    await user.type(await screen.findByPlaceholderText("Find a function…"), "zzz");

    expect(await screen.findByText(/No function matches/)).toBeInTheDocument();
  });

  it("lands on the function, and on the file it lives in", async () => {
    mocked.search.mockResolvedValue({ repoId: 1, query: "getUser", results: [hit(1, "getUser")] });
    const user = userEvent.setup();
    useUiStore.getState().selectRepo(1);
    useUiStore.getState().setPaletteOpen(true);
    renderPalette();

    await user.type(await screen.findByPlaceholderText("Find a function…"), "getUser");
    await user.click(await screen.findByText("getUser"));

    // The file card, the mind-map and the source all follow from these two.
    const state = useUiStore.getState();
    expect(state.selectedFileId).toBe(7);
    expect(state.rootFunctionIds).toEqual([1]);
    expect(state.selectedFunctionId).toBe(1);
    expect(state.paletteOpen).toBe(false);

    // And it is gone from the page, not merely marked closed. Base UI holds a
    // closing popup in the tree until it sees its exit animation finish, which
    // in this app it never does -- the palette stayed on screen, over a canvas
    // that had already moved, and Escape could not shift it either. Asserting
    // the store alone missed that entirely.
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Find a function…")).not.toBeInTheDocument();
    });
  });
});
