import { cn } from "../../lib/cn";
import { GITHUB_REPO_URL } from "../../lib/constants";
import { LANDING_SHELL } from "./shell";

export function LandingFooter() {
  return (
    <footer className="border-t border-surface-border/50 py-10">
      <div
        className={cn(
          LANDING_SHELL,
          "flex flex-wrap items-center justify-between gap-4",
        )}
      >
        <span className="font-display text-sm tracking-tight text-ink">
          funcatlas
        </span>

        <p className="font-mono text-[11px] text-ink-muted">
          tree-sitter · Postgres ·{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-ink-muted underline underline-offset-4 transition-colors duration-micro hover:text-confidence-exact focus-visible:ring-2 focus-visible:ring-confidence-exact focus-visible:outline-none"
          >
            source
          </a>
        </p>
      </div>
    </footer>
  );
}
