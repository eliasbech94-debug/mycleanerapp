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
      access_attempts: {
        Row: {
          allowed_roles: string[]
          created_at: string
          email: string | null
          id: string
          reason: string | null
          referrer: string | null
          result: string
          route: string
          user_agent: string | null
          user_id: string | null
          user_roles: string[]
        }
        Insert: {
          allowed_roles?: string[]
          created_at?: string
          email?: string | null
          id?: string
          reason?: string | null
          referrer?: string | null
          result: string
          route: string
          user_agent?: string | null
          user_id?: string | null
          user_roles?: string[]
        }
        Update: {
          allowed_roles?: string[]
          created_at?: string
          email?: string | null
          id?: string
          reason?: string | null
          referrer?: string | null
          result?: string
          route?: string
          user_agent?: string | null
          user_id?: string | null
          user_roles?: string[]
        }
        Relationships: []
      }
      bookings: {
        Row: {
          address: string
          address_place_id: string | null
          authorization_expires_at: string | null
          booking_date: string
          created_at: string
          currency: string
          customer_pays: number
          customer_user_id: string
          decided_at: string | null
          hours: number
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          payment_intent_id: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          platform_fee_amount: number
          provider_gets: number
          provider_id: string
          provider_name: string
          provider_stripe_account_id: string | null
          refund_amount: number | null
          refund_id: string | null
          refund_reason: string | null
          refunded_at: string | null
          refunds: Json
          service: string
          slot: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          address: string
          address_place_id?: string | null
          authorization_expires_at?: string | null
          booking_date: string
          created_at?: string
          currency?: string
          customer_pays: number
          customer_user_id: string
          decided_at?: string | null
          hours: number
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          payment_intent_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_fee_amount?: number
          provider_gets: number
          provider_id: string
          provider_name: string
          provider_stripe_account_id?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunds?: Json
          service: string
          slot: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          address_place_id?: string | null
          authorization_expires_at?: string | null
          booking_date?: string
          created_at?: string
          currency?: string
          customer_pays?: number
          customer_user_id?: string
          decided_at?: string | null
          hours?: number
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          payment_intent_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_fee_amount?: number
          provider_gets?: number
          provider_id?: string
          provider_name?: string
          provider_stripe_account_id?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunds?: Json
          service?: string
          slot?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          access_code: string | null
          access_instructions: string | null
          access_method: Database["public"]["Enums"]["address_access_method"]
          address: string
          address_place_id: string | null
          cleaning_supplies_available: boolean
          created_at: string
          floor: string | null
          has_children: boolean
          has_pets: boolean
          id: string
          is_primary: boolean
          label: string
          lat: number | null
          lng: number | null
          notes: string | null
          parking_info: string | null
          pet_details: string | null
          place_type: Database["public"]["Enums"]["address_place_type"]
          rooms: number | null
          size_sqm: number | null
          updated_at: string
          user_id: string
          wifi_name: string | null
          wifi_password: string | null
        }
        Insert: {
          access_code?: string | null
          access_instructions?: string | null
          access_method?: Database["public"]["Enums"]["address_access_method"]
          address: string
          address_place_id?: string | null
          cleaning_supplies_available?: boolean
          created_at?: string
          floor?: string | null
          has_children?: boolean
          has_pets?: boolean
          id?: string
          is_primary?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          parking_info?: string | null
          pet_details?: string | null
          place_type?: Database["public"]["Enums"]["address_place_type"]
          rooms?: number | null
          size_sqm?: number | null
          updated_at?: string
          user_id: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Update: {
          access_code?: string | null
          access_instructions?: string | null
          access_method?: Database["public"]["Enums"]["address_access_method"]
          address?: string
          address_place_id?: string | null
          cleaning_supplies_available?: boolean
          created_at?: string
          floor?: string | null
          has_children?: boolean
          has_pets?: boolean
          id?: string
          is_primary?: boolean
          label?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          parking_info?: string | null
          pet_details?: string | null
          place_type?: Database["public"]["Enums"]["address_place_type"]
          rooms?: number | null
          size_sqm?: number | null
          updated_at?: string
          user_id?: string
          wifi_name?: string | null
          wifi_password?: string | null
        }
        Relationships: []
      }
      customer_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          body: string
          created_at: string
          dedupe_key: string | null
          dismissed_at: string | null
          id: string
          kind: string
          read_at: string | null
          related_booking_id: string | null
          related_thread_id: string | null
          severity: string
          title: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          dismissed_at?: string | null
          id?: string
          kind: string
          read_at?: string | null
          related_booking_id?: string | null
          related_thread_id?: string | null
          severity?: string
          title: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          body?: string
          created_at?: string
          dedupe_key?: string | null
          dismissed_at?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          related_booking_id?: string | null
          related_thread_id?: string | null
          severity?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notifications_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notifications_related_thread_id_fkey"
            columns: ["related_thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      market_rate_thresholds: {
        Row: {
          country_code: string
          currency: string
          max_hourly_rate: number
          min_hourly_rate: number
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country_code: string
          currency: string
          max_hourly_rate: number
          min_hourly_rate: number
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country_code?: string
          currency?: string
          max_hourly_rate?: number
          min_hourly_rate?: number
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          address_place_id: string | null
          country_code: string | null
          created_at: string
          deactivated_at: string | null
          deactivation_reason: string | null
          full_name: string | null
          id: string
          lat: number | null
          lng: number | null
          notification_prefs: Json
          phone: string | null
          provider_id: string | null
          sms_phone: string | null
          sms_verified_at: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_onboarded: boolean
          stripe_payouts_enabled: boolean
          tax_id_encrypted: string | null
          tax_municipality: string | null
          tax_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_place_id?: string | null
          country_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          full_name?: string | null
          id: string
          lat?: number | null
          lng?: number | null
          notification_prefs?: Json
          phone?: string | null
          provider_id?: string | null
          sms_phone?: string | null
          sms_verified_at?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_onboarded?: boolean
          stripe_payouts_enabled?: boolean
          tax_id_encrypted?: string | null
          tax_municipality?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_place_id?: string | null
          country_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          full_name?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          notification_prefs?: Json
          phone?: string | null
          provider_id?: string | null
          sms_phone?: string | null
          sms_verified_at?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_onboarded?: boolean
          stripe_payouts_enabled?: boolean
          tax_id_encrypted?: string | null
          tax_municipality?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sms_verifications: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          amount: number | null
          booking_id: string | null
          charge_id: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          livemode: boolean
          payload: Json
          payment_intent_id: string | null
          payout_id: string | null
          processed_at: string
          refund_id: string | null
          status: string | null
          stripe_event_id: string
          transfer_id: string | null
        }
        Insert: {
          amount?: number | null
          booking_id?: string | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          livemode?: boolean
          payload: Json
          payment_intent_id?: string | null
          payout_id?: string | null
          processed_at?: string
          refund_id?: string | null
          status?: string | null
          stripe_event_id: string
          transfer_id?: string | null
        }
        Update: {
          amount?: number | null
          booking_id?: string | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          livemode?: boolean
          payload?: Json
          payment_intent_id?: string | null
          payout_id?: string | null
          processed_at?: string
          refund_id?: string | null
          status?: string | null
          stripe_event_id?: string
          transfer_id?: string | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          parts: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          parts?: Json | null
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parts?: Json | null
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          status: string
          subject: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          subject?: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_owns_provider: { Args: { _provider_id: string }; Returns: boolean }
    }
    Enums: {
      address_access_method:
        | "home"
        | "key_box"
        | "key_under_mat"
        | "doorman"
        | "code"
        | "other"
      address_place_type: "private" | "business" | "vacation" | "other"
      app_role: "admin" | "employee" | "provider" | "customer" | "super_admin"
      booking_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "completed"
      payment_status:
        | "none"
        | "authorized"
        | "captured"
        | "canceled"
        | "failed"
        | "expired"
        | "refunded"
        | "partially_refunded"
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
    Enums: {
      address_access_method: [
        "home",
        "key_box",
        "key_under_mat",
        "doorman",
        "code",
        "other",
      ],
      address_place_type: ["private", "business", "vacation", "other"],
      app_role: ["admin", "employee", "provider", "customer", "super_admin"],
      booking_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "completed",
      ],
      payment_status: [
        "none",
        "authorized",
        "captured",
        "canceled",
        "failed",
        "expired",
        "refunded",
        "partially_refunded",
      ],
    },
  },
} as const
