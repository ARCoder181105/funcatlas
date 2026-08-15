import { useState } from "react";
import { Check, ChevronsUpDown, FolderGit2, Plus } from "lucide-react";
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
  return githubUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "");
}

/**
 * Which repository the canvas is showing, and how to add another.
 *
 * Registration parses inline and blocks for as long as that takes, so it gets
 * a dialog with a real pending state rather than a disabled button.
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
            <Button variant="outline" size="sm" className="min-w-0 flex-1 justify-between">
              <span className="flex min-w-0 items-center gap-2">
                <FolderGit2 strokeWidth={1.5} aria-hidden />
                <span className="truncate font-mono text-xs">
                  {current ? shortName(current.githubUrl) : "Choose a repository"}
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
                <DropdownMenuItem key={repo.id} onClick={() => selectRepo(repo.id)}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono text-xs">{shortName(repo.githubUrl)}</span>
                    <span className="text-[11px] text-ink-muted tabular-nums">
                      {repo.fileCount} files · {repo.functionCount} functions
                    </span>
                  </span>
                  {repo.id === selectedRepoId ? (
                    <Check strokeWidth={1.5} className="text-primary" aria-hidden />
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
      // Not dismissable mid-parse: closing does not cancel the request, and a
      // dialog that vanishes while the work continues reads as a failure.
      onOpenChange={(next) => {
        if (!register.isPending) setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Chart a repository">
            <Plus strokeWidth={1.5} aria-hidden />
          </Button>
        }
      />

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chart a repository</DialogTitle>
          <DialogDescription>
            Public repositories only. funcatlas clones over HTTPS and reads the default branch.
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
            {register.isPending
              ? "Cloning and parsing. Large repositories take a few minutes; this window stays open until it finishes."
              : "Parsing runs while you wait — there is no queue yet."}
          </FieldDescription>
        </Field>

        {register.isError ? (
          <p className="text-sm text-destructive">
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
          <Button onClick={submit} disabled={url.trim() === "" || register.isPending}>
            {register.isPending ? <Spinner aria-hidden /> : null}
            {register.isPending ? "Charting…" : "Chart repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
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
