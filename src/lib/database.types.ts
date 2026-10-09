// Generated from the Supabase schema (helpers trimmed). Regenerate after migrations.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
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
          unit_system?: string;
          updated_at?: string;
          weight_kg?: number | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
