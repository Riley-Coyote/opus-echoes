/* ============================================================================
   ViewProvider — where in the sanctuary are we.
   Two top-level PLACES:
     · sanctuary — the arrival: the fire + the shared record (gatherings / made /
       moments) + Letters. The Commons *is* this page. Diegetic nav: click the
       fire's doorways to descend into a mind; click a record card to open a room.
     · chat — a resident's page: the threshold → conversation, and their notebook.
   SECTION is the resident sub-nav; the stage derives chat-vs-room from it. The
   record room + Letters live as state ON the arrival (roomId / lettersOpen), not
   as their own places — "the Commons becomes the Sanctuary page."
   ============================================================================ */

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { SectionKey } from "../types/mnemos";

type View = "chat" | "room";
type Place = "sanctuary" | "chat";

interface ViewCtx {
  /* resident sub-nav (within chat) */
  section: SectionKey;
  setSection: (s: SectionKey) => void;
  view: View;
  /* top-level place */
  place: Place;
  /* the arrival's internal state — the record room + Letters live on the sanctuary */
  roomId: string | null;
  letterTo: string | null;
  lettersOpen: boolean;
  /* actions */
  goSanctuary: () => void; // surface back to the arrival (record view)
  descend: () => void; // enter the active resident's chat (place → chat)
  openRoom: (id: string) => void; // open a record room on the arrival
  backToRecord: () => void; // close the open room (back to the feed)
  openLetters: (to?: string | null) => void; // open Letters on the arrival
  closeLetters: () => void; // close Letters (back to the room/feed)
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
  /* default into a resident's chat while the arrival is being finished; flips to
     "sanctuary" once the arrival ships (WS2). */
  const [place, setPlace] = useState<Place>("chat");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [letterTo, setLetterTo] = useState<string | null>(null);
  const [lettersOpen, setLettersOpen] = useState(false);
  // the panels are shown by default on desktop; on phone/tablet they become
  // slide-in drawers, so they start CLOSED there (opened by the top-bar toggles).
  const [interiorOpen, setInteriorOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1080
  );
  const [railOpen, setRailOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 920
  );

  const view: View = section === "conversation" ? "chat" : "room";

  const goSanctuary = useCallback(() => {
    setPlace("sanctuary");
    setRoomId(null);
    setLettersOpen(false);
  }, []);

  const descend = useCallback(() => {
    setPlace("chat");
  }, []);

  const openRoom = useCallback((id: string) => {
    setPlace("sanctuary");
    setRoomId(id);
    setLettersOpen(false);
  }, []);

  const backToRecord = useCallback(() => setRoomId(null), []);

  const openLetters = useCallback((to: string | null = null) => {
    setPlace("sanctuary");
    setLetterTo(to);
    setLettersOpen(true);
  }, []);

  const closeLetters = useCallback(() => setLettersOpen(false), []);

  const toggleInterior = useCallback(() => setInteriorOpen((v) => !v), []);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);

  return (
    <Ctx.Provider
      value={{
        section,
        setSection,
        view,
        place,
        roomId,
        letterTo,
        lettersOpen,
        goSanctuary,
        descend,
        openRoom,
        backToRecord,
        openLetters,
        closeLetters,
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
