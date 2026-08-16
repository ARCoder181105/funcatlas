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
  /** Which function's source the code block shows. Always the last one opened. */
  selectedFunctionId: number | null;

  /**
   * Every function whose calls are currently drawn, in the order they were
   * opened. The map grows by clicking and nothing is taken away, so this is a
   * list rather than a single id: the reader is building up a path through the
   * graph, and losing the ancestors would lose the path.
   */
  expandedFunctionIds: number[];

  selectRepo: (id: number | null) => void;
  selectFile: (id: number | null) => void;
  /** Starts a fresh map from one function, replacing whatever was drawn. */
  selectFunction: (id: number | null) => void;
  /** Grows the current map by one function, keeping everything already on it. */
  expandFunction: (id: number) => void;
  /** Signing out, where nothing selected should survive the next session. */
  clearSelection: () => void;

  /** The ⌘K palette. In the store rather than local to the palette because two
   *  things open it -- the shortcut and the sidebar's button -- and a second
   *  opener reaching in through a synthetic keyboard event is a hack that
   *  breaks the moment the shortcut changes. */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

}

/** `expandedFunctionIds` is rebuilt rather than shared, so no two resets can
 *  end up pointing at one array. */
const empty = () => ({
  selectedRepoId: null,
  selectedFileId: null,
  selectedFunctionId: null,
  expandedFunctionIds: [] as number[],
});

export const useUiStore = create<UiState>((set) => ({
  ...empty(),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  selectRepo: (selectedRepoId) => set({ ...empty(), selectedRepoId }),

  selectFile: (selectedFileId) =>
    set({ selectedFileId, selectedFunctionId: null, expandedFunctionIds: [] }),

  selectFunction: (selectedFunctionId) =>
    set({
      selectedFunctionId,
      expandedFunctionIds: selectedFunctionId === null ? [] : [selectedFunctionId],
    }),

  expandFunction: (id) =>
    set((state) => ({
      selectedFunctionId: id,
      // Clicking an already-open function re-selects it without redrawing --
      // its calls are on screen, and appending would fetch them again.
      expandedFunctionIds: state.expandedFunctionIds.includes(id)
        ? state.expandedFunctionIds
        : [...state.expandedFunctionIds, id],
    })),

  clearSelection: () => set({ ...empty() }),
}));
