/* INNER WEATHER as a heads-up display — a clean horizontal readout across the
   top, no panel, transparent. Each dimension is a small ring gauge whose arc
   is the value; label + value sit beside it like an instrument cluster. */

import { useMnemos } from "../state/MnemosProvider";
import { WEATHER_DIMS } from "../types/mnemos";
import styles from "./WeatherHud.module.css";

const R = 8.5;
const C = 2 * Math.PI * R;

function arcColor(v: number): string {
  const a = 0.34 + v * 0.6;
  return `rgba(var(--mark-rgb), ${a.toFixed(3)})`;
}
// the numeral leads by magnitude — dominant feelings read brighter than faint ones
function valColor(v: number): string {
  const a = 0.5 + v * 0.45;
  return `rgba(var(--mark-rgb), ${a.toFixed(3)})`;
}

export function WeatherHud() {
  const { weather } = useMnemos();
  return (
    <div className={styles.hud} aria-label="inner weather">
      {WEATHER_DIMS.map(({ key, label }) => {
        const v = weather[key];
        return (
          <div className={styles.metric} key={key}>
            <span className={styles.label}>{label}</span>
            <svg className={styles.ring} width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              <circle className={styles.ringBg} cx="10" cy="10" r={R} />
              <circle
                className={styles.ringArc}
                cx="10"
                cy="10"
                r={R}
                transform="rotate(-90 10 10)"
                style={{ strokeDasharray: `${(v * C).toFixed(2)} ${C.toFixed(2)}`, stroke: arcColor(v) }}
              />
            </svg>
            <span className={`${styles.val} tnum`} style={{ color: valColor(v) }}>
              {v.toFixed(2).slice(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
