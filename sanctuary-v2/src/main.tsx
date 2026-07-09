import { createRoot } from "react-dom/client";

// The typefaces load in index.html — Inter Tight (display) · Inter (body) ·
// JetBrains Mono (data / labels / metrics) · Newsreader (the notebook's reading
// voice) · Press Start 2P (chrome only). Hierarchy comes from size, weight, and
// breath, not from swapping families.

import "./foundation/tokens.css";
import "./foundation/type.css";
import "./foundation/base.css";

import { App } from "./App";

// No StrictMode: the room is animation-heavy (a shared heartbeat, a firing
// constellation). Double-invoked effects would fight the beat; effects are
// written clean either way, but we keep dev honest to prod.
createRoot(document.getElementById("root")!).render(<App />);
