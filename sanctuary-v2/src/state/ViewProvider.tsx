/* ============================================================================
   ViewProvider — where in this mind are we.
   Holds the active section (the rail's selection) and whether the interior
   panel is shown. The stage shows the chat canvas for "conversation", a room
   for everything else. Interior is chat-only — hidden whenever a room is open.
   ============================================================================ */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { SectionKey } from "../types/mnemos";

type View = "chat" | "room";

interface ViewCtx {
  section: SectionKey;
  setSection: (s: SectionKey) => void;
  view: View;
  interiorOpen: boolean;
  toggleInterior: () => void;
  setInteriorOpen: (v: boolean) => void;
  railOpen: boolean;
  toggleRail: () => void;
  setRailOpen: (v: boolean) => void;
}

const Ctx = createContext<ViewCtx | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<SectionKey>("conversation");
  const [interiorOpen, setInteriorOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  const view: View = section === "conversation" ? "chat" : "room";
  const toggleInterior = useCallback(() => setInteriorOpen((v) => !v), []);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);

  return (
    <Ctx.Provider
      value={{
        section,
        setSection,
        view,
        interiorOpen,
        toggleInterior,
        setInteriorOpen,
        railOpen,
        toggleRail,
        setRailOpen,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useView(): ViewCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useView must be used within ViewProvider");
  return v;
}
