import { createRoot } from "react-dom/client";

// Self-hosted fonts — bundled, no network FOUT. One superfamily, one system:
// Geist (sans) is the voice; Geist Mono is its monospaced cut for data, labels,
// and metrics. Sharing one skeleton is what makes the instrument read unified.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
// One superfamily. Geist is the voice; Geist Mono is its monospaced cut for data,
// labels, and metrics. The notebook reads in the same Geist — the reading feel
// comes from size, measure, and breath, not from a second typeface.

import "./foundation/tokens.css";
import "./foundation/type.css";
import "./foundation/base.css";

import { App } from "./App";

// No StrictMode: the room is animation-heavy (a shared heartbeat, a firing
// constellation). Double-invoked effects would fight the beat; effects are
// written clean either way, but we keep dev honest to prod.
createRoot(document.getElementById("root")!).render(<App />);
