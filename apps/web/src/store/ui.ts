import { create } from "zustand";
import { persist } from "zustand/middleware";
import { UI_STORAGE_KEY } from "../lib/constants";

export { UI_STORAGE_KEY };

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

  /**
   * Whether the file card is showing every function or just the first screen
   * of them.
   *
   * On the card rather than in it, because the canvas sizes the card from its
   * contents and has to know which of the two it is drawing.
   */
  fileListExpanded: boolean;

  /** Cards showing every line of their source rather than the first screenful.
   *  Same reason as `fileListExpanded`: the card grows, nothing scrolls. */
  fullSourceIds: number[];

  selectRepo: (id: number | null) => void;
  selectFile: (id: number | null) => void;
  /** Opens a file's card, or closes it when it is the one already open. The
   *  tree row toggles like every other control on the canvas does. */
  toggleFile: (id: number) => void;
  /** Opens a function from the file card as a new branch, or closes that
   *  branch if it is already open. */
  toggleRoot: (id: number) => void;
  /** Opens a function's calls, or closes them again. Closing keeps everything
   *  underneath in memory so reopening restores it whole. */
  toggleFunction: (id: number) => void;
  /** Opens a function's source inside its card, or closes it again. */
  toggleCode: (id: number) => void;
  /** Shows the rest of a file's functions, or folds them away again. */
  toggleFileList: () => void;
  /** Shows the rest of a function's source, or folds it back to a screenful. */
  toggleFullSource: (id: number) => void;
  /** Clears the map. Used when the file or repository changes. */
  selectFunction: (id: number | null) => void;

  /**
   * Forgets branch roots the open file no longer has (R34).
   *
   * A re-parse reinserts a changed file's functions under new ids while the
   * file row keeps its own, so a restored branch points at rows that are gone
   * -- and since Phase 4 a webhook does that without anyone touching the
   * browser. `existingIds` is the open file's current function list, which is
   * authoritative for roots because a root is only ever opened from its card.
   */
  dropMissingRoots: (existingIds: number[]) => void;
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
  fileListExpanded: false,
  fullSourceIds: [] as number[],
});

const empty = () => ({
  selectedRepoId: null,
  selectedFileId: null,
  ...noMap(),
});

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...empty(),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

      selectRepo: (selectedRepoId) => set({ ...empty(), selectedRepoId }),

      selectFile: (selectedFileId) => set({ ...noMap(), selectedFileId }),

      toggleFile: (id) =>
        set((state) => ({
          ...noMap(),
          selectedFileId: state.selectedFileId === id ? null : id,
        })),

      selectFunction: (selectedFunctionId) =>
        set(selectedFunctionId === null ? noMap() : { selectedFunctionId }),

      toggleRoot: (id) =>
        set((state) => {
          const isOpen =
            state.rootFunctionIds.includes(id) &&
            !state.collapsedFunctionIds.includes(id);

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
            collapsedFunctionIds: state.collapsedFunctionIds.filter(
              (candidate) => candidate !== id,
            ),
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
            return {
              selectedFunctionId: id,
              collapsedFunctionIds: [...state.collapsedFunctionIds, id],
            };
          }

          return {
            selectedFunctionId: id,
            expandedFunctionIds: opened
              ? state.expandedFunctionIds
              : [...state.expandedFunctionIds, id],
            collapsedFunctionIds: state.collapsedFunctionIds.filter(
              (candidate) => candidate !== id,
            ),
          };
        }),

      toggleCode: (id) =>
        set((state) => ({
          selectedFunctionId: id,
          codeFunctionIds: state.codeFunctionIds.includes(id)
            ? state.codeFunctionIds.filter((candidate) => candidate !== id)
            : [...state.codeFunctionIds, id],
        })),

      toggleFileList: () =>
        set((state) => ({ fileListExpanded: !state.fileListExpanded })),

      toggleFullSource: (id) =>
        set((state) => ({
          fullSourceIds: state.fullSourceIds.includes(id)
            ? state.fullSourceIds.filter((candidate) => candidate !== id)
            : [...state.fullSourceIds, id],
        })),

      dropMissingRoots: (existingIds) =>
        set((state) => {
          const exists = new Set(existingIds);
          const gone = state.rootFunctionIds.filter((id) => !exists.has(id));
          if (gone.length === 0) return {};

          // Everything the dropped roots left behind goes with them. A root's
          // own id in expandedFunctionIds would otherwise keep asking for a
          // traversal from a function that no longer exists.
          const kept = (ids: number[]) =>
            ids.filter((id) => exists.has(id) || !gone.includes(id));

          return {
            rootFunctionIds: state.rootFunctionIds.filter((id) => exists.has(id)),
            expandedFunctionIds: kept(state.expandedFunctionIds),
            collapsedFunctionIds: kept(state.collapsedFunctionIds),
            codeFunctionIds: kept(state.codeFunctionIds),
            fullSourceIds: kept(state.fullSourceIds),
            selectedFunctionId:
              state.selectedFunctionId !== null &&
              gone.includes(state.selectedFunctionId)
                ? null
                : state.selectedFunctionId,
          };
        }),

      clearSelection: () => set({ ...empty() }),
    }),
    {
      name: UI_STORAGE_KEY,
      // Everything the reader built, except the palette -- reloading into an
      // open search box is a state they never asked for.
      //
      // Restored ids cannot be checked here -- nothing is loaded yet at
      // rehydrate. `dropMissingRoots` does it once the open file's function
      // list arrives, which is the first moment there is anything to check
      // against. An expanded id deeper in the map, in some other file, is left
      // to its own query: it 404s and that branch simply is not drawn.
      partialize: (state) => ({
        selectedRepoId: state.selectedRepoId,
        selectedFileId: state.selectedFileId,
        selectedFunctionId: state.selectedFunctionId,
        rootFunctionIds: state.rootFunctionIds,
        expandedFunctionIds: state.expandedFunctionIds,
        collapsedFunctionIds: state.collapsedFunctionIds,
        codeFunctionIds: state.codeFunctionIds,
        fileListExpanded: state.fileListExpanded,
        fullSourceIds: state.fullSourceIds,
      }),
    },
  ),
);
