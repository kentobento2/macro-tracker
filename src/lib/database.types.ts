// Generated from the Supabase schema (helpers trimmed). Regenerate after migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      api_tokens: {
        Row: {
          created_at: string;
          id: string;
          last_used_at: string | null;
          name: string;
          revoked_at: string | null;
          token_hash: string;
          token_prefix: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_used_at?: string | null;
          name: string;
          revoked_at?: string | null;
          token_hash: string;
          token_prefix: string;
          user_id?: string;
        };
        Update: Partial<Database['public']['Tables']['api_tokens']['Insert']>;
        Relationships: [];
      };
      body_weights: {
        Row: {
          created_at: string;
          entry_date: string;
          note: string | null;
          updated_at: string;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          entry_date: string;
          note?: string | null;
          updated_at?: string;
          user_id?: string;
          weight_kg: number;
        };
        Update: Partial<Database['public']['Tables']['body_weights']['Insert']>;
        Relationships: [];
      };
      favorite_foods: {
        Row: {
          brand: string | null;
          carbs_per_100g: number;
          created_at: string;
          fat_per_100g: number;
          food_key: string;
          food_name: string;
          kcal_per_100g: number;
          protein_per_100g: number;
          quantity: number;
          serving_grams: number | null;
          serving_label: string | null;
          servings: Json;
          source: string;
          source_id: string | null;
          unit: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          brand?: string | null;
          carbs_per_100g: number;
          created_at?: string;
          fat_per_100g: number;
          food_key: string;
          food_name: string;
          kcal_per_100g: number;
          protein_per_100g: number;
          quantity: number;
          serving_grams?: number | null;
          serving_label?: string | null;
          servings?: Json;
          source: string;
          source_id?: string | null;
          unit: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database['public']['Tables']['favorite_foods']['Insert']>;
        Relationships: [];
      };
      food_entries: {
        Row: {
          brand: string | null;
          carbs_per_100g: number;
          created_at: string;
          entry_date: string;
          fat_per_100g: number;
          food_name: string;
          grams: number;
          id: string;
          kcal_per_100g: number;
          meal: string;
          protein_per_100g: number;
          quantity: number;
          serving_grams: number | null;
          serving_label: string | null;
          servings: Json;
          source: string;
          source_id: string | null;
          unit: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          brand?: string | null;
          carbs_per_100g: number;
          created_at?: string;
          entry_date: string;
          fat_per_100g: number;
          food_name: string;
          grams: number;
          id: string;
          kcal_per_100g: number;
          meal: string;
          protein_per_100g: number;
          quantity: number;
          serving_grams?: number | null;
          serving_label?: string | null;
          servings?: Json;
          source: string;
          source_id?: string | null;
          unit: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database['public']['Tables']['food_entries']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          activity_level: string | null;
          age: number | null;
          created_at: string;
          goal: string | null;
          height_cm: number | null;
          id: string;
          sex: string | null;
          target_calories: number | null;
          target_carbs_g: number | null;
          target_fat_g: number | null;
          target_protein_g: number | null;
          timezone: string;
          unit_system: string;
          updated_at: string;
          weight_kg: number | null;
        };
        Insert: {
          activity_level?: string | null;
          age?: number | null;
          created_at?: string;
          goal?: string | null;
          height_cm?: number | null;
          id: string;
          sex?: string | null;
          target_calories?: number | null;
          target_carbs_g?: number | null;
          target_fat_g?: number | null;
          target_protein_g?: number | null;
          timezone?: string;
          unit_system?: string;
          updated_at?: string;
          weight_kg?: number | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      mcp_rate_hit: { Args: { p_user_id: string; p_limit: number }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
