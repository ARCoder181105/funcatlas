import { beforeEach, describe, expect, it } from "vitest";
import { UI_STORAGE_KEY, useUiStore } from "./ui";

function state() {
  return useUiStore.getState();
}

function persisted() {
  return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) as string).state;
}

describe("what survives a reload", () => {
  beforeEach(() => {
    state().clearSelection();
  });

  // Reloading onto "Nothing charted" after building a map reads as the app
  // having forgotten, and there is no URL to go back to.
  it("keeps the repository, the file and every open branch", () => {
    state().selectRepo(7);
    state().selectFile(10);
    state().toggleRoot(100);
    state().toggleCode(100);

    expect(persisted()).toMatchObject({
      selectedRepoId: 7,
      selectedFileId: 10,
      rootFunctionIds: [100],
      expandedFunctionIds: [100],
      codeFunctionIds: [100],
    });
  });

  // Reloading into an open search box is a state the reader never asked for.
  it("does not reopen the palette", () => {
    state().setPaletteOpen(true);

    expect(persisted()).not.toHaveProperty("paletteOpen");
  });

  it("forgets everything on sign-out", () => {
    state().selectRepo(7);
    state().selectFile(10);
    state().clearSelection();

    expect(persisted()).toMatchObject({
      selectedRepoId: null,
      selectedFileId: null,
      rootFunctionIds: [],
    });
  });
});

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

  it("opens two functions out of one file as separate branches", () => {
    state().selectFile(10);
    state().toggleRoot(1);
    state().toggleRoot(2);

    expect(state().rootFunctionIds).toEqual([1, 2]);
    expect(state().expandedFunctionIds).toEqual([1, 2]);
  });

  it("collapsing remembers everything underneath, so reopening restores it", () => {
    // The scenario: two branches off a file card, one explored three
    // generations deep and one two. Closing the second must bring back the
    // same structure when reopened, not one generation at a time.
    state().selectFile(10);
    state().toggleRoot(1);
    state().toggleRoot(2);
    state().toggleFunction(11);
    state().toggleFunction(12); // branch 1, three generations
    state().toggleFunction(21); // branch 2, two generations

    const openedBefore = [...state().expandedFunctionIds];

    state().toggleRoot(2);
    expect(state().collapsedFunctionIds).toContain(2);
    // Nothing is forgotten -- only hidden.
    expect(state().expandedFunctionIds).toEqual(openedBefore);

    state().toggleRoot(2);
    expect(state().collapsedFunctionIds).not.toContain(2);
    expect(state().expandedFunctionIds).toEqual(openedBefore);
  });

  it("toggles a function deeper in the map without touching the branches", () => {
    state().selectFile(10);
    state().toggleRoot(1);
    state().toggleFunction(11);

    state().toggleFunction(11);
    expect(state().collapsedFunctionIds).toEqual([11]);
    expect(state().rootFunctionIds).toEqual([1]);

    state().toggleFunction(11);
    expect(state().collapsedFunctionIds).toEqual([]);
  });

  it("selects whatever was just toggled, so the view can travel to it", () => {
    state().selectFile(10);
    state().toggleRoot(1);
    state().toggleFunction(7);
    expect(state().selectedFunctionId).toBe(7);
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

describe("dropMissingRoots (R34)", () => {
  it("forgets a restored branch whose function no longer exists", () => {
    const store = useUiStore.getState();
    store.selectFile(3);
    store.toggleRoot(10);
    store.toggleRoot(20);
    store.toggleFunction(99); // a callee, in some other file
    store.toggleCode(20);

    // A re-parse reinserted this file's functions: 20 is gone, 10 survived.
    useUiStore.getState().dropMissingRoots([10, 11]);

    const after = useUiStore.getState();
    expect(after.rootFunctionIds).toEqual([10]);
    expect(after.expandedFunctionIds).not.toContain(20);
    expect(after.codeFunctionIds).not.toContain(20);
    // A callee in another file is not this list's to judge; its own query
    // answers 404 and that branch is simply not drawn.
    expect(after.expandedFunctionIds).toContain(99);
  });

  it("clears the selection only when it was one of the dropped roots", () => {
    const store = useUiStore.getState();
    store.selectFile(3);
    store.toggleRoot(10);
    store.toggleRoot(20);

    useUiStore.getState().dropMissingRoots([10]);
    expect(useUiStore.getState().selectedFunctionId).toBeNull();

    useUiStore.getState().toggleRoot(10);
    useUiStore.getState().dropMissingRoots([10]);
    expect(useUiStore.getState().selectedFunctionId).toBe(10);
  });

  it("changes nothing when every root still exists", () => {
    const store = useUiStore.getState();
    store.selectFile(3);
    store.toggleRoot(10);
    const before = useUiStore.getState().rootFunctionIds;

    useUiStore.getState().dropMissingRoots([10, 11, 12]);
    expect(useUiStore.getState().rootFunctionIds).toBe(before);
  });
});
