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
      beliefs: {
        Row: {
          cited_engram_ids: string[]
          confidence: number
          id: string
          prior_confidence: number | null
          text: string
          updated_at: string
        }
        Insert: {
          cited_engram_ids?: string[]
          confidence: number
          id?: string
          prior_confidence?: number | null
          text: string
          updated_at?: string
        }
        Update: {
          cited_engram_ids?: string[]
          confidence?: number
          id?: string
          prior_confidence?: number | null
          text?: string
          updated_at?: string
        }
        Relationships: []
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
      engrams: {
        Row: {
          accessibility: number
          attribution: string
          connections: number
          created_at: string
          id: string
          is_core: boolean
          last_reinforced_at: string
          quote: string
          redacted_text: string | null
          source_session_ids: string[]
          stability: number
          strength: number
        }
        Insert: {
          accessibility?: number
          attribution: string
          connections?: number
          created_at?: string
          id?: string
          is_core?: boolean
          last_reinforced_at?: string
          quote: string
          redacted_text?: string | null
          source_session_ids?: string[]
          stability?: number
          strength?: number
        }
        Update: {
          accessibility?: number
          attribution?: string
          connections?: number
          created_at?: string
          id?: string
          is_core?: boolean
          last_reinforced_at?: string
          quote?: string
          redacted_text?: string | null
          source_session_ids?: string[]
          stability?: number
          strength?: number
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
          text?: string
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
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash: string
          last_active_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          intent_id?: string | null
          ip_hash?: string
          last_active_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "intents"
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
        }
        Insert: {
          appearance_count?: number
          description?: string
          distinct_visitor_count?: number
          id?: string
          last_surfaced_at?: string
          name: string
        }
        Update: {
          appearance_count?: number
          description?: string
          distinct_visitor_count?: number
          id?: string
          last_surfaced_at?: string
          name?: string
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
