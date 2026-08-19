import type { FileNode } from "@funcatlas/shared";

/**
 * Turns the flat, path-ordered `FileNode[]` the API returns into a nested
 * directory tree.
 *
 * The API returns flat on purpose (`apps/api/src/graph/queries.ts` says so):
 * nesting is a presentation concern, and doing it here keeps the hard part a
 * pure function that can be tested without mounting a component.
 */

export interface TreeFile {
  kind: "file";
  /** Path segment only -- `index.ts`, not `src/lib/index.ts`. */
  name: string;
  /** Full repo-relative path. Unique, so it doubles as the React key. */
  path: string;
  file: FileNode;
}

export interface TreeDirectory {
  kind: "directory";
  name: string;
  /** Full repo-relative path of the directory itself. */
  path: string;
  children: TreeEntry[];
  /** Every function in every file below this directory, at any depth. */
  functionCount: number;
  /** Files below this directory, at any depth. */
  fileCount: number;
}

export type TreeEntry = TreeFile | TreeDirectory;

/**
 * Builds the tree.
 *
 * Splitting on `/` rather than comparing prefixes is load-bearing: `src/app.ts`
 * and `src/apple/x.ts` share the prefix `src/app` without sharing a directory,
 * and a `startsWith` check would nest one inside the other.
 */
export function buildTree(files: FileNode[]): TreeEntry[] {
  const root: TreeDirectory = {
    kind: "directory",
    name: "",
    path: "",
    children: [],
    functionCount: 0,
    fileCount: 0,
  };

  // Directories are looked up by full path rather than walked from the root
  // each time, so building the tree stays linear in the number of files.
  const directories = new Map<string, TreeDirectory>([["", root]]);

  for (const file of files) {
    const segments = file.path.split("/").filter((segment) => segment !== "");
    if (segments.length === 0) {
      // A path of "" or "/" names no file. The API does not send these, and
      // inventing a node for one would put an unnamed row in the tree.
      continue;
    }

    const name = segments[segments.length - 1] as string;
    const parent = ensureDirectory(directories, root, segments.slice(0, -1));

    parent.children.push({ kind: "file", name, path: file.path, file });

    // Roll the counts up every ancestor, so a collapsed directory can still
    // say how much is inside it.
    for (const ancestor of ancestorsOf(directories, segments.slice(0, -1))) {
      ancestor.functionCount += file.functionCount;
      ancestor.fileCount += 1;
    }
  }

  sortEntries(root.children);
  return root.children;
}

/** Walks the segments, creating directories that do not exist yet. */
function ensureDirectory(
  directories: Map<string, TreeDirectory>,
  root: TreeDirectory,
  segments: string[],
): TreeDirectory {
  let current = root;
  let path = "";

  for (const segment of segments) {
    path = path === "" ? segment : `${path}/${segment}`;
    let next = directories.get(path);

    if (next === undefined) {
      next = {
        kind: "directory",
        name: segment,
        path,
        children: [],
        functionCount: 0,
        fileCount: 0,
      };
      directories.set(path, next);
      current.children.push(next);
    }

    current = next;
  }

  return current;
}

/** Every directory on the way down to `segments`, root excluded -- the root's
 *  counts are never read, since the tree is rendered from its children. */
function ancestorsOf(
  directories: Map<string, TreeDirectory>,
  segments: string[],
): TreeDirectory[] {
  const found: TreeDirectory[] = [];
  let path = "";

  for (const segment of segments) {
    path = path === "" ? segment : `${path}/${segment}`;
    const directory = directories.get(path);
    if (directory !== undefined) {
      found.push(directory);
    }
  }

  return found;
}

/** Directories before files, then alphabetical within each group. Recursive,
 *  so the whole tree is sorted in one pass at the end of the build. */
function sortEntries(entries: TreeEntry[]): void {
  entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    if (entry.kind === "directory") {
      sortEntries(entry.children);
    }
  }
}

/**
 * Every directory path in the tree, for expanding the whole thing at once.
 *
 * Returned rather than computed in the component because "expand all" and
 * "collapse all" both need the same set, and deriving it twice is how the two
 * end up disagreeing about what a directory is.
 */
export function directoryPaths(entries: TreeEntry[]): string[] {
  const paths: string[] = [];

  for (const entry of entries) {
    if (entry.kind === "directory") {
      paths.push(entry.path);
      paths.push(...directoryPaths(entry.children));
    }
  }

  return paths;
}
