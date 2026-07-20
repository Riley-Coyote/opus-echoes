import { useState } from "react";

import styles from "./system-surface.module.css";

export function SystemSurface() {
  const [ready, setReady] = useState(false);

  return (
    <main className={styles.surface} data-ready={ready || undefined}>
      <div className={styles.loading} role="status" aria-live="polite">
        mounting the personal system
      </div>
      <iframe
        className={styles.frame}
        src="/mnemos-system/index.html"
        title="Mnemos personal system — Topologie register"
        sandbox="allow-scripts allow-top-navigation-by-user-activation"
        onLoad={() => setReady(true)}
      />
      <noscript>
        <p>
          This surface requires JavaScript. The rest of Mnemos remains available from the main site.
        </p>
      </noscript>
    </main>
  );
}
