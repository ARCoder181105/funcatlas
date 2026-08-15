import { create } from "zustand";

/**
 * What the reader has selected. Server state lives in TanStack Query; this is
 * only the selection that drives it.
 *
 * The three ids are a chain -- a file belongs to a repository, a function to a
 * file -- so selecting higher up clears everything below. Ids are per-repo and
 * mean nothing outside it, and a stale `selectedFileId` carried across a repo
 * change 404s or, worse, silently loads the previous repo's card.
 */
interface UiState {
  selectedRepoId: number | null;
  selectedFileId: number | null;
  selectedFunctionId: number | null;

  selectRepo: (id: number | null) => void;
  selectFile: (id: number | null) => void;
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

const EMPTY = {
  selectedRepoId: null,
  selectedFileId: null,
  selectedFunctionId: null,
} as const;

export const useUiStore = create<UiState>((set) => ({
  ...EMPTY,
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  selectRepo: (selectedRepoId) => set({ ...EMPTY, selectedRepoId }),

  selectFile: (selectedFileId) => set({ selectedFileId, selectedFunctionId: null }),

  selectFunction: (selectedFunctionId) => set({ selectedFunctionId }),

  clearSelection: () => set({ ...EMPTY }),
}));
