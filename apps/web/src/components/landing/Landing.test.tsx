import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { APP_ROUTE } from "@funcatlas/shared";
import { CONFIDENCE, CONFIDENCE_ORDER } from "../../lib/confidence";
import { Landing } from "./Landing";

// Smooth scrolling has nothing to assert in a document with no layout, and
// Lenis reaches for scroll APIs jsdom does not implement.
vi.mock("../../lib/useSmoothScroll", () => ({ useSmoothScroll: () => {} }));

function renderLanding() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Landing />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("the landing page", () => {
  it("asks for nothing from our API", () => {
    // The page explains the product. Needing the backend up to do that would
    // make it fail exactly when someone most needs to read it.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("offline"));

    renderLanding();

    const ours = fetchSpy.mock.calls.filter(
      ([input]) => !String(input).includes("api.github.com"),
    );
    expect(ours).toEqual([]);
  });

  it("sends every call to action to the canvas", () => {
    renderLanding();

    const ctas = screen.getAllByRole("link", { name: /open the atlas/i });
    expect(ctas.length).toBeGreaterThan(1);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", APP_ROUTE);
    }
  });

  it("names all three tiers and what each one means", () => {
    renderLanding();

    const tiers = screen
      .getByRole("heading", { name: /certainty is the product/i })
      .closest("section");
    expect(tiers).not.toBeNull();

    for (const tier of CONFIDENCE_ORDER) {
      const { label, meaning } = CONFIDENCE[tier];
      expect(within(tiers as HTMLElement).getByText(label)).toBeInTheDocument();
      expect(
        within(tiers as HTMLElement).getByText(meaning),
      ).toBeInTheDocument();
    }
  });

  it("states the limits rather than leaving them to the docs", () => {
    renderLanding();

    // Public-repositories-only is the constraint a reader hits first, and
    // finding it out after signing in is the experience this prevents.
    expect(screen.getByText(/public repositories only/i)).toBeInTheDocument();
    // Said in the hero and again at the closing call to action -- a reader who
    // scrolls past the first one still meets it before signing in.
    expect(screen.getAllByText(/read:user/).length).toBeGreaterThan(1);
    expect(
      screen.getByText(/extracted, resolved within a file/i),
    ).toBeInTheDocument();
  });

  it("shows the index with a function count on every file", () => {
    renderLanding();

    const index = screen
      .getByRole("heading", { name: /an atlas has an index/i })
      .closest("section");
    expect(index).not.toBeNull();

    // The count is what the sidebar puts beside a path, and it is the reason
    // the tree is worth showing at all rather than describing.
    const files = within(index as HTMLElement).getAllByText(/\.(tsx?|go)$/);
    expect(files.length).toBeGreaterThan(3);
    expect(within(index as HTMLElement).getByText("23")).toBeInTheDocument();
  });

  it("ships a canvas shot for each theme", () => {
    renderLanding();

    // Two files rather than one filtered: the tier colours are the subject of
    // the picture, and a recoloured dark shot would misstate them. A single
    // image here means one theme is showing the other theme's palette.
    const shots = screen.getAllByRole("img", { name: /funcatlas canvas/i });
    expect(shots.map((s) => s.getAttribute("src"))).toEqual([
      "/canvas-dark.png",
      "/canvas-light.png",
    ]);
  });

  it("links to the source even when GitHub will not answer", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("rate limited"));

    renderLanding();

    const links = await screen.findAllByRole("link", {
      name: /funcatlas on github/i,
    });
    expect(links[0]).toHaveAttribute(
      "href",
      expect.stringContaining("github.com"),
    );
  });
});
