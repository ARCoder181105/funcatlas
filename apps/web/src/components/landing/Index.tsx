import { FileCode2 } from "lucide-react";
import {
  FileItem,
  FolderItem,
  FolderPanel,
  FolderTrigger,
  Files,
  SubFiles,
} from "../animate-ui/components/base/files";
import { Bezel } from "./Bezel";
import { Section } from "./Section";

/**
 * What the reader lands on: the index, not the map.
 *
 * An atlas has an index and the file tree is it (UI_GUIDE §3.2), so the page
 * shows one rather than describing it. The counts are the point -- a file's
 * worth on this canvas is how many functions it holds, and that is the number
 * the sidebar puts beside every path.
 *
 * The tree is this repository's own shape. A made-up `src/components/Button.tsx`
 * would say nothing about a tool built to read a polyglot monorepo.
 */
function Count({ functions }: { functions: number }) {
  return (
    <span className="font-mono text-[11px] tabular-nums text-ink-muted">
      {functions}
    </span>
  );
}

export function Index() {
  return (
    <Section
      tier="exact"
      eyebrow="The index"
      title="An atlas has an index. Here it is the file tree."
      lede="Directories before files, paths in monospace, and a function count on every one. Open a file and its card springs onto the canvas; open a function and the map branches out from it."
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
        <ul className="max-w-xl space-y-5 text-sm leading-relaxed text-ink-muted">
          <li>
            <span className="text-ink">One file card at a time</span>, with as
            many function branches off it as you open. Collapsing a branch hides
            its subtree without forgetting it.
          </li>
          <li>
            <span className="text-ink">⌘K jumps to any function by name</span>,
            across every file in the repository, and lands the canvas on it.
          </li>
          <li>
            <span className="text-ink">The selection survives a reload</span>:
            repository, file and every branch you opened. Rebuilding a map by
            hand after a refresh is not exploring.
          </li>
        </ul>

        {/* Capped: a file tree stretched to the full shell puts a filename and
            its count at opposite ends of the screen. */}
        <Bezel className="w-full max-w-xl" innerClassName="overflow-hidden p-2">
          <Files className="w-full" defaultOpen={["apps", "services"]}>
            <FolderItem value="apps">
              <FolderTrigger className="font-mono">apps</FolderTrigger>

              <FolderPanel>
                <SubFiles defaultOpen={["web"]}>
                  <FolderItem value="web">
                    <FolderTrigger className="font-mono">web</FolderTrigger>

                    <FolderPanel>
                      <FileItem
                        icon={FileCode2}
                        className="font-mono"
                        meta={<Count functions={6} />}
                      >
                        App.tsx
                      </FileItem>
                      <FileItem
                        icon={FileCode2}
                        className="font-mono"
                        meta={<Count functions={11} />}
                      >
                        Canvas.tsx
                      </FileItem>
                      <FileItem
                        icon={FileCode2}
                        className="font-mono"
                        meta={<Count functions={9} />}
                      >
                        graph.ts
                      </FileItem>
                    </FolderPanel>
                  </FolderItem>

                  <FolderItem value="api">
                    <FolderTrigger className="font-mono">api</FolderTrigger>

                    <FolderPanel>
                      <FileItem
                        icon={FileCode2}
                        className="font-mono"
                        meta={<Count functions={7} />}
                      >
                        routes.ts
                      </FileItem>
                    </FolderPanel>
                  </FolderItem>
                </SubFiles>
              </FolderPanel>
            </FolderItem>

            <FolderItem value="services">
              <FolderTrigger className="font-mono">services</FolderTrigger>

              <FolderPanel>
                <SubFiles>
                  <FileItem
                    icon={FileCode2}
                    className="font-mono"
                    meta={<Count functions={23} />}
                  >
                    resolver.go
                  </FileItem>
                  <FileItem
                    icon={FileCode2}
                    className="font-mono"
                    meta={<Count functions={17} />}
                  >
                    extract.go
                  </FileItem>
                </SubFiles>
              </FolderPanel>
            </FolderItem>
          </Files>
        </Bezel>
      </div>
    </Section>
  );
}
