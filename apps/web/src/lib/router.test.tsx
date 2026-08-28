import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, navigate, usePath } from "./router";

function Path() {
  return <p>at {usePath()}</p>;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("usePath", () => {
  it("follows a programmatic navigation", async () => {
    render(<Path />);
    expect(screen.getByText("at /")).toBeInTheDocument();

    navigate("/app");

    // pushState raises no event of its own, so this only passes because
    // navigate() dispatches one.
    expect(await screen.findByText("at /app")).toBeInTheDocument();
  });

  it("follows the back button", async () => {
    render(<Path />);
    navigate("/app");
    await screen.findByText("at /app");

    // jsdom moves history but does not fire popstate for it, so the event is
    // raised here the way a browser would.
    window.history.replaceState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(await screen.findByText("at /")).toBeInTheDocument();
  });
});

describe("Link", () => {
  it("carries a real href, so it can be copied and opened in a new tab", () => {
    render(<Link to="/app">Open the atlas</Link>);

    expect(screen.getByRole("link", { name: "Open the atlas" })).toHaveAttribute("href", "/app");
  });

  it("handles a plain click itself, without a page load", async () => {
    render(
      <>
        <Link to="/app">Open the atlas</Link>
        <Path />
      </>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Open the atlas" }));

    expect(screen.getByText("at /app")).toBeInTheDocument();
  });

  it("leaves a modifier-click to the browser", async () => {
    render(
      <>
        <Link to="/app">Open the atlas</Link>
        <Path />
      </>,
    );

    // `setup()`, not the bare `userEvent.click`: each bare call is a fresh
    // instance and forgets the held key, so the modifier never reaches the
    // handler and the assertion passes without testing anything.
    const user = userEvent.setup();

    // Meta-click means "open in a new tab". Calling preventDefault here is the
    // classic hand-rolled-router bug: the link stops working as a link.
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("link", { name: "Open the atlas" }));
    await user.keyboard("{/Meta}");

    expect(screen.getByText("at /")).toBeInTheDocument();
  });

  it("still calls a handler the caller passed", async () => {
    const onClick = vi.fn();
    render(
      <Link to="/app" onClick={onClick}>
        Open the atlas
      </Link>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Open the atlas" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
