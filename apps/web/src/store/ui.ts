import { create } from "zustand";

interface UiState {
  repoUrl: string | null;
  selectedFileId: number | null;
  setRepoUrl: (url: string | null) => void;
  setSelectedFileId: (id: number | null) => void;
}

// UI-only state (canvas selection, active repo). Server state lives in TanStack Query.
export const useUiStore = create<UiState>((set) => ({
  repoUrl: null,
  selectedFileId: null,
  setRepoUrl: (repoUrl) => set({ repoUrl, selectedFileId: null }),
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
}));
