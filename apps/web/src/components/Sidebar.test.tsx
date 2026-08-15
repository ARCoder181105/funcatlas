import type { FileNode } from "@funcatlas/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../store/ui";
import { Sidebar } from "./Sidebar";
import { SidebarProvider } from "./ui/sidebar";
import { TooltipProvider } from "./ui/tooltip";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, listRepos: vi.fn(), tree: vi.fn(), registerRepo: vi.fn() },
  };
});

const mocked = vi.mocked(api);

let nextId = 1;
function file(path: string, functionCount = 1): FileNode {
  return { id: nextId++, path, language: "typescript", functionCount };
}

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider open>
          <Sidebar />
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.getState().clearSelection();
  mocked.listRepos.mockResolvedValue({ repos: [] });
});

describe("Sidebar", () => {
  it("invites the reader to choose a repository when none is selected", async () => {
    renderSidebar();

    expect(await screen.findByText("Nothing charted")).toBeInTheDocument();
    // No repository means no tree request at all -- not a request for
    // /api/repos/null/tree that 404s.
    expect(mocked.tree).not.toHaveBeenCalled();
  });

  it("says the repository is empty rather than reporting a failure", async () => {
    // A repository with no files is a valid answer, not an error. Phase 3a drew
    // that distinction on purpose and the UI has to keep it.
    useUiStore.getState().selectRepo(7);
    mocked.tree.mockResolvedValue({ repoId: 7, files: [] });

    renderSidebar();

    expect(await screen.findByText("No files to chart")).toBeInTheDocument();
    expect(screen.queryByText(/did not load/i)).not.toBeInTheDocument();
  });

  it("names the reason when the tree fails to load", async () => {
    useUiStore.getState().selectRepo(7);
    mocked.tree.mockRejectedValue(new ApiError(500, "internal", "the parser is not reachable"));

    renderSidebar();

    expect(await screen.findByText("The file tree did not load")).toBeInTheDocument();
    expect(screen.getByText(/the parser is not reachable/)).toBeInTheDocument();
  });

  it("nests files under their directories and counts what is inside", async () => {
    useUiStore.getState().selectRepo(7);
    mocked.tree.mockResolvedValue({
      repoId: 7,
      files: [file("src/lib/parse.ts", 4), file("src/index.ts", 2), file("README.md", 0)],
    });

    renderSidebar();

    expect(await screen.findByText("src")).toBeInTheDocument();
    expect(screen.getByText("lib")).toBeInTheDocument();
    expect(screen.getByText("index.ts")).toBeInTheDocument();
    // 4 + 2 rolled up to src.
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("selects a file when its row is clicked", async () => {
    const user = userEvent.setup();
    useUiStore.getState().selectRepo(7);
    const target = file("src/index.ts", 2);
    mocked.tree.mockResolvedValue({ repoId: 7, files: [target] });

    renderSidebar();

    await user.click(await screen.findByText("index.ts"));
    expect(useUiStore.getState().selectedFileId).toBe(target.id);
  });

  it("shows no count badge for a file with no functions", async () => {
    useUiStore.getState().selectRepo(7);
    mocked.tree.mockResolvedValue({ repoId: 7, files: [file("README.md", 0)] });

    renderSidebar();

    expect(await screen.findByText("README.md")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("opens the palette from the footer button", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(await screen.findByRole("button", { name: /find a function/i }));
    expect(useUiStore.getState().paletteOpen).toBe(true);
  });
});
