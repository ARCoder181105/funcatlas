import { create } from "zustand";

/**
 * What the reader has selected. Server state lives in TanStack Query; this is
 * only the selection that drives it.
 *
 * The ids are a chain -- a file belongs to a repository, a function to a file
 * -- so selecting higher up clears everything below. Ids are per-repo and mean
 * nothing outside it, and a stale `selectedFileId` carried across a repo change
 * 404s or, worse, silently loads the previous repo's card.
 */
interface UiState {
  selectedRepoId: number | null;
  selectedFileId: number | null;
  /** What the canvas last travelled to, and what focus mode lights up. */
  selectedFunctionId: number | null;

  /**
   * Functions opened straight from the file card. Each is a branch root, and
   * there can be several: the reader opens two functions out of a file and
   * explores both.
   */
  rootFunctionIds: number[];

  /**
   * Every function whose calls have ever been fetched, in the order opened.
   * This is memory, not visibility -- closing a branch does not remove
   * anything from here, which is what lets reopening it come back exactly as
   * it was rather than one generation at a time.
   */
  expandedFunctionIds: number[];

  /**
   * Functions the reader has closed. A collapsed function stays on the canvas
   * -- it has to, or there would be nothing to click to reopen -- but nothing
   * below it is drawn.
   */
  collapsedFunctionIds: number[];

  /**
   * Functions showing their source inside their own card.
   *
   * Separate from expansion: reading what a function does and seeing what it
   * calls are two questions, and tying them together would force the map to
   * grow every time the reader wanted to read one body.
   */
  codeFunctionIds: number[];

  selectRepo: (id: number | null) => void;
  selectFile: (id: number | null) => void;
  /** Opens a function from the file card as a new branch, or closes that
   *  branch if it is already open. */
  toggleRoot: (id: number) => void;
  /** Opens a function's calls, or closes them again. Closing keeps everything
   *  underneath in memory so reopening restores it whole. */
  toggleFunction: (id: number) => void;
  /** Opens a function's source inside its card, or closes it again. */
  toggleCode: (id: number) => void;
  /** Clears the map. Used when the file or repository changes. */
  selectFunction: (id: number | null) => void;
  /** Signing out, where nothing selected should survive the next session. */
  clearSelection: () => void;

  /** The ⌘K palette. In the store rather than local to the palette because two
   *  things open it -- the shortcut and the sidebar's button -- and a second
   *  opener reaching in through a synthetic keyboard event is a hack that
   *  breaks the moment the shortcut changes. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

}

/**
 * Everything the canvas has drawn, cleared. The selection above it -- which
 * repository, which file -- is not this one's business.
 *
 * Each list is rebuilt rather than shared, so no two resets can end up pointing
 * at one array.
 */
const noMap = () => ({
  selectedFunctionId: null,
  rootFunctionIds: [] as number[],
  expandedFunctionIds: [] as number[],
  collapsedFunctionIds: [] as number[],
  codeFunctionIds: [] as number[],
});

const empty = () => ({ selectedRepoId: null, selectedFileId: null, ...noMap() });

export const useUiStore = create<UiState>((set) => ({
  ...empty(),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  selectRepo: (selectedRepoId) => set({ ...empty(), selectedRepoId }),

  selectFile: (selectedFileId) => set({ ...noMap(), selectedFileId }),

  selectFunction: (selectedFunctionId) =>
    set(selectedFunctionId === null ? noMap() : { selectedFunctionId }),

  toggleRoot: (id) =>
    set((state) => {
      const isOpen = state.rootFunctionIds.includes(id) && !state.collapsedFunctionIds.includes(id);

      if (isOpen) {
        // Closing a branch collapses it rather than forgetting it, so
        // reopening restores every generation the reader had explored.
        return {
          selectedFunctionId: id,
          collapsedFunctionIds: [...state.collapsedFunctionIds, id],
        };
      }

      return {
        selectedFunctionId: id,
        rootFunctionIds: state.rootFunctionIds.includes(id)
          ? state.rootFunctionIds
          : [...state.rootFunctionIds, id],
        expandedFunctionIds: state.expandedFunctionIds.includes(id)
          ? state.expandedFunctionIds
          : [...state.expandedFunctionIds, id],
        collapsedFunctionIds: state.collapsedFunctionIds.filter((candidate) => candidate !== id),
      };
    }),

  toggleFunction: (id) =>
    set((state) => {
      const collapsed = state.collapsedFunctionIds.includes(id);
      const opened = state.expandedFunctionIds.includes(id);

      if (opened && !collapsed) {
        // Collapse. Everything underneath stays in expandedFunctionIds and in
        // the query cache, so reopening brings the whole subtree back in the
        // state it was left in rather than one generation at a time.
        return { selectedFunctionId: id, collapsedFunctionIds: [...state.collapsedFunctionIds, id] };
      }

      return {
        selectedFunctionId: id,
        expandedFunctionIds: opened ? state.expandedFunctionIds : [...state.expandedFunctionIds, id],
        collapsedFunctionIds: state.collapsedFunctionIds.filter((candidate) => candidate !== id),
      };
    }),

  toggleCode: (id) =>
    set((state) => ({
      selectedFunctionId: id,
      codeFunctionIds: state.codeFunctionIds.includes(id)
        ? state.codeFunctionIds.filter((candidate) => candidate !== id)
        : [...state.codeFunctionIds, id],
    })),

  clearSelection: () => set({ ...empty() }),
}));
