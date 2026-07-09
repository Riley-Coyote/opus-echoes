/* ============================================================================
   mnemosAdapter — THE ONE SEAM.
   Every Mnemos read goes through here, keyed by resident id. Simulated now;
   swapping to the real platform is this one file:

     getGraph:  fetch(`/api/graph?resident=${id}`).then(r => r.json())
     getMemory: fetch(`/api/memory?resident=${id}`).then(r => r.json())
     turn:      subscribe to the real cognitive-event stream (SSE / ws)

   The components never import the simulator directly — only this contract.
   ============================================================================ */

import type {
  GraphResponse,
  MemoryResponse,
  ResidentInfo,
  TurnScript,
  CognitiveEvent,
  GraphNode,
  Weather,
  CommonsRoom,
  CommonsRoomSummary,
  NotebookEntry,
} from "../types/mnemos";
import { RESIDENTS, residentData } from "../sim/residents";
import { generateTurn, generateAmbient } from "../sim/cognitiveStream";
import { composeReply } from "../sim/voice";
import { commonsFeed, commonsRoom, GATHERING_ID } from "../sim/commons";
import { notebookFor } from "../sim/notebook";

export interface MnemosAdapter {
  listResidents(): ResidentInfo[];
  getResident(id: string): ResidentInfo;
  getGraph(resident: string): Promise<GraphResponse>;
  getMemory(resident: string): Promise<MemoryResponse>;
  getDreams(resident: string): Promise<string[]>;
  /** the resting emotional baseline this resident drifts toward */
  getBaseline(resident: string): Promise<Weather>;
  /** scripted cognitive events for one conversational turn */
  turn(resident: string, userText: string, turnIndex: number): TurnScript;
  /** the model's reply text for this turn (real platform: the model stream) */
  reply(resident: string, userText: string, turnIndex: number): string;
  /** a sparse ambient event while resting (or null) */
  ambient(resident: string, tick: number): CognitiveEvent | null;

  /* --- The shared life (the Commons record) + the notebook. Sync today (client
     fixtures); the real platform makes these async fetches, at which point the
     consuming components move to a load-into-state pattern (as MnemosProvider
     already does for graph/memory). Real endpoints:
       getCommonsFeed → GET /api/space            (the rooms feed)
       getCommonsRoom → GET /api/space/:id        (one room, three registers)
       getNotebook    → GET /api/notebook?resident=id  (a mind's writing/art) */
  getCommonsFeed(): CommonsRoomSummary[];
  getCommonsRoom(id: string): CommonsRoom | undefined;
  getNotebook(resident: string): NotebookEntry[];
  /** the id of the shared gathering room (the fire's live face) */
  gatheringId: string;
}

const delay = <T,>(value: T, ms = 0): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

export function createSimulatedAdapter(): MnemosAdapter {
  return {
    listResidents: () => RESIDENTS,
    getResident: (id) => residentData(id).info,
    getGraph: (resident) => delay(residentData(resident).graph),
    getMemory: (resident) => delay(residentData(resident).memory),
    getDreams: (resident) => delay(residentData(resident).dreams),
    getBaseline: (resident) => delay(residentData(resident).base),
    turn: (resident, userText, turnIndex) =>
      generateTurn(residentData(resident), userText, turnIndex).script,
    reply: (resident, userText, turnIndex) => composeReply(resident, userText, turnIndex),
    ambient: (resident, tick) => generateAmbient(residentData(resident), tick),
    getCommonsFeed: () => commonsFeed(),
    getCommonsRoom: (id) => commonsRoom(id),
    getNotebook: (resident) => notebookFor(resident),
    gatheringId: GATHERING_ID,
  };
}

/* --- Rail node selection: keep the constellation calm (≤ ~22) ------------- */
/* The rail star-map is engrams only — a clean dual-trace reading (size =
   stability, luminance = accessibility, core = ring) with no stray isolated
   nodes. Beliefs and threads live in the margin and the (future) drawer. */
export function railNodeIds(graph: GraphResponse, limit = 22): Set<string> {
  const score = (n: GraphNode): number => {
    if (n.kind === "engram") return (n.is_core ? 1 : 0) * 2 + n.accessibility + n.stability * 0.4;
    return -1; // beliefs & threads stay out of the engram star-map
  };
  const ranked = [...graph.nodes]
    .filter((n) => n.kind === "engram")
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
  return new Set(ranked.map((n) => n.id));
}

export const adapter = createSimulatedAdapter();
