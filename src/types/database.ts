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
      creations: {
        Row: {
          canvas_data: Json
          created_at: string
          preview_image_url: string | null
          id: string
          name: string
          source_type: Database["public"]["Enums"]["creation_source_type"]
          status: Database["public"]["Enums"]["creation_status"]
          tags: string[]
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_data?: Json
          created_at?: string
          preview_image_url?: string | null
          id?: string
          name?: string
          source_type: Database["public"]["Enums"]["creation_source_type"]
          status?: Database["public"]["Enums"]["creation_status"]
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          preview_image_url?: string | null
          id?: string
          name?: string
          source_type?: Database["public"]["Enums"]["creation_source_type"]
          status?: Database["public"]["Enums"]["creation_status"]
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_fields: {
        Row: {
          font_size: number
          height: number
          id: string
          label: string
          order_index: number
          position_x: number
          position_y: number
          rotation: number
          template_id: string
          width: number
        }
        Insert: {
          font_size?: number
          height?: number
          id?: string
          label: string
          order_index?: number
          position_x?: number
          position_y?: number
          rotation?: number
          template_id: string
          width?: number
        }
        Update: {
          font_size?: number
          height?: number
          id?: string
          label?: string
          order_index?: number
          position_x?: number
          position_y?: number
          rotation?: number
          template_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_usage_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          template_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_usage_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          blank_image_url: string
          created_at: string
          created_by: string
          description: string | null
          example_image_url: string
          export_count: number
          id: string
          image_height: number
          image_width: number
          last_used_at: string | null
          name: string
          save_count: number
          tags: string[]
          thumbnail_url: string | null
          use_count_7d: number
          use_count_total: number
        }
        Insert: {
          blank_image_url: string
          created_at?: string
          created_by?: string
          description?: string | null
          example_image_url: string
          export_count?: number
          id?: string
          image_height: number
          image_width: number
          last_used_at?: string | null
          name: string
          save_count?: number
          tags?: string[]
          thumbnail_url?: string | null
          use_count_7d?: number
          use_count_total?: number
        }
        Update: {
          blank_image_url?: string
          created_at?: string
          created_by?: string
          description?: string | null
          example_image_url?: string
          export_count?: number
          id?: string
          image_height?: number
          image_width?: number
          last_used_at?: string | null
          name?: string
          save_count?: number
          tags?: string[]
          thumbnail_url?: string | null
          use_count_7d?: number
          use_count_total?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      creation_source_type: "template" | "freeform"
      creation_status: "draft" | "final"
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
  public: {
    Enums: {
      creation_source_type: ["template", "freeform"],
      creation_status: ["draft", "final"],
    },
  },
} as const
