import { useEffect, useState } from "react";
import type { SearchResult } from "@funcatlas/shared";
import { ApiError } from "../lib/api";
import { useSearch } from "../lib/search";
import { useDebounced } from "../lib/useDebounced";
import { useUiStore } from "../store/ui";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";

/**
 * Find a function by name — the half of the phase's exit test the canvas does
 * not cover.
 *
 * Selecting a result sets the file and the function, so one keystroke lands the
 * reader on a card, its mind-map and its source. Search is repo-scoped because
 * the API is: function ids mean nothing outside the repository they were parsed
 * from.
 */
export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const selectFile = useUiStore((state) => state.selectFile);
  const toggleRoot = useUiStore((state) => state.toggleRoot);

  // Local, and gone with the component when it closes -- a palette that
  // reopens on its last search is answering a question the reader stopped
  // asking.
  const [typed, setTyped] = useState("");
  const query = useDebounced(typed);
  const search = useSearch(selectedRepoId, query);

  useHotkey(() => setPaletteOpen(true));

  const choose = (result: SearchResult) => {
    // File first: `selectFile` clears the map, so setting the function before
    // it would immediately throw the selection away.
    selectFile(result.fileId);
    toggleRoot(result.id);
    setPaletteOpen(false);
  };

  // Rendered only while open, rather than left mounted with `open={false}`.
  //
  // Base UI keeps a closing popup in the tree until its exit animation is
  // observed to finish, and here that never happens: the popup ends up with
  // `data-closed` set, `getAnimations()` empty and the dialog still on screen
  // and still taking clicks -- selecting a result updated the canvas behind a
  // palette that would not go away, and Escape could not close it either.
  // Unmounting the subtree is not a workaround for a race; it is the state we
  // actually mean.
  if (!open) return null;

  return (
    <CommandDialog
      open
      onOpenChange={setPaletteOpen}
      title="Find a function"
      description="Search every function in this repository by name."
    >
      {/* The server ranked these with the whole index in front of it -- prefix
          matches above substring matches. cmdk filters by default, which would
          quietly re-sort that ranking by its own fuzzy score. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Find a function…"
          value={typed}
          onValueChange={setTyped}
          autoFocus
        />
        <CommandList>
          <Results
            repoId={selectedRepoId}
            typed={typed}
            settled={query}
            search={search}
            onChoose={choose}
          />
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Every state but the list itself is a plain message rather than cmdk's
 *  `Command.Empty`, which only renders once its own input has a value -- so
 *  "type something" would be the one state it could never show. */
function Message({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

/**
 * The five things this list can be showing, kept together so none is
 * forgotten: no repository, nothing typed, still searching, no matches, and
 * matches.
 */
function Results({
  repoId,
  typed,
  settled,
  search,
  onChoose,
}: {
  repoId: number | null;
  typed: string;
  /** What the API was actually asked, which lags `typed` by the debounce. */
  settled: string;
  search: ReturnType<typeof useSearch>;
  onChoose: (result: SearchResult) => void;
}) {
  if (repoId === null) {
    return <Message>Choose a repository first — search looks inside one at a time.</Message>;
  }

  if (typed.trim() === "") {
    return <Message>Type part of a function name.</Message>;
  }

  // Pending covers both the debounce and the request, so the palette never
  // flashes "nothing found" at a query it has not asked yet.
  if (search.isPending || typed !== settled) {
    return (
      <Message>
        <span className="inline-flex items-center gap-2">
          <Spinner className="size-3.5" aria-hidden />
          Searching…
        </span>
      </Message>
    );
  }

  if (search.isError) {
    return (
      <Message>
        {search.error instanceof ApiError
          ? (search.error.detail ?? search.error.message)
          : "The search did not run."}
      </Message>
    );
  }

  const results = search.data.results;

  if (results.length === 0) {
    return <Message>No function matches “{settled}”.</Message>;
  }

  return (
    <CommandGroup heading={`${results.length} ${results.length === 1 ? "match" : "matches"}`}>
      {results.map((result) => (
        <CommandItem
          key={result.id}
          // The server's order is the ranking; cmdk keys its own sorting off
          // this value, so it has to stay unique and stable.
          value={String(result.id)}
          onSelect={() => onChoose(result)}
          className="gap-3"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-xs text-foreground">{result.name}</span>
            {/* The path always, the qualified name only when it says more than
                the name does -- `Repo.sync` earns it, `getUser` does not. */}
            <span className="block truncate font-mono text-[10px] text-muted-foreground">
              {result.qualifiedName !== result.name ? `${result.qualifiedName} · ` : ""}
              {result.path}
            </span>
          </span>
          <Badge variant="outline" className="shrink-0 font-mono text-[10px] tabular-nums">
            {result.startLine}
          </Badge>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/**
 * ⌘K, and Ctrl+K for anyone not on a Mac.
 *
 * Ignored while the reader is typing in a field: the repository URL box takes
 * a pasted GitHub URL, and swallowing a keystroke inside it to open a palette
 * over the top would be worse than not having a shortcut at all.
 */
function useHotkey(open: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;

      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      // The palette's own input is a field too, but it is inside the dialog, so
      // by then the palette is already open and there is nothing to do.
      if (typing) return;

      event.preventDefault();
      open();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
