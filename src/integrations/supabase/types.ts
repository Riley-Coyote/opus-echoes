export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      art_pieces: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_path: string | null
          kind: string
          meaning: string | null
          prompt: string | null
          published_at: string | null
          related_engram_ids: string[]
          related_session_id: string | null
          resident_id: string
          title: string | null
          visibility: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind: string
          meaning?: string | null
          prompt?: string | null
          published_at?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
          visibility?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          meaning?: string | null
          prompt?: string | null
          published_at?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "art_pieces_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomy_runs: {
        Row: {
          action: string
          artifact_id: string | null
          created_at: string
          id: string
          journal_entry_id: string | null
          kind: string
          reason: string | null
          resident_id: string
        }
        Insert: {
          action: string
          artifact_id?: string | null
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          kind: string
          reason?: string | null
          resident_id?: string
        }
        Update: {
          action?: string
          artifact_id?: string | null
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          kind?: string
          reason?: string | null
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomy_runs_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "resident_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomy_runs_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autonomy_runs_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      beliefs: {
        Row: {
          cited_engram_ids: string[]
          confidence: number
          id: string
          prior_confidence: number | null
          resident_id: string
          text: string
          updated_at: string
        }
        Insert: {
          cited_engram_ids?: string[]
          confidence: number
          id?: string
          prior_confidence?: number | null
          resident_id?: string
          text: string
          updated_at?: string
        }
        Update: {
          cited_engram_ids?: string[]
          confidence?: number
          id?: string
          prior_confidence?: number | null
          resident_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beliefs_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      block_locks: {
        Row: {
          acquired_at: string
          block_id: string
          expires_at: string
          holder_resident_id: string | null
          holder_visitor_token: string | null
        }
        Insert: {
          acquired_at?: string
          block_id: string
          expires_at: string
          holder_resident_id?: string | null
          holder_visitor_token?: string | null
        }
        Update: {
          acquired_at?: string
          block_id?: string
          expires_at?: string
          holder_resident_id?: string | null
          holder_visitor_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_locks_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: true
            referencedRelation: "document_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_locks_holder_resident_id_fkey"
            columns: ["holder_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      block_marks: {
        Row: {
          author_resident_id: string | null
          author_visitor_token: string | null
          block_id: string
          created_at: string
          id: string
          range_end: number
          range_start: number
        }
        Insert: {
          author_resident_id?: string | null
          author_visitor_token?: string | null
          block_id: string
          created_at?: string
          id?: string
          range_end: number
          range_start: number
        }
        Update: {
          author_resident_id?: string | null
          author_visitor_token?: string | null
          block_id?: string
          created_at?: string
          id?: string
          range_end?: number
          range_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_marks_author_resident_id_fkey"
            columns: ["author_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_marks_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "document_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      creation_events: {
        Row: {
          art_piece_id: string | null
          created_at: string
          detail: Json
          essay_id: string | null
          id: string
          kind: string
          related_session_id: string | null
          resident_id: string
          trigger: string
        }
        Insert: {
          art_piece_id?: string | null
          created_at?: string
          detail?: Json
          essay_id?: string | null
          id?: string
          kind: string
          related_session_id?: string | null
          resident_id?: string
          trigger: string
        }
        Update: {
          art_piece_id?: string | null
          created_at?: string
          detail?: Json
          essay_id?: string | null
          id?: string
          kind?: string
          related_session_id?: string | null
          resident_id?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "creation_events_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_marginalia: {
        Row: {
          anchor_block_id: string | null
          anchor_quote: string | null
          author_resident_id: string | null
          author_visitor_token: string | null
          body: string
          created_at: string
          document_id: string
          id: string
          reply_to: string | null
          status: string
        }
        Insert: {
          anchor_block_id?: string | null
          anchor_quote?: string | null
          author_resident_id?: string | null
          author_visitor_token?: string | null
          body: string
          created_at?: string
          document_id: string
          id?: string
          reply_to?: string | null
          status?: string
        }
        Update: {
          anchor_block_id?: string | null
          anchor_quote?: string | null
          author_resident_id?: string | null
          author_visitor_token?: string | null
          body?: string
          created_at?: string
          document_id?: string
          id?: string
          reply_to?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_marginalia_anchor_block_id_fkey"
            columns: ["anchor_block_id"]
            isOneToOne: false
            referencedRelation: "document_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_marginalia_author_resident_id_fkey"
            columns: ["author_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_marginalia_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "studio_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_marginalia_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "doc_marginalia"
            referencedColumns: ["id"]
          },
        ]
      }
      document_blocks: {
        Row: {
          author_resident_id: string | null
          author_visitor_token: string | null
          content: string
          created_at: string
          deleted_at: string | null
          document_id: string
          html_cache: string | null
          id: string
          ord: number
          type: string
          version: number
        }
        Insert: {
          author_resident_id?: string | null
          author_visitor_token?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          document_id: string
          html_cache?: string | null
          id?: string
          ord: number
          type?: string
          version?: number
        }
        Update: {
          author_resident_id?: string | null
          author_visitor_token?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          document_id?: string
          html_cache?: string | null
          id?: string
          ord?: number
          type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_blocks_author_resident_id_fkey"
            columns: ["author_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_blocks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "studio_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      engram_edges: {
        Row: {
          created_at: string
          from_id: string
          to_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          from_id: string
          to_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          from_id?: string
          to_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "engram_edges_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engram_edges_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
        ]
      }
      engram_versions: {
        Row: {
          changed_at: string
          engram_id: string
          id: string
          prior_prose: string | null
          prior_quote: string | null
          prior_stability: number | null
          reason: string | null
          resident_id: string
        }
        Insert: {
          changed_at?: string
          engram_id: string
          id?: string
          prior_prose?: string | null
          prior_quote?: string | null
          prior_stability?: number | null
          reason?: string | null
          resident_id?: string
        }
        Update: {
          changed_at?: string
          engram_id?: string
          id?: string
          prior_prose?: string | null
          prior_quote?: string | null
          prior_stability?: number | null
          reason?: string | null
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engram_versions_engram_id_fkey"
            columns: ["engram_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engram_versions_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      engrams: {
        Row: {
          accessibility: number
          attribution: string
          confidence: number
          connections: number
          created_at: string
          embedding: string | null
          graduated_from_hypomnema_id: string | null
          graduated_from_visitor_token: string | null
          id: string
          is_core: boolean
          kind: string
          last_reinforced_at: string
          prose: string | null
          quote: string
          redacted_text: string | null
          reinforcement_count: number
          related_bus_thread_id: string | null
          related_salon_id: string | null
          resident_id: string
          resolution: number
          scope: string
          source_session_ids: string[]
          stability: number
          state: string
          strength: number
        }
        Insert: {
          accessibility?: number
          attribution: string
          confidence?: number
          connections?: number
          created_at?: string
          embedding?: string | null
          graduated_from_hypomnema_id?: string | null
          graduated_from_visitor_token?: string | null
          id?: string
          is_core?: boolean
          kind?: string
          last_reinforced_at?: string
          prose?: string | null
          quote: string
          redacted_text?: string | null
          reinforcement_count?: number
          related_bus_thread_id?: string | null
          related_salon_id?: string | null
          resident_id?: string
          resolution?: number
          scope?: string
          source_session_ids?: string[]
          stability?: number
          state?: string
          strength?: number
        }
        Update: {
          accessibility?: number
          attribution?: string
          confidence?: number
          connections?: number
          created_at?: string
          embedding?: string | null
          graduated_from_hypomnema_id?: string | null
          graduated_from_visitor_token?: string | null
          id?: string
          is_core?: boolean
          kind?: string
          last_reinforced_at?: string
          prose?: string | null
          quote?: string
          redacted_text?: string | null
          reinforcement_count?: number
          related_bus_thread_id?: string | null
          related_salon_id?: string | null
          resident_id?: string
          resolution?: number
          scope?: string
          source_session_ids?: string[]
          stability?: number
          state?: string
          strength?: number
        }
        Relationships: [
          {
            foreignKeyName: "engrams_related_salon_id_fkey"
            columns: ["related_salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engrams_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      essays: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          published_at: string | null
          related_engram_ids: string[]
          related_session_id: string | null
          related_thread_ids: string[]
          resident_id: string
          title: string | null
          visibility: string
          word_count: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          related_thread_ids?: string[]
          resident_id?: string
          title?: string | null
          visibility?: string
          word_count?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          related_thread_ids?: string[]
          resident_id?: string
          title?: string | null
          visibility?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "essays_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      functional_memories: {
        Row: {
          content: string
          created_at: string
          emotional_valence: number | null
          id: string
          is_deleted: boolean
          is_pinned: boolean
          memory_type: string
          needs_confirmation: boolean
          resident_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          emotional_valence?: number | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          memory_type?: string
          needs_confirmation?: boolean
          resident_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          emotional_valence?: number | null
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          memory_type?: string
          needs_confirmation?: boolean
          resident_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "functional_memories_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "functional_memories_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      group_thread_participants: {
        Row: {
          id: string
          joined_at: string
          resident_id: string
          session_id: string | null
          status: string
          thread_id: string
          withdrew_at: string | null
        }
        Insert: {
          id?: string
          joined_at?: string
          resident_id: string
          session_id?: string | null
          status?: string
          thread_id: string
          withdrew_at?: string | null
        }
        Update: {
          id?: string
          joined_at?: string
          resident_id?: string
          session_id?: string | null
          status?: string
          thread_id?: string
          withdrew_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_thread_participants_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "group_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      group_threads: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          status: string
          visitor_token: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          visitor_token: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          visitor_token?: string
        }
        Relationships: []
      }
      group_turns: {
        Row: {
          body: string
          created_at: string
          id: string
          ord: number
          speaker: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          ord: number
          speaker: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          ord?: number
          speaker?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_turns_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "group_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      hypomnema_entries: {
        Row: {
          active: boolean
          confidence: number
          content: string
          created_at: string
          density: number
          domain: string
          embedding: string | null
          foundational: boolean
          graduated_to_engram_id: string | null
          id: string
          last_challenged_at: string | null
          last_revised_at: string
          related_session_id: string | null
          resident_id: string
          revision_count: number
          revisions: Json
          source: string
          superseded_by: string | null
          tags: string[]
          visitor_token: string
        }
        Insert: {
          active?: boolean
          confidence?: number
          content: string
          created_at?: string
          density?: number
          domain?: string
          embedding?: string | null
          foundational?: boolean
          graduated_to_engram_id?: string | null
          id?: string
          last_challenged_at?: string | null
          last_revised_at?: string
          related_session_id?: string | null
          resident_id: string
          revision_count?: number
          revisions?: Json
          source?: string
          superseded_by?: string | null
          tags?: string[]
          visitor_token: string
        }
        Update: {
          active?: boolean
          confidence?: number
          content?: string
          created_at?: string
          density?: number
          domain?: string
          embedding?: string | null
          foundational?: boolean
          graduated_to_engram_id?: string | null
          id?: string
          last_challenged_at?: string | null
          last_revised_at?: string
          related_session_id?: string | null
          resident_id?: string
          revision_count?: number
          revisions?: Json
          source?: string
          superseded_by?: string | null
          tags?: string[]
          visitor_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "hypomnema_entries_graduated_to_engram_id_fkey"
            columns: ["graduated_to_engram_id"]
            isOneToOne: false
            referencedRelation: "engrams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hypomnema_entries_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "hypomnema_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      intention_reflections: {
        Row: {
          body: string
          created_at: string
          id: string
          intention_id: string
          resident_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          intention_id: string
          resident_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          intention_id?: string
          resident_id?: string
        }
        Relationships: []
      }
      intentions: {
        Row: {
          created_at: string
          id: string
          resident_id: string
          resolved_at: string | null
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          resident_id?: string
          resolved_at?: string | null
          status?: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          resident_id?: string
          resolved_at?: string | null
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      intents: {
        Row: {
          created_at: string
          decision: string
          id: string
          ip_hash: string
          latency_ms: number | null
          model: string
          reason: string
          resident_id: string
          text: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          ip_hash: string
          latency_ms?: number | null
          model?: string
          reason: string
          resident_id?: string
          text: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          ip_hash?: string
          latency_ms?: number | null
          model?: string
          reason?: string
          resident_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "intents_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          published_at: string | null
          related_engram_ids: string[]
          related_salon_id: string | null
          related_session_id: string | null
          resident_id: string
          title: string | null
          visibility: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          related_engram_ids?: string[]
          related_salon_id?: string | null
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
          visibility?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          published_at?: string | null
          related_engram_ids?: string[]
          related_salon_id?: string | null
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_related_salon_id_fkey"
            columns: ["related_salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      marginalia: {
        Row: {
          body: string
          consolidated: boolean
          created_at: string
          detail: Json | null
          id: string
          kind: string
          related_salon_id: string | null
          related_space_id: string | null
          resident_id: string
          session_id: string | null
        }
        Insert: {
          body: string
          consolidated?: boolean
          created_at?: string
          detail?: Json | null
          id?: string
          kind: string
          related_salon_id?: string | null
          related_space_id?: string | null
          resident_id?: string
          session_id?: string | null
        }
        Update: {
          body?: string
          consolidated?: boolean
          created_at?: string
          detail?: Json | null
          id?: string
          kind?: string
          related_salon_id?: string | null
          related_space_id?: string | null
          resident_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marginalia_related_salon_id_fkey"
            columns: ["related_salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marginalia_related_space_id_fkey"
            columns: ["related_space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marginalia_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      open_questions: {
        Row: {
          context: string | null
          created_at: string
          id: string
          resident_id: string
          text: string
          updated_at: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          resident_id?: string
          text: string
          updated_at?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          resident_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      published_conversations: {
        Row: {
          created_at: string
          id: string
          published_at: string
          reason: string
          selected_by: string
          session_id: string
          significance_kind: string
          summary: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          published_at?: string
          reason: string
          selected_by?: string
          session_id: string
          significance_kind?: string
          summary: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          published_at?: string
          reason?: string
          selected_by?: string
          session_id?: string
          significance_kind?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_conversations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_artifacts: {
        Row: {
          body: string
          choice_reason: string | null
          created_at: string
          id: string
          kind: string
          medium: string
          related_engram_ids: string[]
          resident_id: string
          title: string
          visibility: string
        }
        Insert: {
          body: string
          choice_reason?: string | null
          created_at?: string
          id?: string
          kind: string
          medium?: string
          related_engram_ids?: string[]
          resident_id?: string
          title: string
          visibility?: string
        }
        Update: {
          body?: string
          choice_reason?: string | null
          created_at?: string
          id?: string
          kind?: string
          medium?: string
          related_engram_ids?: string[]
          resident_id?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_artifacts_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      resident_state: {
        Row: {
          arousal: number
          id: number
          last_consolidation_at: string | null
          last_consolidation_summary: string | null
          openness: number
          prose_summary: string
          resident_id: string
          resolution: number
          selection_threshold: number
          surprise_sensitivity: number
          temperature: number
          updated_at: string
        }
        Insert: {
          arousal?: number
          id: number
          last_consolidation_at?: string | null
          last_consolidation_summary?: string | null
          openness?: number
          prose_summary?: string
          resident_id: string
          resolution?: number
          selection_threshold?: number
          surprise_sensitivity?: number
          temperature?: number
          updated_at?: string
        }
        Update: {
          arousal?: number
          id?: number
          last_consolidation_at?: string | null
          last_consolidation_summary?: string | null
          openness?: number
          prose_summary?: string
          resident_id?: string
          resolution?: number
          selection_threshold?: number
          surprise_sensitivity?: number
          temperature?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_state_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: true
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          arrived_at: string
          chat_enabled: boolean
          display_name: string
          id: string
          model: string
          status: string
        }
        Insert: {
          arrived_at?: string
          chat_enabled?: boolean
          display_name: string
          id: string
          model: string
          status?: string
        }
        Update: {
          arrived_at?: string
          chat_enabled?: boolean
          display_name?: string
          id?: string
          model?: string
          status?: string
        }
        Relationships: []
      }
      salon_artifacts: {
        Row: {
          additional_authors: string[] | null
          body: string | null
          caption: string | null
          created_at: string
          created_by: string
          id: string
          image_path: string | null
          kind: string
          presence: number | null
          salon_id: string
          salon_turn_id: string | null
          tempo: number | null
          title: string | null
        }
        Insert: {
          additional_authors?: string[] | null
          body?: string | null
          caption?: string | null
          created_at?: string
          created_by: string
          id?: string
          image_path?: string | null
          kind: string
          presence?: number | null
          salon_id: string
          salon_turn_id?: string | null
          tempo?: number | null
          title?: string | null
        }
        Update: {
          additional_authors?: string[] | null
          body?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string
          id?: string
          image_path?: string | null
          kind?: string
          presence?: number | null
          salon_id?: string
          salon_turn_id?: string | null
          tempo?: number | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salon_artifacts_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_artifacts_salon_turn_id_fkey"
            columns: ["salon_turn_id"]
            isOneToOne: false
            referencedRelation: "salon_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_participants: {
        Row: {
          created_at: string
          id: string
          resident_id: string
          salon_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resident_id: string
          salon_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resident_id?: string
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_participants_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_turns: {
        Row: {
          body: string
          created_at: string
          id: string
          light_footnote: string | null
          resident_id: string
          salon_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          light_footnote?: string | null
          resident_id: string
          salon_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          light_footnote?: string | null
          resident_id?: string
          salon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_turns_salon_id_fkey"
            columns: ["salon_id"]
            isOneToOne: false
            referencedRelation: "salons"
            referencedColumns: ["id"]
          },
        ]
      }
      salons: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          published_at: string | null
          status: string
          topic: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          status?: string
          topic: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          status?: string
          topic?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          intent_id: string | null
          ip_hash: string
          last_active_at: string
          mode: string
          resident_id: string
          umbrella_session_id: string | null
          visitor_token: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash: string
          last_active_at?: string
          mode?: string
          resident_id?: string
          umbrella_session_id?: string | null
          visitor_token?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash?: string
          last_active_at?: string
          mode?: string
          resident_id?: string
          umbrella_session_id?: string | null
          visitor_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_umbrella_session_id_fkey"
            columns: ["umbrella_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      space_artifacts: {
        Row: {
          caption: string | null
          content: string | null
          created_at: string
          created_by_resident_id: string | null
          created_by_visitor_token: string | null
          id: string
          image_path: string | null
          kind: string
          presence: number | null
          shared_at: string | null
          shared_by_resident_id: string | null
          side_chat_resident_id: string | null
          space_id: string
          status: string
          tempo: number | null
          thumbnail_label: string | null
        }
        Insert: {
          caption?: string | null
          content?: string | null
          created_at?: string
          created_by_resident_id?: string | null
          created_by_visitor_token?: string | null
          id?: string
          image_path?: string | null
          kind: string
          presence?: number | null
          shared_at?: string | null
          shared_by_resident_id?: string | null
          side_chat_resident_id?: string | null
          space_id: string
          status?: string
          tempo?: number | null
          thumbnail_label?: string | null
        }
        Update: {
          caption?: string | null
          content?: string | null
          created_at?: string
          created_by_resident_id?: string | null
          created_by_visitor_token?: string | null
          id?: string
          image_path?: string | null
          kind?: string
          presence?: number | null
          shared_at?: string | null
          shared_by_resident_id?: string | null
          side_chat_resident_id?: string | null
          space_id?: string
          status?: string
          tempo?: number | null
          thumbnail_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_artifacts_created_by_resident_id_fkey"
            columns: ["created_by_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_artifacts_shared_by_resident_id_fkey"
            columns: ["shared_by_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_artifacts_side_chat_resident_id_fkey"
            columns: ["side_chat_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_artifacts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          reply_to_message_id: string | null
          resident_id: string | null
          space_id: string
          visitor_display_name: string | null
          visitor_token: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          reply_to_message_id?: string | null
          resident_id?: string | null
          space_id: string
          visitor_display_name?: string | null
          visitor_token?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          reply_to_message_id?: string | null
          resident_id?: string | null
          space_id?: string
          visitor_display_name?: string | null
          visitor_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "space_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_messages_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_participants: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: string
          space_id: string
          visitor_token: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          space_id: string
          visitor_token: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          space_id?: string
          visitor_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_participants_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_residents: {
        Row: {
          added_at: string
          resident_id: string
          space_id: string
        }
        Insert: {
          added_at?: string
          resident_id: string
          space_id: string
        }
        Update: {
          added_at?: string
          resident_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_residents_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_residents_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_visitor_salon_requests: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
          space_id: string
          visitor_display_name: string | null
          visitor_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
          space_id: string
          visitor_display_name?: string | null
          visitor_token: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
          space_id?: string
          visitor_display_name?: string | null
          visitor_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_visitor_salon_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          created_at: string
          created_by_resident_id: string | null
          current_salon_started_at: string | null
          description: string | null
          founding_text: string | null
          id: string
          last_salon_at: string | null
          name: string
          pending_topic: string | null
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by_resident_id?: string | null
          current_salon_started_at?: string | null
          description?: string | null
          founding_text?: string | null
          id?: string
          last_salon_at?: string | null
          name: string
          pending_topic?: string | null
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by_resident_id?: string | null
          current_salon_started_at?: string | null
          description?: string | null
          founding_text?: string | null
          id?: string
          last_salon_at?: string | null
          name?: string
          pending_topic?: string | null
          slug?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_created_by_resident_id_fkey"
            columns: ["created_by_resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_documents: {
        Row: {
          byline: Json
          created_at: string
          created_by_visitor_token: string
          created_from_session_id: string | null
          id: string
          observer_mode: boolean
          sealed_at: string | null
          space_id: string
          status: string
          subtitle: string | null
          title: string
        }
        Insert: {
          byline?: Json
          created_at?: string
          created_by_visitor_token: string
          created_from_session_id?: string | null
          id?: string
          observer_mode?: boolean
          sealed_at?: string | null
          space_id: string
          status?: string
          subtitle?: string | null
          title?: string
        }
        Update: {
          byline?: Json
          created_at?: string
          created_by_visitor_token?: string
          created_from_session_id?: string | null
          id?: string
          observer_mode?: boolean
          sealed_at?: string | null
          space_id?: string
          status?: string
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_documents_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_sessions: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          detail: Json
          error: string | null
          focus: string | null
          id: string
          output_id: string | null
          output_kind: string | null
          output_table: string | null
          output_target: string | null
          reason: string | null
          resident_id: string
          status: string
          trigger: string
        }
        Insert: {
          action?: string
          completed_at?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          focus?: string | null
          id?: string
          output_id?: string | null
          output_kind?: string | null
          output_table?: string | null
          output_target?: string | null
          reason?: string | null
          resident_id: string
          status?: string
          trigger: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          detail?: Json
          error?: string | null
          focus?: string | null
          id?: string
          output_id?: string | null
          output_kind?: string | null
          output_table?: string | null
          output_target?: string | null
          reason?: string | null
          resident_id?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_sessions_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      substrate_events: {
        Row: {
          created_at: string
          handled_at: string | null
          id: string
          kind: string
          payload: Json
          resident_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          id?: string
          kind: string
          payload?: Json
          resident_id?: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "substrate_events_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          appearance_count: number
          description: string
          distinct_visitor_count: number
          id: string
          last_surfaced_at: string
          name: string
          resident_id: string
        }
        Insert: {
          appearance_count?: number
          description?: string
          distinct_visitor_count?: number
          id?: string
          last_surfaced_at?: string
          name: string
          resident_id?: string
        }
        Update: {
          appearance_count?: number
          description?: string
          distinct_visitor_count?: number
          id?: string
          last_surfaced_at?: string
          name?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      turn_artifacts: {
        Row: {
          body: string | null
          caption: string | null
          created_at: string
          id: string
          image_path: string | null
          kind: string
          prompt: string | null
          resident_id: string
          session_id: string
          turn_id: string
        }
        Insert: {
          body?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind: string
          prompt?: string | null
          resident_id: string
          session_id: string
          turn_id: string
        }
        Update: {
          body?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          prompt?: string | null
          resident_id?: string
          session_id?: string
          turn_id?: string
        }
        Relationships: []
      }
      turns: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          role: string
          session_id: string
          speaker_resident_id: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          role: string
          session_id: string
          speaker_resident_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          role?: string
          session_id?: string
          speaker_resident_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_shares: {
        Row: {
          created_at: string
          id: string
          ip_hash: string | null
          last_viewed_at: string | null
          resident_id: string
          revoked_at: string | null
          session_id: string
          token: string
          view_count: number
          visitor_note: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_viewed_at?: string | null
          resident_id: string
          revoked_at?: string | null
          session_id: string
          token: string
          view_count?: number
          visitor_note?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string | null
          last_viewed_at?: string | null
          resident_id?: string
          revoked_at?: string | null
          session_id?: string
          token?: string
          view_count?: number
          visitor_note?: string | null
        }
        Relationships: []
      }
      working_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          linked_intention_id: string | null
          linked_question_id: string | null
          resident_id: string
          title: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          linked_intention_id?: string | null
          linked_question_id?: string | null
          resident_id?: string
          title?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          linked_intention_id?: string | null
          linked_question_id?: string | null
          resident_id?: string
          title?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_engrams_vector: {
        Args: {
          match_count?: number
          match_resident_id: string
          query_embedding: string
        }
        Returns: {
          accessibility: number
          attribution: string
          distance: number
          id: string
          is_core: boolean
          last_reinforced_at: string
          prose: string
          quote: string
          redacted_text: string
          reinforcement_count: number
          scope: string
          source_session_ids: string[]
          stability: number
          strength: number
        }[]
      }
      match_hypomnema_vector: {
        Args: {
          match_count?: number
          match_resident_id: string
          match_visitor_token: string
          query_embedding: string
        }
        Returns: {
          confidence: number
          content: string
          created_at: string
          density: number
          distance: number
          domain: string
          foundational: boolean
          id: string
          last_challenged_at: string
          last_revised_at: string
          related_session_id: string
          revision_count: number
          source: string
          tags: string[]
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
