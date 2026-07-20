import { useUiStore } from "../store/ui";

// IDE-like file tree placeholder. Real tree loads from /api/repos/:id/tree in Phase 3.
export function Sidebar() {
  const setRepoUrl = useUiStore((s) => s.setRepoUrl);
  return (
    <aside className="w-64 shrink-0 border-r border-surface-border bg-surface-raised p-3">
      <input
        className="w-full rounded-token bg-surface px-2 py-1 text-sm outline-none"
        placeholder="https://github.com/owner/repo"
        onKeyDown={(e) => {
          if (e.key === "Enter") setRepoUrl((e.target as HTMLInputElement).value);
        }}
      />
      <p className="mt-3 text-xs text-surface-border">File tree appears here.</p>
    </aside>
  );
}
