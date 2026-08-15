import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./ui";

function state() {
  return useUiStore.getState();
}

describe("selection", () => {
  beforeEach(() => {
    state().clearSelection();
  });

  it("starts with nothing selected", () => {
    expect(state().selectedRepoId).toBeNull();
    expect(state().selectedFileId).toBeNull();
    expect(state().selectedFunctionId).toBeNull();
  });

  it("clears the file and the function when the repository changes", () => {
    // Ids are per-repo. A file id carried across a repo change 404s, or worse,
    // loads the previous repo's card as though it belonged to this one.
    state().selectRepo(1);
    state().selectFile(10);
    state().selectFunction(100);

    state().selectRepo(2);

    expect(state().selectedRepoId).toBe(2);
    expect(state().selectedFileId).toBeNull();
    expect(state().selectedFunctionId).toBeNull();
  });

  it("clears the function when the file changes", () => {
    state().selectRepo(1);
    state().selectFile(10);
    state().selectFunction(100);

    state().selectFile(11);

    expect(state().selectedFileId).toBe(11);
    expect(state().selectedFunctionId).toBeNull();
  });

  it("keeps the repository and file when only the function changes", () => {
    state().selectRepo(1);
    state().selectFile(10);
    state().selectFunction(100);
    state().selectFunction(101);

    expect(state().selectedRepoId).toBe(1);
    expect(state().selectedFileId).toBe(10);
    expect(state().selectedFunctionId).toBe(101);
  });

  it("clears everything below even when the same repository is picked again", () => {
    // Re-selecting the current repository is how a reader gets back to the
    // empty canvas. Treating it as a no-op would leave the old card open.
    state().selectRepo(1);
    state().selectFile(10);

    state().selectRepo(1);

    expect(state().selectedRepoId).toBe(1);
    expect(state().selectedFileId).toBeNull();
  });

  it("deselects on null without losing the rest of the chain's shape", () => {
    state().selectRepo(1);
    state().selectFile(10);
    state().selectFunction(100);

    state().selectFunction(null);
    expect(state().selectedFunctionId).toBeNull();
    expect(state().selectedFileId).toBe(10);

    state().selectFile(null);
    expect(state().selectedFileId).toBeNull();
    expect(state().selectedRepoId).toBe(1);
  });
});
