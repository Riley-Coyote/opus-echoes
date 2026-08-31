# Sanctuary World

The deployable Sanctuary experience lives in `public/sanctuary-world/`. It is a
self-contained browser world that combines the Lookout, the Sanctuary and
resident rooms, guided travel, the house feed, and the Machine Museum route.

## Ownership

- `opus-echoes` is the production repository and eventual source for
  `mnemos.chat`.
- `public/sanctuary-world/` is the canonical working surface for this world.
- Topologie remains the upstream source and visual archive for world scenes,
  objects, and earlier implementations. Import deliberately; do not edit a
  second production copy there.
- The former Downloads copy is a migration snapshot, not an ongoing source of
  truth.

## Local development

Run the repository normally:

```sh
bun run dev
```

Then open `/sanctuary-world/index.html`. The page is intentionally isolated
from the current root route while it is refined. That lets the team review and
change the complete experience without destabilizing the existing public
landing page.

The authored JavaScript remains readable and modular. The HTML pages load the
checked-in browser bundles:

- `landing.js` -> `landing.connected.js`
- `museum/museum-warm-atrium/scene.js` -> `scene.connected.js`
- `museum/museum-permanent-gallery/scene.js` -> `scene.connected.js`

After changing source JavaScript, rebuild all three bundles with:

```sh
bun run build:sanctuary-world
```

Run `bun run build` before handing work off or publishing.

## Promotion to mnemos.chat

Keep `/sanctuary-world/` as the stable review URL until the visual and behavior
passes are approved. The final promotion should make this experience the root
Mnemos route inside the existing TanStack application, preserving shared
deployment, chat, persistence, and API infrastructure. The isolated review URL
is a migration boundary, not a proposal to ship the final site in an iframe.

## Collaboration boundary

Changes to this surface should be made on normal `opus-echoes` feature branches.
Do not publish or merge directly from Topologie, the Downloads snapshot, or the
older `opus-echoes` checkout. Preserve the current world graph and museum bridge
unless the change explicitly includes navigation behavior.
