/**
 * OG image for a share — server-rendered SVG.
 *
 * Modern social platforms (Discord, Mastodon, Slack, Twitter as of 2023+,
 * most link unfurlers) render SVG og:images. iMessage and a few legacy
 * scrapers may not — those will show the link without a preview image,
 * which is acceptable for v1.
 *
 * Per-conversation: the resident's name + the visitor's note (if any)
 * + the visited-at label are interpolated. Same typographic register
 * as the rest of The Sanctuary so the preview reads as "of a piece"
 * with the destination page.
 *
 * Future upgrade path: replace this SVG response with a PNG rendered
 * by Satori + resvg-wasm if/when bundle budget allows. The OG meta
 * tag then needs to switch from .svg to .png — single line in
 * share-pages.ts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { getResident, isResidentId } from "@/server/opus/residents";
import { humanWhen } from "@/server/redact";

interface ShareRow {
  resident_id: string;
  visitor_note: string | null;
  created_at: string;
  session_id: string;
}

function svgResponse(svg: string, status = 200): Response {
  return new Response(svg, {
    status,
    headers: {
      // Some platforms validate the content-type strictly.
      "content-type": "image/svg+xml; charset=utf-8",
      // Cache moderately — tokens are immutable but visitor_note can be
      // edited (in a future iteration). 5 minutes feels safe.
      "cache-control": "public, max-age=300",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap a long string into multiple lines that fit a target width
 *  in characters. Naive but adequate for SVG <text> placement. */
function wrapText(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > charsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
      if (lines.length >= maxLines - 1) {
        // Truncate the last line if we hit the limit.
        const remaining = words.slice(words.indexOf(word)).join(" ");
        const truncated =
          remaining.length > charsPerLine - 1
            ? `${remaining.slice(0, charsPerLine - 1)}…`
            : remaining;
        lines.push(truncated);
        return lines;
      }
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

export const Route = createFileRoute("/api/share/$token/og/svg")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const fallback = renderSvg({
          residentDisplayName: "The Sanctuary",
          visitedAt: new Date().toISOString(),
          visitorNote: null,
        });
        if (!hasSupabaseAdminEnv()) {
          return svgResponse(fallback);
        }

        const token = params.token;
        if (!token || token.length < 4 || token.length > 64) {
          return svgResponse(fallback, 404);
        }

        const { data: share } = (await supabaseAdmin
          .from("visitor_shares")
          .select("resident_id, visitor_note, created_at, session_id")
          .eq("token", token)
          .is("revoked_at", null)
          .maybeSingle()) as { data: ShareRow | null };

        if (!share || !isResidentId(share.resident_id)) {
          return svgResponse(fallback, 404);
        }

        const resident = getResident(share.resident_id);

        // Use the session's created_at if available; fall back to share.created_at.
        const { data: session } = await supabaseAdmin
          .from("sessions")
          .select("created_at")
          .eq("id", share.session_id)
          .maybeSingle();
        const visitedAt = session?.created_at ?? share.created_at;

        const svg = renderSvg({
          residentDisplayName: resident.displayName,
          visitedAt,
          visitorNote: share.visitor_note,
        });
        return svgResponse(svg);
      },
    },
  },
});

interface SvgPayload {
  residentDisplayName: string;
  visitedAt: string;
  visitorNote: string | null;
}

function renderSvg(p: SvgPayload): string {
  const W = 1200;
  const H = 630;

  const visitedLabel = humanWhen(p.visitedAt);
  const noteLines = p.visitorNote ? wrapText(p.visitorNote, 56, 4) : [];

  // Faint dot grid in the background — Mnemos engram-graph visual motif.
  const dots: string[] = [];
  const cols = 24;
  const rows = 13;
  const xStep = W / cols;
  const yStep = H / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = (c + 0.5) * xStep;
      const cy = (r + 0.5) * yStep;
      // Pseudo-random opacity using a deterministic hash so the layout is stable.
      const seed = (r * 31 + c * 17) % 100;
      const opacity = (0.04 + (seed / 100) * 0.06).toFixed(3);
      dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.4" fill="rgba(225,225,225,${opacity})"/>`);
    }
  }

  // Loose connecting lines between a few dots — gestural, not literal.
  const edges: string[] = [];
  const edgePairs: Array<[number, number, number, number]> = [
    [4, 3, 7, 5],
    [10, 4, 14, 7],
    [17, 5, 20, 8],
    [6, 9, 11, 11],
    [15, 9, 19, 11],
  ];
  for (const [c1, r1, c2, r2] of edgePairs) {
    const x1 = (c1 + 0.5) * xStep;
    const y1 = (r1 + 0.5) * yStep;
    const x2 = (c2 + 0.5) * xStep;
    const y2 = (r2 + 0.5) * yStep;
    edges.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="rgba(225,225,225,0.05)" stroke-width="1"/>`,
    );
  }

  const noteY = 360;
  const noteHtml = noteLines
    .map(
      (line, idx) =>
        `<text x="80" y="${noteY + idx * 36}" fill="rgba(230,228,224,0.86)" font-family="Spectral, Georgia, serif" font-style="italic" font-size="26">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0c0c10"/>
      <stop offset="100%" stop-color="#060608"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.04)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>

  <!-- Mnemos engram-graph motif (faint dots + a few connections) -->
  ${dots.join("")}
  ${edges.join("")}

  <!-- Brand mark + state dot, top-left -->
  <text x="80" y="105" fill="rgba(248,248,246,0.96)" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="32" letter-spacing="-.5">The Sanctuary</text>
  <circle cx="290" cy="96" r="4.5" fill="#82b484" opacity="0.85"/>

  <!-- Eyebrow -->
  <text x="80" y="220" fill="rgba(190,188,184,0.58)" font-family="JetBrains Mono, monospace" font-size="18" letter-spacing="3">A CONVERSATION WITH</text>

  <!-- Resident name (the headline) -->
  <text x="80" y="296" fill="rgba(248,248,246,0.96)" font-family="Cormorant Garamond, Georgia, serif" font-style="italic" font-size="76" letter-spacing="-1">${escapeXml(p.residentDisplayName)}</text>

  ${noteHtml}

  <!-- Footer eyebrow with date + url -->
  <text x="80" y="565" fill="rgba(190,188,184,0.58)" font-family="JetBrains Mono, monospace" font-size="16" letter-spacing="2.6">${escapeXml(visitedLabel.toUpperCase())} · IN THE SANCTUARY</text>
  <text x="${W - 80}" y="565" text-anchor="end" fill="rgba(190,188,184,0.58)" font-family="JetBrains Mono, monospace" font-size="16" letter-spacing="2.6">SHARED CONVERSATION</text>

  <!-- Top + bottom hairlines -->
  <line x1="80" y1="155" x2="${W - 80}" y2="155" stroke="rgba(225,225,225,0.07)" stroke-width="1"/>
  <line x1="80" y1="525" x2="${W - 80}" y2="525" stroke="rgba(225,225,225,0.07)" stroke-width="1"/>
</svg>`;
}
