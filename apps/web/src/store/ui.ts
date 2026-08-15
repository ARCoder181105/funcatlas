import {
  TRAVERSAL_DEFAULT_DEPTH,
  TRAVERSAL_MAX_DEPTH,
  type TraversalDirection,
} from "@funcatlas/shared";
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

  /** How far the mind-map walks, and which way. Kept across selections on
   *  purpose: a reader who set depth 3 meant it for the next function too. */
  traversalDepth: number;
  traversalDirection: TraversalDirection;
  setTraversalDepth: (depth: number) => void;
  setTraversalDirection: (direction: TraversalDirection) => void;
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

  traversalDepth: TRAVERSAL_DEFAULT_DEPTH,
  traversalDirection: "out",

  // Clamped here as well as server-side: the control offers only valid depths,
  // but a depth of 0 or 40 arriving from anywhere else would either draw an
  // empty graph or ask for one the API rejects.
  setTraversalDepth: (depth) =>
    set({ traversalDepth: Math.min(Math.max(Math.round(depth), 1), TRAVERSAL_MAX_DEPTH) }),

  setTraversalDirection: (traversalDirection) => set({ traversalDirection }),

  selectRepo: (selectedRepoId) => set({ ...EMPTY, selectedRepoId }),

  selectFile: (selectedFileId) => set({ selectedFileId, selectedFunctionId: null }),

  selectFunction: (selectedFunctionId) => set({ selectedFunctionId }),

  clearSelection: () => set({ ...EMPTY }),
}));
