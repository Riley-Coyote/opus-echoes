/* ============================================================================
   ViewProvider — where in the sanctuary are we.
   Two axes. PLACE is the top level: a resident (their chat / notebook), the
   Commons (the shared life), or Letters (writing to them). SECTION is the
   resident sub-nav. The stage reads PLACE first, then — for a resident — derives
   the chat canvas vs a room from SECTION. Interior is shown for the chat and for
   an open Commons room; hidden otherwise.
   ============================================================================ */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { SectionKey } from "../types/mnemos";

type View = "chat" | "room";
type Place = "resident" | "commons" | "letters";

interface ViewCtx {
  /* resident sub-nav */
  section: SectionKey;
  setSection: (s: SectionKey) => void;
  view: View;
  /* top-level place */
  place: Place;
  commonsRoomId: string | null;
  letterTo: string | null;
  goResident: () => void;
  openCommons: () => void;
  openCommonsRoom: (id: string) => void;
  backToCommons: () => void;
  openLetters: (to?: string | null) => void;
  /* panels */
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
  const [place, setPlace] = useState<Place>("resident");
  const [commonsRoomId, setCommonsRoomId] = useState<string | null>(null);
  const [letterTo, setLetterTo] = useState<string | null>(null);
  const [interiorOpen, setInteriorOpen] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  const view: View = section === "conversation" ? "chat" : "room";

  const goResident = useCallback(() => setPlace("resident"), []);
  const openCommons = useCallback(() => {
    setPlace("commons");
    setCommonsRoomId(null);
  }, []);
  const openCommonsRoom = useCallback((id: string) => {
    setPlace("commons");
    setCommonsRoomId(id);
  }, []);
  const backToCommons = useCallback(() => setCommonsRoomId(null), []);
  const openLetters = useCallback((to: string | null = null) => {
    setPlace("letters");
    setLetterTo(to);
  }, []);

  const toggleInterior = useCallback(() => setInteriorOpen((v) => !v), []);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);

  return (
    <Ctx.Provider
      value={{
        section,
        setSection,
        view,
        place,
        commonsRoomId,
        letterTo,
        goResident,
        openCommons,
        openCommonsRoom,
        backToCommons,
        openLetters,
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
