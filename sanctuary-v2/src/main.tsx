import { createRoot } from "react-dom/client";

// Self-hosted fonts — bundled, no network FOUT. One superfamily, one system:
// Geist (sans) is the voice; Geist Mono is its monospaced cut for data, labels,
// and metrics. Sharing one skeleton is what makes the instrument read unified.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
// The second voice: serif = the composed mind, the past. Fraunces is optical —
// high-contrast at display sizes, calm at reading sizes. It speaks only in the
// notebook (the reading surface); the live chat stays the Geist present.
// The /full builds carry the opsz axis — without them font-optical-sizing is a no-op.
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";

import "./foundation/tokens.css";
import "./foundation/type.css";
import "./foundation/base.css";

import { App } from "./App";

// No StrictMode: the room is animation-heavy (a shared heartbeat, a firing
// constellation). Double-invoked effects would fight the beat; effects are
// written clean either way, but we keep dev honest to prod.
createRoot(document.getElementById("root")!).render(<App />);
