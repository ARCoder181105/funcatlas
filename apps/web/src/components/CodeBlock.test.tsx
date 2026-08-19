import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { highlight } from "../lib/highlight";
import { CodeBlock } from "./CodeBlock";

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, api: { ...actual.api, functionSource: vi.fn() } };
});

/**
 * Shiki is mocked, not exercised. Loading its grammars in jsdom costs seconds
 * per test to prove something Shiki's own suite already proves; what this file
 * is about is what the component does with the markup it gets back.
 */
vi.mock("../lib/highlight", () => ({
  highlight: vi.fn(async () => `<pre class="shiki"><code><span class="line">body</span></code></pre>`),
}));

const mocked = vi.mocked(api);
const mockedHighlight = vi.mocked(highlight);

const SOURCE = {
  id: 1,
  source: "function createInstance() {\n  return ky;\n}",
  startLine: 118,
  endLine: 140,
  path: "source/core/Ky.ts",
  language: "typescript",
};

function renderCodeBlock() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CodeBlock functionId={1} showAll={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.functionSource.mockResolvedValue(SOURCE);
});

describe("CodeBlock", () => {
  it("highlights the source in the file's own language", async () => {
    renderCodeBlock();

    expect(await screen.findByText("body")).toBeInTheDocument();
    expect(mockedHighlight).toHaveBeenCalledWith(SOURCE.source, "typescript");
  });

  it("numbers the lines from the function's real position in the file", async () => {
    const { container } = renderCodeBlock();
    await screen.findByText("body");

    // index.css increments a counter per line, so the block only has to say
    // where the count starts. Numbering a function at line 118 from 1 would
    // stop the block matching the file it came from.
    const block = container.querySelector(".code-block");
    expect(block).toHaveStyle({ counterReset: "line 117" });
    expect(screen.getByText("source/core/Ky.ts")).toBeInTheDocument();
    expect(screen.getByText("118–140")).toBeInTheDocument();
  });

  it("explains a missing source rather than showing a blank panel", async () => {
    // `source` is nullable in the schema: the parser skips files over 1 MB and
    // stores the function without a body.
    mocked.functionSource.mockResolvedValue({ ...SOURCE, source: null });

    renderCodeBlock();

    expect(await screen.findByText(/no source for this function/i)).toBeInTheDocument();
    // Nothing to highlight, so nothing is asked of Shiki.
    expect(mockedHighlight).not.toHaveBeenCalled();
  });

  it("reports a failed request instead of waiting forever", async () => {
    mocked.functionSource.mockRejectedValue(new Error("network"));

    renderCodeBlock();

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
