/**
 * Tipos de la DB para uso con @supabase/supabase-js. Se mantiene a mano hasta
 * que enchufemos el CLI de Supabase y usemos `supabase gen types typescript`.
 *
 * Si modificás `supabase/schema.sql`, actualizá este archivo en sincronía.
 *
 * Estructura esperada por postgrest-js:
 *   Tables[name] = { Row, Insert, Update, Relationships: [] }
 *   Views / Functions / Enums / CompositeTypes deben existir como Record-like.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      households: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          household_id: string;
          user_id: string;
          role: "owner" | "member";
          joined_at: string;
        };
        Insert: {
          household_id: string;
          user_id: string;
          role?: "owner" | "member";
          joined_at?: string;
        };
        Update: {
          household_id?: string;
          user_id?: string;
          role?: "owner" | "member";
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey";
            columns: ["household_id"];
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      locations: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          icon: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "locations_household_id_fkey";
            columns: ["household_id"];
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          brand: string | null;
          category: string | null;
          unit: string;
          quantity: number;
          low_stock_threshold: number;
          default_location_id: string | null;
          barcode: string | null;
          image_url: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          brand?: string | null;
          category?: string | null;
          unit?: string;
          quantity?: number;
          low_stock_threshold?: number;
          default_location_id?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          brand?: string | null;
          category?: string | null;
          unit?: string;
          quantity?: number;
          low_stock_threshold?: number;
          default_location_id?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey";
            columns: ["household_id"];
            referencedRelation: "households";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_default_location_id_fkey";
            columns: ["default_location_id"];
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      consumption_log: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          occurred_at: string;
          user_id: string | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity: number;
          occurred_at?: string;
          user_id?: string | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          occurred_at?: string;
          user_id?: string | null;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consumption_log_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTable<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTable<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Household = Tables<"households">;
export type HouseholdMember = Tables<"household_members">;
export type Location = Tables<"locations">;
export type Product = Tables<"products">;
export type ConsumptionLog = Tables<"consumption_log">;

export const UNITS = ["un", "kg", "g", "l", "ml", "paq"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  un: "unidades",
  kg: "kg",
  g: "gramos",
  l: "litros",
  ml: "ml",
  paq: "paquetes",
};
