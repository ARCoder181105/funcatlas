import { Sidebar } from "./components/Sidebar";
import { Canvas } from "./components/Canvas";
import { useUiStore } from "./store/ui";

// Landing + authenticated canvas live in one app (per docs/TECH_STACK.md).
// Phase 3 fills this in; for now it renders the shell.
export default function App() {
  const repoUrl = useUiStore((s) => s.repoUrl);

  return (
    <div className="flex h-full w-full">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {repoUrl ? (
          <Canvas />
        ) : (
          <div className="flex h-full items-center justify-center text-surface-border">
            Paste a repo URL to begin.
          </div>
        )}
      </main>
    </div>
  );
}
