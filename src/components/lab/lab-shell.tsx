"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ExplorerTree } from "./explorer-tree";

export function LabShell({ children }: { children: React.ReactNode }) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="min-h-0 flex-1"
      id="roca-lab-main-v2"
    >
      {/* react-resizable-panels v4: numerele sunt în PX; pentru procente folosiți string "32%" etc. */}
      <ResizablePanel
        id="explorer"
        defaultSize="22%"
        minSize="14%"
        maxSize="38%"
        className="min-h-0"
      >
        <div className="bg-sidebar text-sidebar-foreground flex h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border">
          <div className="border-b border-sidebar-border px-3 py-2 shrink-0">
            <p className="text-sidebar-foreground/80 text-xs font-medium tracking-wide uppercase">
              Explorer
            </p>
            <p className="text-muted-foreground text-[11px]">Proiect → Foraj → metraj probă → Test</p>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ExplorerTree />
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="w-2 bg-transparent after:w-3" />
      <ResizablePanel id="main" defaultSize="70%" minSize="50%" className="min-h-0 min-w-0">
        <div className="bg-background h-full min-h-0 overflow-auto">{children}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
