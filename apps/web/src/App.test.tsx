import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ApiError, api } from "./lib/api";

// The real module is kept for ApiError -- session.ts branches on
// `instanceof`, so a stubbed class would make the 401 path silently dead.
vi.mock("./lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/api")>();
  return {
    ...actual,
    api: {
      loginUrl: () => "http://api.test/auth/login",
      me: vi.fn(),
      logout: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

/** `retry` left at the library default unless a test needs otherwise, so the
 *  no-retry-on-401 assertion is not made vacuous by the test setup. */
function renderApp(retry: boolean | number = 3) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

const SIGNED_OUT = new ApiError(401, "unauthorized");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session states", () => {
  it("shows the shape of the app while the session is resolving", () => {
    mocked.me.mockReturnValue(new Promise(() => {}));

    renderApp();

    // A skeleton, not a spinner, and not a flash of the sign-in card before
    // the answer arrives.
    expect(screen.getByRole("generic", { busy: true })).toBeInTheDocument();
    expect(screen.queryByText("Sign in with GitHub")).not.toBeInTheDocument();
  });

  it("shows the sign-in card when signed out", async () => {
    mocked.me.mockRejectedValue(SIGNED_OUT);

    renderApp();

    expect(await screen.findByRole("link", { name: /sign in with github/i })).toBeInTheDocument();
  });

  it("shows the explorer when signed in", async () => {
    mocked.me.mockResolvedValue({ userId: 7, login: "octocat" });

    renderApp();

    expect(await screen.findByText("octocat")).toBeInTheDocument();
    expect(screen.queryByText("Sign in with GitHub")).not.toBeInTheDocument();
  });

  it("does not retry a 401", async () => {
    mocked.me.mockRejectedValue(SIGNED_OUT);

    renderApp();
    await screen.findByRole("link", { name: /sign in with github/i });

    // Signed out is an answer. Retried three times with backoff it would hold
    // the app on a skeleton for seconds before showing the card.
    expect(mocked.me).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an unreachable API from being signed out", async () => {
    mocked.me.mockRejectedValue(new ApiError(500, "boom"));

    renderApp(false);

    // A sign-in button here would point at an API that cannot answer.
    expect(await screen.findByText(/api is not responding/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in with github/i })).not.toBeInTheDocument();
  });
});

describe("signing in and out", () => {
  it("signs in by navigating, not by fetching", async () => {
    mocked.me.mockRejectedValue(SIGNED_OUT);

    renderApp();
    const link = await screen.findByRole("link", { name: /sign in with github/i });

    // An OAuth redirect cannot be followed by XHR, so this has to be an
    // anchor carrying a real href.
    expect(link).toHaveAttribute("href", "http://api.test/auth/login");
  });

  it("returns to the sign-in card after signing out", async () => {
    mocked.me.mockResolvedValue({ userId: 7, login: "octocat" });
    mocked.logout.mockResolvedValue(undefined);

    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(await screen.findByRole("link", { name: /sign in with github/i })).toBeInTheDocument();
    expect(mocked.logout).toHaveBeenCalledTimes(1);
  });
});

describe("the file tree panel", () => {
  it("labels the toggle by what it does, and survives being used", async () => {
    mocked.me.mockResolvedValue({ userId: 7, login: "octocat" });

    renderApp();

    // The label names the action, not the current state (UI_GUIDE §3.4).
    const hide = await screen.findByRole("button", { name: /hide the file tree/i });
    await userEvent.click(hide);

    // The label flip is deliberately not asserted here. Collapsed state is
    // derived from the size the panel reports, and jsdom has no layout, so
    // onResize never fires -- asserting the flip would only prove the stub.
    // Verified in a real browser instead.
    expect(hide).toBeInTheDocument();
  });

  it("gives the panel a keyboard-reachable resize handle", async () => {
    mocked.me.mockResolvedValue({ userId: 7, login: "octocat" });

    renderApp();
    await screen.findByText("octocat");

    // Scoped by slot: the header carries a decorative separator too, and
    // getByRole("separator") would match both.
    const handle = document.querySelector('[data-slot="resizable-handle"]');
    expect(handle).not.toBeNull();
    // Draggable is not enough on its own -- a pointer-only resize fails the
    // quality floor in UI_GUIDE §5.1.
    expect(handle).toHaveAttribute("tabindex", "0");
  });
});
