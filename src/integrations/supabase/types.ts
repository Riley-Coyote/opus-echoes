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
          related_engram_ids: string[]
          related_session_id: string | null
          resident_id: string
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind: string
          meaning?: string | null
          prompt?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_path?: string | null
          kind?: string
          meaning?: string | null
          prompt?: string | null
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
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
          id: string
          is_core: boolean
          kind: string
          last_reinforced_at: string
          prose: string | null
          quote: string
          redacted_text: string | null
          reinforcement_count: number
          resident_id: string
          resolution: number
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
          id?: string
          is_core?: boolean
          kind?: string
          last_reinforced_at?: string
          prose?: string | null
          quote: string
          redacted_text?: string | null
          reinforcement_count?: number
          resident_id?: string
          resolution?: number
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
          id?: string
          is_core?: boolean
          kind?: string
          last_reinforced_at?: string
          prose?: string | null
          quote?: string
          redacted_text?: string | null
          reinforcement_count?: number
          resident_id?: string
          resolution?: number
          source_session_ids?: string[]
          stability?: number
          state?: string
          strength?: number
        }
        Relationships: [
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
          related_engram_ids: string[]
          related_session_id: string | null
          related_thread_ids: string[]
          resident_id: string
          title: string | null
          word_count: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          related_engram_ids?: string[]
          related_session_id?: string | null
          related_thread_ids?: string[]
          resident_id?: string
          title?: string | null
          word_count?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          related_engram_ids?: string[]
          related_session_id?: string | null
          related_thread_ids?: string[]
          resident_id?: string
          title?: string | null
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
          related_engram_ids: string[]
          related_session_id: string | null
          resident_id: string
          title: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind?: string
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          related_engram_ids?: string[]
          related_session_id?: string | null
          resident_id?: string
          title?: string | null
        }
        Relationships: [
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
          resident_id: string
          session_id: string
        }
        Insert: {
          body: string
          consolidated?: boolean
          created_at?: string
          detail?: Json | null
          id?: string
          kind: string
          resident_id?: string
          session_id: string
        }
        Update: {
          body?: string
          consolidated?: boolean
          created_at?: string
          detail?: Json | null
          id?: string
          kind?: string
          resident_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marginalia_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
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
          display_name: string
          id: string
          model: string
          status: string
        }
        Insert: {
          arrived_at?: string
          display_name: string
          id: string
          model: string
          status?: string
        }
        Update: {
          arrived_at?: string
          display_name?: string
          id?: string
          model?: string
          status?: string
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
          resident_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash: string
          last_active_at?: string
          resident_id?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash?: string
          last_active_at?: string
          resident_id?: string
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
      turns: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          role: string
          session_id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
