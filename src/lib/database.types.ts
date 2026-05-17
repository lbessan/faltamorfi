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
          kind: LocationKind;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          icon?: string | null;
          kind?: LocationKind;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          icon?: string | null;
          kind?: LocationKind;
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
          category: string | null;
          unit: string;
          quantity: number;
          low_stock_threshold: number;
          default_location_id: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          category?: string | null;
          unit?: string;
          quantity?: number;
          low_stock_threshold?: number;
          default_location_id?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          name?: string;
          category?: string | null;
          unit?: string;
          quantity?: number;
          low_stock_threshold?: number;
          default_location_id?: string | null;
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
      stock_items: {
        Row: {
          id: string;
          product_id: string;
          location_id: string | null;
          quantity: number;
          expires_on: string | null;
          frozen_at: string | null;
          frozen_max_days: number | null;
          brand: string | null;
          barcode: string | null;
          image_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          location_id?: string | null;
          quantity: number;
          expires_on?: string | null;
          frozen_at?: string | null;
          frozen_max_days?: number | null;
          brand?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          location_id?: string | null;
          quantity?: number;
          expires_on?: string | null;
          frozen_at?: string | null;
          frozen_max_days?: number | null;
          brand?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stock_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_items_location_id_fkey";
            columns: ["location_id"];
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          user_id: string;
          default_expiry_warning_days: number;
          notifications_enabled: boolean;
          push_subscription: Json | null;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          default_expiry_warning_days?: number;
          notifications_enabled?: boolean;
          push_subscription?: Json | null;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          default_expiry_warning_days?: number;
          notifications_enabled?: boolean;
          push_subscription?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      consume_from_lots: {
        Args: { target_product_id: string; amount: number };
        Returns: number;
      };
    };
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
export type StockItem = Tables<"stock_items">;
export type UserPreferences = Tables<"user_preferences">;

export const LOCATION_KINDS = [
  "general",
  "pantry",
  "fridge",
  "freezer",
  "medicine",
  "cleaning",
  "other",
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  general: "General",
  pantry: "Alacena",
  fridge: "Heladera",
  freezer: "Freezer",
  medicine: "Botiquín",
  cleaning: "Limpieza",
  other: "Otro",
};

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
