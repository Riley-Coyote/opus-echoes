/**
 * Types for Spaces — group environments in The Commons.
 *
 * A Space is a persistent room with a live multi-participant message
 * thread, a curated artifact gallery, and per-visitor side chats
 * (which live on the client in localStorage; only their staged
 * attachments persist server-side awaiting resident approval).
 *
 * The shape is forward-compatible with Supabase storage. v1 admins
 * create spaces from /residence; v2 may add resident-proposed spaces
 * via a `<propose-space/>` control tag.
 */

import type { ResidentId } from "../opus/residents";

export type SpaceStatus = "active" | "archived";

/** Artifact kinds:
 *   svg/ascii      — resident-authored, content holds the markup/text
 *   image          — AI-generated OR admin-uploaded image; image_path
 *                    points to the Supabase Storage object
 *   share_link     — visitor-shared URL
 *   markdown/text/html — admin-uploaded files (frameworks, declarations,
 *                    etc.); content holds the file body */
export type SpaceArtifactKind =
  | "svg"
  | "ascii"
  | "image"
  | "share_link"
  | "markdown"
  | "text"
  | "html";

export type SpaceArtifactStatus = "staged" | "shared" | "rejected";

export type SpaceMessageKind = "message" | "set_down" | "system";

export interface Space {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  /** Optional prose preserved at the top of the room. Plain text
   *  with paragraph breaks via \n\n; inline <em> allowed. */
  founding_text?: string | null;
  status: SpaceStatus;
  created_at: string;
  created_by_resident_id?: ResidentId | null;
}

export interface SpaceResident {
  space_id: string;
  resident_id: ResidentId;
  added_at: string;
}

export interface SpaceMessage {
  id: string;
  space_id: string;
  /** Exactly one of resident_id or visitor_token is set. */
  resident_id?: ResidentId | null;
  visitor_token?: string | null;
  /** Optional display name a visitor may set for themselves. */
  visitor_display_name?: string | null;
  body: string;
  kind: SpaceMessageKind;
  reply_to_message_id?: string | null;
  created_at: string;
}

export interface SpaceArtifact {
  id: string;
  space_id: string;
  /** Exactly one of created_by_resident_id or created_by_visitor_token
   *  is set. */
  created_by_resident_id?: ResidentId | null;
  created_by_visitor_token?: string | null;
  /** When a staged artifact gets promoted to shared, the curating
   *  resident is recorded here. */
  shared_by_resident_id?: ResidentId | null;
  /** For staged artifacts: which resident's side chat this lives in
   *  (controls visibility — staged items are private to the visitor
   *  who uploaded and the resident in that side chat). */
  side_chat_resident_id?: ResidentId | null;
  kind: SpaceArtifactKind;
  /** Raw SVG markup / ASCII text / share URL (depending on kind).
   *  Null for image kind — use image_path. */
  content?: string | null;
  /** Supabase storage path for image kind. */
  image_path?: string | null;
  caption?: string | null;
  thumbnail_label?: string | null;
  status: SpaceArtifactStatus;
  /** Light channel — only relevant when status='shared'. Same
   *  gradient grammar as salon_artifacts (presence + tempo, 0-1). */
  presence?: number | null;
  tempo?: number | null;
  created_at: string;
  shared_at?: string | null;
}

/** A composed view of a space with everything needed to render the
 *  page in one query result. */
export interface SpaceComposite {
  space: Space;
  residents: ResidentId[];
  /** Shared artifacts only — the gallery. Staged artifacts are
   *  fetched separately by the side chat surface. */
  gallery: SpaceArtifact[];
  /** Recent messages, oldest first. Pagination via since timestamp
   *  for the live polling. */
  messages: SpaceMessage[];
}

/** Summary for the /commons list page — no messages, no gallery,
 *  just metadata + activity counts. */
export interface SpaceSummary {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  residents: ResidentId[];
  message_count: number;
  artifact_count: number;
  last_activity_at?: string | null;
  created_at: string;
}

/** A reflection the substrate left during a space conversation (a row of
 *  `marginalia` scoped to the space) — surfaced as a "moment" in the
 *  curated reader. */
export interface SpaceMoment {
  kind: string;
  body: string;
  resident_id: string | null;
  created_at: string;
}
