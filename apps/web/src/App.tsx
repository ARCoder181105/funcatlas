import { Suspense, lazy } from "react";
import { APP_ROUTE } from "@funcatlas/shared";
import { Landing } from "./components/landing/Landing";
import { ResolvingSession } from "./components/ResolvingSession";
import { usePath } from "./lib/router";

/**
 * The canvas and everything under it -- React Flow, the resizable panels, the
 * command palette, Shiki -- fetched only when someone actually goes to `/app`.
 *
 * Statically imported, all of that landed in the main bundle and every visitor
 * to the landing page downloaded a canvas they had not asked for. On a showcase
 * build it is worse than waste: there is no API behind `/app`, so the chunk can
 * never be used at all.
 *
 * `Landing` stays static. It is what `/` renders and what most visitors will
 * only ever see, so making it wait on a second round trip would be paying the
 * cost in the one place it is least worth paying.
 */
const AppRoute = lazy(() => import("./AppRoute"));

/**
 * Two routes. Anything that is not the canvas is the landing page -- there is
 * no 404, because there is nothing else to be.
 *
 * The split matters beyond tidiness: `useSession` lives inside `AppRoute`, so
 * the landing page issues no request at all and renders with the API down. A
 * marketing page that needs a backend to say what the product is is not a
 * marketing page.
 */
export default function App() {
  if (usePath() !== APP_ROUTE) {
    return <Landing />;
  }

  return (
    <Suspense fallback={<ResolvingSession />}>
      <AppRoute />
    </Suspense>
  );
}
