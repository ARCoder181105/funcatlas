import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Self-hosted: Vite bundles the woff2 out of node_modules and serves it from
// our own origin. A font fetched from a CDN at runtime is a third-party
// dependency on every page load, and it is why a slow network shows an
// unstyled page. The two sans faces are variable, so one file covers every
// weight; the mono is static and only the weights in use are pulled in.
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
