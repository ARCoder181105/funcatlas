import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { APP_ROUTE } from "@funcatlas/shared";

/**
 * `SHOWCASE` is read from `import.meta.env` once, at module load, because it is
 * a build-time fact rather than a runtime one. So each case has to reset the
 * module graph and import again -- stubbing the env after the import would
 * leave the already-evaluated constant behind and both cases would pass
 * against the same build.
 */
async function renderCta(showcase: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_SHOWCASE", showcase ? "true" : "false");

  const { OpenAtlas } = await import("./OpenAtlas");
  render(<OpenAtlas />);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OpenAtlas", () => {
  it("opens the canvas in a normal build", async () => {
    await renderCta(false);

    const cta = screen.getByRole("link", { name: /open the atlas/i });
    expect(cta).toHaveAttribute("href", APP_ROUTE);
  });

  it("sends readers to the repository when there is no API behind it", async () => {
    await renderCta(true);

    // `/app` on a web-only deploy reaches nothing, so pointing at it would send
    // every visitor to an error screen.
    const cta = screen.getByRole("link", { name: /run it yourself/i });
    expect(cta).toHaveAttribute("href", expect.stringContaining("github.com"));
    expect(screen.queryByRole("link", { name: /open the atlas/i })).not.toBeInTheDocument();
  });

  it("changes the label with the destination, not just the href", async () => {
    // A button still reading "Open the atlas" that opened GitHub would be the
    // same lie in a friendlier voice (UI_GUIDE §3.4: an action keeps its name
    // through the flow, so a different flow needs a different name).
    await renderCta(true);

    const cta = screen.getByRole("link", { name: /run it yourself/i });
    expect(cta).not.toHaveAttribute("href", APP_ROUTE);
  });
});
