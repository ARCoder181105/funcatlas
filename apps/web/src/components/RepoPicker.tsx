import { useState } from "react";
import { Check, ChevronsUpDown, FolderGit2, Plus } from "lucide-react";
import type { RepoSummary } from "@funcatlas/shared";
import { ApiError } from "../lib/api";
import { useRegisterRepo, useRepos } from "../lib/repos";
import { useUiStore } from "../store/ui";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Field, FieldDescription, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./ui/spinner";

/** `owner/repo`, which is what the reader recognises. The full URL is noise in
 *  a menu row and the API canonicalises it anyway. */
function shortName(githubUrl: string): string {
  return githubUrl
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "");
}

/**
 * Which repository the canvas is showing, and how to add another.
 *
 * Registration queues the parse and returns, so the dialog closes immediately
 * and progress is reported on the row instead of behind a modal.
 *
 * A menu rather than a combobox. `combobox` is installed and would add
 * filtering, but it wants to own the anchor input, which fights a trigger that
 * has to show the current selection. Worth revisiting when a reader has enough
 * repositories to scroll; not worth the structure today.
 */
export function RepoPicker() {
  const repos = useRepos();
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const selectRepo = useUiStore((state) => state.selectRepo);

  if (repos.isPending) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (repos.isError) {
    return (
      <p className="px-2 py-1.5 text-xs text-destructive">
        The repository list did not load. {messageFor(repos.error)}
      </p>
    );
  }

  const list = repos.data.repos;
  const current = list.find((repo) => repo.id === selectedRepoId);

  return (
    <ButtonGroup className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderGit2 strokeWidth={1.5} aria-hidden />
                <span className="truncate font-mono text-xs">
                  {current
                    ? shortName(current.githubUrl)
                    : "Choose a repository"}
                </span>
              </span>
              <ChevronsUpDown strokeWidth={1.5} aria-hidden />
            </Button>
          }
        />

        <DropdownMenuContent align="start" className="w-72">
          {/* The label has to sit inside a Group: Base UI's GroupLabel reads
              the group's context for its aria wiring and throws without one,
              which takes the whole app down rather than just the menu. */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Charted repositories</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {list.length === 0 ? (
              <DropdownMenuItem disabled>Nothing charted yet</DropdownMenuItem>
            ) : (
              list.map((repo) => (
                <DropdownMenuItem
                  key={repo.id}
                  onClick={() => selectRepo(repo.id)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-xs">
                      {shortName(repo.githubUrl)}
                    </span>
                    <RepoLine repo={repo} />
                  </span>
                  {repo.id === selectedRepoId ? (
                    <Check
                      strokeWidth={1.5}
                      className="text-primary"
                      aria-hidden
                    />
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <RegisterDialog />
    </ButtonGroup>
  );
}

/**
 * The second line of a repository row: what it holds, or what it is doing.
 *
 * A repository being parsed has no counts worth showing -- reporting "0 files"
 * while a clone runs is a wrong answer rather than a pending one. A failed one
 * says why, because the reason is the only thing that tells the reader whether
 * to fix the URL or try again.
 */
function RepoLine({ repo }: { repo: RepoSummary }) {
  if (repo.parseStatus === "queued" || repo.parseStatus === "parsing") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
        <Spinner className="size-3" aria-hidden />
        {repo.parseStatus === "queued" ? "Waiting to chart…" : "Charting…"}
      </span>
    );
  }

  if (repo.parseStatus === "failed") {
    return (
      <span className="text-[11px] break-words text-destructive">
        {repo.parseError ?? "Charting failed."}
      </span>
    );
  }

  return (
    <span className="text-[11px] text-ink-muted tabular-nums">
      {repo.fileCount} files · {repo.functionCount} functions
    </span>
  );
}

function RegisterDialog() {
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const register = useRegisterRepo();
  const selectRepo = useUiStore((state) => state.selectRepo);

  const submit = () => {
    const githubUrl = url.trim();
    if (githubUrl === "" || register.isPending) {
      return;
    }

    register.mutate(githubUrl, {
      onSuccess: (repo) => {
        // Land on what was just charted. Anything else makes the reader find
        // it in the picker they just added it from.
        selectRepo(repo.id);
        setUrl("");
        setOpen(false);
      },
    });
  };

  return (
    <Dialog
      open={open}
      // Still guarded, though the request is now short: closing mid-flight
      // would drop the response that says which repository to select.
      onOpenChange={(next) => {
        if (!register.isPending) setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Chart a repository"
          >
            <Plus strokeWidth={1.5} aria-hidden />
          </Button>
        }
      />

      {/* Mounted only while open. Base UI holds a closing popup in the tree
          until it sees its exit animation finish, and here it never does: the
          popup keeps `data-closed`, stays on screen and goes on taking clicks.
          See `docs/UI_GUIDE.md` §2. */}
      {open ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chart a repository</DialogTitle>
            <DialogDescription>
              Public repositories only. funcatlas clones over HTTPS and reads
              the default branch.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="repo-url">Repository URL</FieldLabel>
            <Input
              id="repo-url"
              value={url}
              placeholder="https://github.com/owner/repo"
              disabled={register.isPending}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
            />
            <FieldDescription>
              Charting starts in the background. The tree fills in as the
              repository is parsed.
            </FieldDescription>
          </Field>

          {/* break-words: a reason can carry a path with no break opportunity,
              and it ran off the dialog and off the viewport. */}
          {register.isError ? (
            <p className="text-sm break-words text-destructive">
              {shortName(url.trim()) || "That repository"} was not charted.{" "}
              {messageFor(register.error)}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="ghost" disabled={register.isPending}>
                  Cancel
                </Button>
              }
            />
            <Button
              onClick={submit}
              disabled={url.trim() === "" || register.isPending}
            >
              {register.isPending ? <Spinner aria-hidden /> : null}
              {register.isPending ? "Queueing…" : "Chart repository"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

/** Errors name what happened and what to do about it (UI_GUIDE §3.3). The API
 *  sends `detail` for exactly this; falling back to `message` keeps a proxy or
 *  a crash from producing a blank sentence. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail ?? error.message;
  }
  return "The API could not be reached.";
}
