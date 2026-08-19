import { useMemo, useState } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen, Map, Search } from "lucide-react";
import { ApiError } from "../lib/api";
import { cn } from "../lib/cn";
import { useRepoTree } from "../lib/repos";
import { buildTree, directoryPaths, type TreeEntry } from "../lib/tree";
import { useUiStore } from "../store/ui";
import { RepoPicker } from "./RepoPicker";
import { Button } from "./ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Kbd } from "./ui/kbd";
import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
} from "./ui/sidebar";

/**
 * The index. An atlas has one, and the file tree is it.
 *
 * The nesting is done by `lib/tree.ts`, which is pure and tested; this file
 * only renders it. Everything with keyboard or focus semantics -- the
 * collapsibles, the menu rows, the repository dropdown -- comes from the
 * installed components rather than being written here.
 */
export function Sidebar() {
  const selectedRepoId = useUiStore((state) => state.selectedRepoId);
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen);
  const tree = useRepoTree(selectedRepoId);

  const entries = useMemo(() => buildTree(tree.data?.files ?? []), [tree.data]);

  return (
    <SidebarShell
      collapsible="none"
      // min-h-0 so SidebarContent's own overflow-auto can actually take
      // effect: without it the tree grows the panel instead of scrolling
      // inside it, and the canvas scrolls along with it.
      className="h-full min-h-0 w-full border-r border-surface-border"
    >
      <SidebarHeader className="gap-2 border-b border-surface-border">
        <RepoPicker />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <TreeBody repoId={selectedRepoId} query={tree} entries={entries} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-surface-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-ink-muted"
          onClick={() => setPaletteOpen(true)}
        >
          <Search strokeWidth={1.5} data-icon="inline-start" aria-hidden />
          Find a function
          <Kbd className="ml-auto">⌘K</Kbd>
        </Button>
      </SidebarFooter>
    </SidebarShell>
  );
}

/** The four states this panel can be in, kept together so none is forgotten. */
function TreeBody({
  repoId,
  query,
  entries,
}: {
  repoId: number | null;
  query: ReturnType<typeof useRepoTree>;
  entries: TreeEntry[];
}) {
  if (repoId === null) {
    return (
      <Empty className="px-2 py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Map strokeWidth={1.5} aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Nothing charted</EmptyTitle>
          <EmptyDescription>
            Choose a repository above, or chart a new one to see its files.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (query.isPending) {
    // The shape that is coming, not a spinner (UI_GUIDE §3.3).
    return (
      <SidebarMenu>
        {Array.from({ length: 8 }, (_, index) => (
          <SidebarMenuItem key={index}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }

  if (query.isError) {
    return (
      <Empty className="px-2 py-8">
        <EmptyHeader>
          <EmptyTitle>The file tree did not load</EmptyTitle>
          <EmptyDescription>
            {query.error instanceof ApiError
              ? (query.error.detail ?? query.error.message)
              : "The API could not be reached."}
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Empty>
    );
  }

  if (entries.length === 0) {
    // A repository with no files is a valid answer, not an error -- Phase 3a
    // drew that distinction deliberately.
    return (
      <Empty className="px-2 py-8">
        <EmptyHeader>
          <EmptyTitle>No files to chart</EmptyTitle>
          <EmptyDescription>
            The parser found nothing it can read here. TypeScript is the only language it extracts
            today.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <Tree entries={entries} />;
}

function Tree({ entries }: { entries: TreeEntry[] }) {
  // Top-level directories start open: a tree that is entirely collapsed on
  // arrival makes the reader click before it has told them anything.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(directoryPaths(entries).filter((path) => !path.includes("/"))),
  );

  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <SidebarMenu>
      {entries.map((entry) => (
        <Node key={entry.path} entry={entry} open={open} toggle={toggle} />
      ))}
    </SidebarMenu>
  );
}

function Node({
  entry,
  open,
  toggle,
}: {
  entry: TreeEntry;
  open: Set<string>;
  toggle: (path: string) => void;
}) {
  const selectedFileId = useUiStore((state) => state.selectedFileId);
  const toggleFile = useUiStore((state) => state.toggleFile);

  if (entry.kind === "file") {
    const active = entry.file.id === selectedFileId;

    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={active}
          // Clicking the open file again closes its card and clears the
          // canvas, the same way every card on the canvas closes itself.
          onClick={() => toggleFile(entry.file.id)}
          tooltip={entry.path}
        >
          <FileCode2 strokeWidth={1.5} aria-hidden />
          <span className="truncate font-mono text-xs">{entry.name}</span>
        </SidebarMenuButton>
        {/* Nothing to count is worth no ink. */}
        {entry.file.functionCount > 0 ? (
          <SidebarMenuBadge className="tabular-nums">{entry.file.functionCount}</SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    );
  }

  const isOpen = open.has(entry.path);

  return (
    <SidebarMenuItem>
      <Collapsible open={isOpen} onOpenChange={() => toggle(entry.path)}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton className="group/dir">
              <ChevronRight
                strokeWidth={1.5}
                className={cn(
                  "transition-transform duration-micro",
                  isOpen ? "rotate-90" : "rotate-0",
                )}
                aria-hidden
              />
              {isOpen ? (
                <FolderOpen strokeWidth={1.5} aria-hidden />
              ) : (
                <Folder strokeWidth={1.5} aria-hidden />
              )}
              <span className="truncate font-mono text-xs">{entry.name}</span>
              <span className="ml-auto shrink-0 pl-2 text-[10px] text-ink-muted tabular-nums">
                {/* The rolled-up count, so a collapsed directory still says
                    how much is inside it. */}
                {entry.functionCount}
              </span>
            </SidebarMenuButton>
          }
        />

        <CollapsibleContent>
          {/* SidebarMenuSub is the <ul>; Node already renders its own <li>, so
              there is no SidebarMenuSubItem here -- that would nest <li> in
              <li>, which is invalid and which browsers repair unpredictably. */}
          <SidebarMenuSub>
            {entry.children.map((child) => (
              <Node key={child.path} entry={child} open={open} toggle={toggle} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
