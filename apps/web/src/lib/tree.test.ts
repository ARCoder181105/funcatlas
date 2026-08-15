import type { FileNode } from "@funcatlas/shared";
import { describe, expect, it } from "vitest";
import { buildTree, directoryPaths, type TreeDirectory, type TreeEntry } from "./tree";

let nextId = 1;

function file(path: string, functionCount = 1): FileNode {
  return { id: nextId++, path, language: "typescript", functionCount };
}

/** Renders the tree as indented paths, so a whole shape is one assertion. */
function shape(entries: TreeEntry[], depth = 0): string[] {
  return entries.flatMap((entry) => [
    `${"  ".repeat(depth)}${entry.name}${entry.kind === "directory" ? "/" : ""}`,
    ...(entry.kind === "directory" ? shape(entry.children, depth + 1) : []),
  ]);
}

function directory(entries: TreeEntry[], path: string): TreeDirectory {
  const found = directoryPaths(entries).includes(path);
  expect(found, `no directory at ${path}`).toBe(true);

  const walk = (list: TreeEntry[]): TreeDirectory | undefined => {
    for (const entry of list) {
      if (entry.kind !== "directory") continue;
      if (entry.path === path) return entry;
      const inner = walk(entry.children);
      if (inner !== undefined) return inner;
    }
    return undefined;
  };

  return walk(entries) as TreeDirectory;
}

describe("buildTree", () => {
  it("returns nothing for a repository with no files", () => {
    // A repo with zero files is a valid answer, not an error -- 3a made that
    // distinction deliberately.
    expect(buildTree([])).toEqual([]);
  });

  it("keeps root-level files at the root", () => {
    const tree = buildTree([file("index.ts"), file("README.md")]);
    expect(tree.every((entry) => entry.kind === "file")).toBe(true);
    // localeCompare, so case does not decide the order: an IDE lists
    // index.ts before README.md, and a raw ASCII sort would not.
    expect(shape(tree)).toEqual(["index.ts", "README.md"]);
  });

  it("nests a file under its directory", () => {
    const tree = buildTree([file("src/index.ts")]);
    expect(shape(tree)).toEqual(["src/", "  index.ts"]);
  });

  it("nests a deep chain without creating duplicate directories", () => {
    const tree = buildTree([file("a/b/c/d.ts"), file("a/b/c/e.ts"), file("a/b/f.ts")]);

    expect(shape(tree)).toEqual(["a/", "  b/", "    c/", "      d.ts", "      e.ts", "    f.ts"]);
  });

  it("does not merge directories that only share a prefix", () => {
    // `src/app.ts` and `src/apple/x.ts` share the prefix "src/app" without
    // sharing a directory. A startsWith check would nest the file inside the
    // directory; splitting on "/" cannot.
    const tree = buildTree([file("src/app.ts"), file("src/apple/x.ts")]);

    expect(shape(tree)).toEqual(["src/", "  apple/", "    x.ts", "  app.ts"]);
  });

  it("puts directories before files, then sorts alphabetically", () => {
    const tree = buildTree([
      file("zebra.ts"),
      file("alpha.ts"),
      file("zzz/deep.ts"),
      file("aaa/deep.ts"),
    ]);

    expect(shape(tree)).toEqual([
      "aaa/",
      "  deep.ts",
      "zzz/",
      "  deep.ts",
      "alpha.ts",
      "zebra.ts",
    ]);
  });

  it("sorts nested levels too, not just the root", () => {
    const tree = buildTree([file("src/z.ts"), file("src/a.ts"), file("src/m/inner.ts")]);
    expect(shape(tree)).toEqual(["src/", "  m/", "    inner.ts", "  a.ts", "  z.ts"]);
  });

  it("rolls counts up through every ancestor", () => {
    // A collapsed directory still has to say how much is inside it, at any
    // depth -- not just its immediate children.
    const tree = buildTree([file("a/b/one.ts", 3), file("a/b/two.ts", 5), file("a/three.ts", 2)]);

    expect(directory(tree, "a").functionCount).toBe(10);
    expect(directory(tree, "a").fileCount).toBe(3);
    expect(directory(tree, "a/b").functionCount).toBe(8);
    expect(directory(tree, "a/b").fileCount).toBe(2);
  });

  it("carries the original file through, so ids survive the transform", () => {
    // The sidebar selects by file id. A transform that rebuilt the node and
    // dropped the id would make every row unselectable.
    const source = file("src/index.ts", 7);
    const tree = buildTree([source]);
    const nested = directory(tree, "src").children[0];

    expect(nested?.kind).toBe("file");
    expect(nested?.kind === "file" && nested.file).toEqual(source);
  });

  it("ignores a path that names no file", () => {
    // Not expected from the API. Inventing a node for one would put an
    // unnamed, unselectable row in the tree.
    expect(buildTree([file(""), file("/")])).toEqual([]);
  });

  it("tolerates a leading slash rather than creating an empty directory", () => {
    const tree = buildTree([file("/src/index.ts")]);
    expect(shape(tree)).toEqual(["src/", "  index.ts"]);
  });
});

describe("directoryPaths", () => {
  it("lists every directory at every depth", () => {
    const tree = buildTree([file("a/b/c.ts"), file("d/e.ts"), file("root.ts")]);
    expect(directoryPaths(tree).sort()).toEqual(["a", "a/b", "d"]);
  });

  it("is empty when nothing is nested", () => {
    expect(directoryPaths(buildTree([file("index.ts")]))).toEqual([]);
  });
});
