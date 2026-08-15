import { StrictMode } from "react";
import type { FileNode } from "@funcatlas/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ReactFlow, { Background, ReactFlowProvider, type Edge, type Node } from "reactflow";
import { api } from "../lib/api";
import { useUiStore } from "../store/ui";
import { Canvas } from "./Canvas";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, tree: vi.fn(), functionsForFile: vi.fn() },
  };
});

const mocked = vi.mocked(api);

/**
 * The risk this chunk exists to close, carried since Phase 0.
 *
 * `reactflow@11.11.4` is the retired package name -- v12 is `@xyflow/react` --
 * and it declares `react >=17`, which was written long before 19 existed. It
 * installs and typechecks under React 19; neither of those is the same as
 * rendering under StrictMode, where every effect is mounted, torn down and
 * mounted again. If v11 cannot survive that, four chunks are about to be built
 * on a library that will not hold them, and this is the cheapest place to find
 * out.
 *
 * This file is deliberately about the library, not about our canvas. The
 * component tests live below it.
 */

/**
 * Dimensions are declared rather than left to be measured.
 *
 * React Flow will not draw an edge until both of its nodes have a width and a
 * height in its store, and it normally fills those in from a ResizeObserver
 * after layout. Where that never arrives -- jsdom, or any surface that is not
 * compositing -- the nodes still render and the edges silently do not. Since
 * `lib/graph.ts` states the size up front for exactly that reason, the fixture
 * does too.
 */
const NODES: Node[] = [
  { id: "a", position: { x: 0, y: 0 }, width: 208, height: 44, data: { label: "getUser" } },
  { id: "b", position: { x: 300, y: 100 }, width: 208, height: 44, data: { label: "fetchProfile" } },
];

const EDGES: Edge[] = [{ id: "a-b", source: "a", target: "b" }];

/**
 * React Flow measures its container and refuses to render nodes into a
 * zero-sized one. jsdom reports 0x0 for everything, so the dimensions are
 * stubbed here rather than in the shared setup -- this is the only suite that
 * needs them, and a global stub would quietly make a real sizing bug in
 * another component untestable.
 */
beforeAll(() => {
  const rect = {
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => {},
  };

  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: rect.width,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: rect.height,
  });
});

describe("reactflow v11 under React 19", () => {
  it("renders its nodes inside StrictMode", async () => {
    render(
      <StrictMode>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <ReactFlow nodes={NODES} edges={EDGES}>
              <Background />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </StrictMode>,
    );

    // Both nodes, not just the first: a library that mounts once and then
    // loses its store on StrictMode's second pass typically renders neither,
    // but a partial render is the subtler failure and worth pinning.
    expect(await screen.findByText("getUser")).toBeInTheDocument();
    expect(await screen.findByText("fetchProfile")).toBeInTheDocument();
  });

  it("survives the double mount without duplicating nodes", async () => {
    render(
      <StrictMode>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <ReactFlow nodes={NODES} edges={EDGES} />
          </ReactFlowProvider>
        </div>
      </StrictMode>,
    );

    await screen.findByText("getUser");
    // StrictMode mounts effects twice. A node registered on each pass without
    // being cleaned up shows up here as two elements.
    expect(screen.getAllByText("getUser")).toHaveLength(1);
  });

  /*
   * Edge rendering is deliberately not asserted here.
   *
   * React Flow draws an edge only once both of its nodes have been measured,
   * and measurement needs a real layout engine -- jsdom has none, and a
   * ResizeObserver stub that reports a size drives react-resizable-panels into
   * a re-layout loop that fails most of this suite. What decides *what* the
   * edges are lives in `lib/graph.ts` and is covered exhaustively there;
   * whether they paint is checked in a browser.
   */
});

const FILE: FileNode = { id: 42, path: "source/core/Ky.ts", language: "typescript", functionCount: 3 };

function renderCanvas() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <div style={{ width: 800, height: 600 }}>
        <Canvas />
      </div>
    </QueryClientProvider>,
  );
}

describe("Canvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.getState().clearSelection();
    mocked.tree.mockResolvedValue({ repoId: 7, files: [FILE] });
    mocked.functionsForFile.mockResolvedValue({
      fileId: FILE.id,
      functions: [
        {
          id: 1,
          name: "createInstance",
          qualifiedName: "createInstance",
          packagePath: "source/core",
          overloadIndex: 0,
          startLine: 118,
          endLine: 140,
        },
      ],
    });
  });

  it("invites the reader to chart a repository when none is chosen", async () => {
    renderCanvas();
    expect(await screen.findByText("Chart a repository")).toBeInTheDocument();
  });

  it("asks for a file once a repository is chosen", async () => {
    useUiStore.getState().selectRepo(7);
    renderCanvas();

    expect(await screen.findByText("Open a file")).toBeInTheDocument();
    // The copy has to change with the state; one empty message for both would
    // tell a reader with a repository open to go and choose one.
    expect(screen.queryByText("Chart a repository")).not.toBeInTheDocument();
  });

  it("shows a card for the selected file, with its functions", async () => {
    useUiStore.getState().selectRepo(7);
    useUiStore.getState().selectFile(FILE.id);

    renderCanvas();

    expect(await screen.findByText("source/core/Ky.ts")).toBeInTheDocument();
    expect(await screen.findByText("createInstance")).toBeInTheDocument();
    // The line number is what makes the list scannable against the real file.
    expect(screen.getByText("118")).toBeInTheDocument();
    expect(screen.queryByText("Open a file")).not.toBeInTheDocument();
  });

  it("does not ask for the source when listing functions", async () => {
    useUiStore.getState().selectRepo(7);
    useUiStore.getState().selectFile(FILE.id);

    renderCanvas();
    await screen.findByText("createInstance");

    // queries.ts leaves the body out on purpose: a file with two hundred
    // functions would otherwise ship two hundred bodies to render a list of
    // names. B6 fetches one function's source separately.
    expect(mocked.functionsForFile).toHaveBeenCalledWith(FILE.id);
  });

  it("selects a function when its row is clicked", async () => {
    const user = userEvent.setup();
    useUiStore.getState().selectRepo(7);
    useUiStore.getState().selectFile(FILE.id);

    renderCanvas();
    await user.click(await screen.findByText("createInstance"));

    // This is what B5's mind-map traverses from.
    expect(useUiStore.getState().selectedFunctionId).toBe(1);
  });

  it("says so when the parser found no functions in the file", async () => {
    mocked.functionsForFile.mockResolvedValue({ fileId: FILE.id, functions: [] });
    useUiStore.getState().selectRepo(7);
    useUiStore.getState().selectFile(FILE.id);

    renderCanvas();

    // A file the parser read and found nothing in is a real answer, not a
    // failure, and not a blank card either.
    expect(await screen.findByText("No functions here")).toBeInTheDocument();
  });
});
