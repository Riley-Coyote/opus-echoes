/**
 * Shared visual effects emitted across multiple public surfaces.
 *
 * The viewport edge glow lives here as a single source of truth so the
 * commons page, the new classic-chat surface, and any future surface
 * that wants the same atmospheric layer all consume the identical
 * definition. Iteration in one place; no drift between surfaces.
 *
 * History: this CSS originally lived inline in src/server/commons-page.ts.
 * Lifted out 2026-05-13 as part of the classic-chat phase A work so the
 * minimal-chat surface could use it too — the commons-light-souls branch
 * keeps iterating on the same shared definition.
 */

/**
 * Viewport edge glow — ambient atmospheric layer.
 *
 * Same shimmer grammar as the salon artifact border, but pinned to the
 * viewport (position:fixed + inset:0), much wider band (22px), much
 * dimmer peaks (~0.10 vs the artifact's ~0.90), and slower oscillators
 * (11–37s primes vs 3–23s). Four hues distributed across 8 pools — warm
 * amber + soft violet + pink-peach + cool cream — blending around the
 * perimeter like candlelight catching the edge of a room or the diffuse
 * color-shift of a twilight sky. pointer-events:none and a z-index that
 * sits above the vignette but below the nav, so it never intercepts or
 * competes with content.
 *
 * SVG mask: square outer rectangle (reaches viewport corners — no dark
 * wedges) with a rounded-corner inner cutout (preserves the soft inner
 * edge). The band shape is the outer minus the inner via
 * fill-rule:evenodd. preserveAspectRatio='none' stretches the SVG to
 * fill the viewport; the inner corner radius and band inset are in
 * viewBox units (0–100), so they scale with viewport.
 *
 * Peaks stay low — the glow is felt, not seen first. The slow primes
 * plus four hues mean the color cast at any corner is always drifting
 * without any single transition feeling like "motion."
 *
 * The fixed positioning + percentage-based gradient stops make it adapt
 * smoothly on window-drag with zero JS.
 */
export const VIEWPORT_GLOW_CSS = `
@property --vg1 { syntax: '<number>'; initial-value: 0.03; inherits: false; }
@property --vg2 { syntax: '<number>'; initial-value: 0.02; inherits: false; }
@property --vg3 { syntax: '<number>'; initial-value: 0.04; inherits: false; }
@property --vg4 { syntax: '<number>'; initial-value: 0.02; inherits: false; }
@property --vg5 { syntax: '<number>'; initial-value: 0.03; inherits: false; }
@property --vg6 { syntax: '<number>'; initial-value: 0.02; inherits: false; }
@property --vg7 { syntax: '<number>'; initial-value: 0.04; inherits: false; }
@property --vg8 { syntax: '<number>'; initial-value: 0.02; inherits: false; }

.viewport-glow{
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:2;
  background:
    radial-gradient(ellipse 55% 55% at 0% 0%,     rgba(220,176,110, var(--vg1)) 0%, transparent 72%),
    radial-gradient(ellipse 70% 45% at 50% 0%,    rgba(160,140,188, var(--vg2)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 100% 0%,   rgba(220,170,168, var(--vg3)) 0%, transparent 72%),
    radial-gradient(ellipse 45% 70% at 100% 50%,  rgba(218,215,210, var(--vg4)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 100% 100%, rgba(220,176,110, var(--vg5)) 0%, transparent 72%),
    radial-gradient(ellipse 70% 45% at 50% 100%,  rgba(160,140,188, var(--vg6)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 0% 100%,   rgba(220,170,168, var(--vg7)) 0%, transparent 72%),
    radial-gradient(ellipse 45% 70% at 0% 50%,    rgba(218,215,210, var(--vg8)) 0%, transparent 72%);
  -webkit-mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path fill-rule='evenodd' fill='white' d='M0,0 H100 V100 H0 Z M1.7,2.7 Q1.7,1.7 2.7,1.7 H97.3 Q98.3,1.7 98.3,2.7 V97.3 Q98.3,98.3 97.3,98.3 H2.7 Q1.7,98.3 1.7,97.3 Z'/></svg>");
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path fill-rule='evenodd' fill='white' d='M0,0 H100 V100 H0 Z M1.7,2.7 Q1.7,1.7 2.7,1.7 H97.3 Q98.3,1.7 98.3,2.7 V97.3 Q98.3,98.3 97.3,98.3 H2.7 Q1.7,98.3 1.7,97.3 Z'/></svg>");
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  animation:
    vg-1 11s ease-in-out infinite,
    vg-2 13s ease-in-out infinite,
    vg-3 17s ease-in-out infinite,
    vg-4 19s ease-in-out infinite,
    vg-5 23s ease-in-out infinite,
    vg-6 29s ease-in-out infinite,
    vg-7 31s ease-in-out infinite,
    vg-8 37s ease-in-out infinite;
}

@keyframes vg-1 { 0%,100% { --vg1: 0.015; } 50% { --vg1: 0.13; } }
@keyframes vg-2 { 0%,100% { --vg2: 0.11; }  50% { --vg2: 0.02; } }
@keyframes vg-3 { 0%,100% { --vg3: 0.02; }  50% { --vg3: 0.14; } }
@keyframes vg-4 { 0%,100% { --vg4: 0.10; }  50% { --vg4: 0.015; } }
@keyframes vg-5 { 0%,100% { --vg5: 0.02; }  50% { --vg5: 0.12; } }
@keyframes vg-6 { 0%,100% { --vg6: 0.09; }  50% { --vg6: 0.02; } }
@keyframes vg-7 { 0%,100% { --vg7: 0.015; } 50% { --vg7: 0.11; } }
@keyframes vg-8 { 0%,100% { --vg8: 0.08; }  50% { --vg8: 0.015; } }

@media (prefers-reduced-motion: reduce){
  .viewport-glow{ animation: none; }
}
`;
