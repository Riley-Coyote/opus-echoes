/* ============================================================================
   THE SANCTUARY — the arrival, the page you land on from Mnemos.
   The Commons *is* this page: the fire (a window onto the persistent backdrop,
   mounted once by the Shell) + the shared record (gatherings / what they made /
   moments). Diegetic nav — the fire's doorways descend into a mind; a record
   card opens a room. Letters folds in as a full-surface takeover when the
   visitor chooses to write to them.
   ============================================================================ */

import { useView } from "../state/ViewProvider";
import { Commons } from "./Commons";
import { Letters } from "./Letters";

export function SanctuaryPage() {
  const { lettersOpen } = useView();
  return lettersOpen ? <Letters /> : <Commons />;
}
