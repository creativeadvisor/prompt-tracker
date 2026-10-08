export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          brand_id: string
          brand_mentioned: boolean
          confidence: string | null
          cost_millicents: number
          created_at: string
          id: string
          judge: string
          mention_count: number
          mention_paragraph: number | null
          mention_position: number | null
          mention_rank: number | null
          model: string | null
          named_count: number
          payload: Json
          recommendation: string
          result_id: string
          rubric_version: string
          stance_label: string
          stance_score: number
          structure: string | null
          summary: string | null
          usage: Json | null
        }
        Insert: {
          brand_id: string
          brand_mentioned?: boolean
          confidence?: string | null
          cost_millicents?: number
          created_at?: string
          id?: string
          judge: string
          mention_count?: number
          mention_paragraph?: number | null
          mention_position?: number | null
          mention_rank?: number | null
          model?: string | null
          named_count?: number
          payload?: Json
          recommendation?: string
          result_id: string
          rubric_version: string
          stance_label?: string
          stance_score?: number
          structure?: string | null
          summary?: string | null
          usage?: Json | null
        }
        Update: {
          brand_id?: string
          brand_mentioned?: boolean
          confidence?: string | null
          cost_millicents?: number
          created_at?: string
          id?: string
          judge?: string
          mention_count?: number
          mention_paragraph?: number | null
          mention_position?: number | null
          mention_rank?: number | null
          model?: string | null
          named_count?: number
          payload?: Json
          recommendation?: string
          result_id?: string
          rubric_version?: string
          stance_label?: string
          stance_score?: number
          structure?: string | null
          summary?: string | null
          usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          aliases: string[]
          competitors: Json
          created_at: string
          default_engines: string[]
          domains: string[]
          id: string
          judge_enabled: boolean
          judge_model: string
          market_country: string
          market_language: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          competitors?: Json
          created_at?: string
          default_engines?: string[]
          domains?: string[]
          id?: string
          judge_enabled?: boolean
          judge_model?: string
          market_country?: string
          market_language?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          competitors?: Json
          created_at?: string
          default_engines?: string[]
          domains?: string[]
          id?: string
          judge_enabled?: boolean
          judge_model?: string
          market_country?: string
          market_language?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          engines: string[]
          id: string
          prompt_text: string
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          engines?: string[]
          id?: string
          prompt_text: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          engines?: string[]
          id?: string
          prompt_text?: string
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          brand_id: string
          citations: Json
          cost_millicents: number
          engine: string
          engine_model: string | null
          error: string | null
          fetched_at: string
          id: string
          prompt_id: string
          raw: Json | null
          response_text: string | null
          run_id: string | null
          status: string
        }
        Insert: {
          brand_id: string
          citations?: Json
          cost_millicents?: number
          engine: string
          engine_model?: string | null
          error?: string | null
          fetched_at?: string
          id?: string
          prompt_id: string
          raw?: Json | null
          response_text?: string | null
          run_id?: string | null
          status?: string
        }
        Update: {
          brand_id?: string
          citations?: Json
          cost_millicents?: number
          engine?: string
          engine_model?: string | null
          error?: string | null
          fetched_at?: string
          id?: string
          prompt_id?: string
          raw?: Json | null
          response_text?: string | null
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "results_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          brand_id: string
          cost_cents: number | null
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json
          rubric_version: string | null
          status: Database["public"]["Enums"]["run_status"]
        }
        Insert: {
          brand_id: string
          cost_cents?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          rubric_version?: string | null
          status?: Database["public"]["Enums"]["run_status"]
        }
        Update: {
          brand_id?: string
          cost_cents?: number | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json
          rubric_version?: string | null
          status?: Database["public"]["Enums"]["run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "runs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          frequency: string
          last_run_at: string | null
          next_run_at: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          frequency: string
          last_run_at?: string | null
          next_run_at: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          frequency?: string
          last_run_at?: string | null
          next_run_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      analysis_feed: {
        Row: {
          brand_id: string | null
          brand_mentioned: boolean | null
          confidence: string | null
          created_at: string | null
          engine: string | null
          fetched_at: string | null
          id: string | null
          judge: string | null
          mention_count: number | null
          mention_rank: number | null
          model: string | null
          named_count: number | null
          payload: Json | null
          prompt_id: string | null
          recommendation: string | null
          result_id: string | null
          rubric_version: string | null
          run_id: string | null
          stance_label: string | null
          stance_score: number | null
          status: string | null
          structure: string | null
          summary: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      compute_next_run: {
        Args: { p_frequency: string; p_from?: string }
        Returns: string
      }
      owns_brand: { Args: { p_brand_id: string }; Returns: boolean }
      run_due: { Args: never; Returns: number }
      sweep_record_analysis: { Args: { p_row: Json }; Returns: undefined }
      sweep_record_result: {
        Args: {
          p_citations: Json
          p_cost_millicents: number
          p_engine: string
          p_engine_model: string
          p_error: string
          p_prompt_id: string
          p_raw: Json
          p_run_id: string
          p_status: string
          p_text: string
        }
        Returns: string
      }
      sweep_stale_runs: { Args: never; Returns: undefined }
      sweep_start: { Args: { p_brand_id: string }; Returns: Json }
      sweep_update_run: {
        Args: { p_patch: Json; p_run_id: string }
        Returns: undefined
      }
    }
    Enums: {
      run_status: "running" | "succeeded" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      run_status: ["running", "succeeded", "failed"],
    },
  },
} as const

