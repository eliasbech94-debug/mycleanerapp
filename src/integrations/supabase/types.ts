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
      admin_audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          booking_id: string | null
          created_at: string
          currency: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          new_state: Json | null
          previous_state: Json | null
          refund_amount: number | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_state?: Json | null
          previous_state?: Json | null
          refund_amount?: number | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          new_state?: Json | null
          previous_state?: Json | null
          refund_amount?: number | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      booking_cancellations: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          booking_id: string
          created_at: string
          currency: string
          id: string
          policy_snapshot: Json
          reason_code: string
          reason_note: string | null
          refund_amount: number
          refund_type: string
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          currency: string
          id?: string
          policy_snapshot?: Json
          reason_code: string
          reason_note?: string | null
          refund_amount?: number
          refund_type?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          policy_snapshot?: Json
          reason_code?: string
          reason_note?: string | null
          refund_amount?: number
          refund_type?: string
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_cancellations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address: string
          address_place_id: string | null
          authorization_expires_at: string | null
          booking_date: string
          cancellation_policy_snapshot: Json
          cancellation_reason_code: string | null
          cancelled_at: string | null
          cancelled_by_role: string | null
          cancelled_by_user_id: string | null
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
          cancellation_policy_snapshot?: Json
          cancellation_reason_code?: string | null
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          cancelled_by_user_id?: string | null
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
          cancellation_policy_snapshot?: Json
          cancellation_reason_code?: string | null
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          cancelled_by_user_id?: string | null
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
      cleaning_plans: {
        Row: {
          address_id: string | null
          booking_id: string | null
          created_at: string
          focus_areas: string[]
          id: string
          notes: string
          rooms: Json
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_id?: string | null
          booking_id?: string | null
          created_at?: string
          focus_areas?: string[]
          id?: string
          notes?: string
          rooms?: Json
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_id?: string | null
          booking_id?: string | null
          created_at?: string
          focus_areas?: string[]
          id?: string
          notes?: string
          rooms?: Json
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_plans_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_plans_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          access_code: string | null
          access_instructions: string | null
          access_method: Database["public"]["Enums"]["address_access_method"]
          address: string
          address_country_code: string | null
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
          address_country_code?: string | null
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
          address_country_code?: string | null
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
      finance_payouts: {
        Row: {
          arrival_date: string | null
          booking_id: string | null
          created_at: string
          currency: string
          description: string | null
          gross_amount: number
          id: string
          metadata: Json
          net_amount: number
          platform_fee_amount: number
          provider_id: string | null
          provider_user_id: string
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          arrival_date?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          gross_amount?: number
          id?: string
          metadata?: Json
          net_amount?: number
          platform_fee_amount?: number
          provider_id?: string | null
          provider_user_id: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          arrival_date?: string | null
          booking_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          gross_amount?: number
          id?: string
          metadata?: Json
          net_amount?: number
          platform_fee_amount?: number
          provider_id?: string | null
          provider_user_id?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payouts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_alerts: {
        Row: {
          booking_id: string | null
          code: string
          created_at: string
          details: Json | null
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          code: string
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          code?: string
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_reconciliation_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "finance_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reconciliation_runs: {
        Row: {
          alerts_created: number
          bookings_scanned: number
          created_at: string
          id: string
          status: string
          summary: Json | null
          window_end: string
          window_start: string
        }
        Insert: {
          alerts_created?: number
          bookings_scanned?: number
          created_at?: string
          id?: string
          status?: string
          summary?: Json | null
          window_end: string
          window_start: string
        }
        Update: {
          alerts_created?: number
          bookings_scanned?: number
          created_at?: string
          id?: string
          status?: string
          summary?: Json | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      finance_settings: {
        Row: {
          country_code: string
          created_at: string
          currency: string
          id: string
          invoice_series_prefix: string | null
          notes: string | null
          platform_fee_pct: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          country_code: string
          created_at?: string
          currency: string
          id?: string
          invoice_series_prefix?: string | null
          notes?: string | null
          platform_fee_pct?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_series_prefix?: string | null
          notes?: string | null
          platform_fee_pct?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      finance_statements: {
        Row: {
          bookings_count: number
          created_at: string
          currency: string
          generated_at: string
          gross_total: number
          id: string
          metadata: Json
          net_total: number
          payouts_count: number
          period_end: string
          period_start: string
          platform_fee_total: number
          provider_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          bookings_count?: number
          created_at?: string
          currency?: string
          generated_at?: string
          gross_total?: number
          id?: string
          metadata?: Json
          net_total?: number
          payouts_count?: number
          period_end: string
          period_start: string
          platform_fee_total?: number
          provider_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          bookings_count?: number
          created_at?: string
          currency?: string
          generated_at?: string
          gross_total?: number
          id?: string
          metadata?: Json
          net_total?: number
          payouts_count?: number
          period_end?: string
          period_start?: string
          platform_fee_total?: number
          provider_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      notification_outbox: {
        Row: {
          attempts: number
          body: string | null
          channel: string
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json | null
          related_booking_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          channel: string
          created_at?: string
          dedupe_key: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          related_booking_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json | null
          related_booking_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      place_validations: {
        Row: {
          country_code: string
          formatted_address: string
          id: string
          lat: number | null
          lng: number | null
          place_id: string
          user_id: string
          validated_at: string
        }
        Insert: {
          country_code: string
          formatted_address: string
          id?: string
          lat?: number | null
          lng?: number | null
          place_id: string
          user_id: string
          validated_at?: string
        }
        Update: {
          country_code?: string
          formatted_address?: string
          id?: string
          lat?: number | null
          lng?: number | null
          place_id?: string
          user_id?: string
          validated_at?: string
        }
        Relationships: []
      }
      platform_credit_notes: {
        Row: {
          booking_id: string
          created_at: string
          credit_note_number: string
          currency: string
          id: string
          issued_at: string
          metadata: Json
          original_invoice_id: string
          pdf_storage_path: string | null
          platform_tax_snapshot: Json
          provider_tax_snapshot: Json
          provider_user_id: string
          refund_amount: number
          refund_type: string
          reversed_subtotal: number
          reversed_total: number
          reversed_vat_amount: number
          stripe_refund_id: string | null
          updated_at: string
          vat_rate: number
          vat_treatment: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          credit_note_number: string
          currency: string
          id?: string
          issued_at?: string
          metadata?: Json
          original_invoice_id: string
          pdf_storage_path?: string | null
          platform_tax_snapshot?: Json
          provider_tax_snapshot?: Json
          provider_user_id: string
          refund_amount: number
          refund_type: string
          reversed_subtotal: number
          reversed_total: number
          reversed_vat_amount?: number
          stripe_refund_id?: string | null
          updated_at?: string
          vat_rate?: number
          vat_treatment: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          credit_note_number?: string
          currency?: string
          id?: string
          issued_at?: string
          metadata?: Json
          original_invoice_id?: string
          pdf_storage_path?: string | null
          platform_tax_snapshot?: Json
          provider_tax_snapshot?: Json
          provider_user_id?: string
          refund_amount?: number
          refund_type?: string
          reversed_subtotal?: number
          reversed_total?: number
          reversed_vat_amount?: number
          stripe_refund_id?: string | null
          updated_at?: string
          vat_rate?: number
          vat_treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_credit_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_fee_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fee_invoices: {
        Row: {
          booking_id: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          metadata: Json
          pdf_storage_path: string | null
          platform_tax_snapshot: Json
          provider_tax_snapshot: Json
          provider_user_id: string
          status: string
          subtotal_amount: number
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          vat_treatment: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency: string
          id?: string
          invoice_number: string
          issued_at?: string
          metadata?: Json
          pdf_storage_path?: string | null
          platform_tax_snapshot?: Json
          provider_tax_snapshot?: Json
          provider_user_id: string
          status?: string
          subtotal_amount: number
          total_amount: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          vat_treatment?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          metadata?: Json
          pdf_storage_path?: string | null
          platform_tax_snapshot?: Json
          provider_tax_snapshot?: Json
          provider_user_id?: string
          status?: string
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          vat_treatment?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fee_invoices_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tax_settings: {
        Row: {
          country_code: string
          created_at: string
          id: string
          invoice_series_prefix: string
          legal_entity_address: string | null
          legal_entity_name: string
          next_invoice_number: number
          notes: string | null
          reverse_charge_eu: boolean
          tax_id: string | null
          updated_at: string
          vat_rate: number
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          invoice_series_prefix: string
          legal_entity_address?: string | null
          legal_entity_name?: string
          next_invoice_number?: number
          notes?: string | null
          reverse_charge_eu?: boolean
          tax_id?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          invoice_series_prefix?: string
          legal_entity_address?: string | null
          legal_entity_name?: string
          next_invoice_number?: number
          notes?: string | null
          reverse_charge_eu?: boolean
          tax_id?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          address_country_code: string | null
          address_place_id: string | null
          country_code: string | null
          created_at: string
          deactivated_at: string | null
          deactivation_reason: string | null
          encryption_version: number
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
          tax_id_enc: string | null
          tax_id_encrypted: string | null
          tax_id_last4: string | null
          tax_municipality: string | null
          tax_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_country_code?: string | null
          address_place_id?: string | null
          country_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          encryption_version?: number
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
          tax_id_enc?: string | null
          tax_id_encrypted?: string | null
          tax_id_last4?: string | null
          tax_municipality?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_country_code?: string | null
          address_place_id?: string | null
          country_code?: string | null
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          encryption_version?: number
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
          tax_id_enc?: string | null
          tax_id_encrypted?: string | null
          tax_id_last4?: string | null
          tax_municipality?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_receipts: {
        Row: {
          amount_cents: number | null
          booking_id: string | null
          category: string
          created_at: string
          currency: string | null
          file_path: string
          id: string
          mime: string | null
          notes: string | null
          quarter: number | null
          raw_ocr: Json | null
          receipt_date: string | null
          scan_status: string
          updated_at: string
          user_id: string
          vat_cents: number | null
          vendor: string | null
          year: number | null
        }
        Insert: {
          amount_cents?: number | null
          booking_id?: string | null
          category?: string
          created_at?: string
          currency?: string | null
          file_path: string
          id?: string
          mime?: string | null
          notes?: string | null
          quarter?: number | null
          raw_ocr?: Json | null
          receipt_date?: string | null
          scan_status?: string
          updated_at?: string
          user_id: string
          vat_cents?: number | null
          vendor?: string | null
          year?: number | null
        }
        Update: {
          amount_cents?: number | null
          booking_id?: string | null
          category?: string
          created_at?: string
          currency?: string | null
          file_path?: string
          id?: string
          mime?: string | null
          notes?: string | null
          quarter?: number | null
          raw_ocr?: Json | null
          receipt_date?: string | null
          scan_status?: string
          updated_at?: string
          user_id?: string
          vat_cents?: number | null
          vendor?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_receipts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_settlement_statements: {
        Row: {
          booking_id: string
          created_at: string
          currency: string
          customer_display_name: string | null
          gross_amount: number
          id: string
          issued_at: string
          linked_payout_id: string | null
          linked_transfer_id: string | null
          metadata: Json
          payout_status: string
          pdf_storage_path: string | null
          platform_fee_amount: number
          provider_net_amount: number
          provider_tax_snapshot: Json
          provider_user_id: string
          refund_amount: number
          service_address: string | null
          service_date: string | null
          statement_number: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency: string
          customer_display_name?: string | null
          gross_amount?: number
          id?: string
          issued_at?: string
          linked_payout_id?: string | null
          linked_transfer_id?: string | null
          metadata?: Json
          payout_status?: string
          pdf_storage_path?: string | null
          platform_fee_amount?: number
          provider_net_amount?: number
          provider_tax_snapshot?: Json
          provider_user_id: string
          refund_amount?: number
          service_address?: string | null
          service_date?: string | null
          statement_number: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency?: string
          customer_display_name?: string | null
          gross_amount?: number
          id?: string
          issued_at?: string
          linked_payout_id?: string | null
          linked_transfer_id?: string | null
          metadata?: Json
          payout_status?: string
          pdf_storage_path?: string | null
          platform_fee_amount?: number
          provider_net_amount?: number
          provider_tax_snapshot?: Json
          provider_user_id?: string
          refund_amount?: number
          service_address?: string | null
          service_date?: string | null
          statement_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_settlement_statements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_tax_profiles: {
        Row: {
          business_address: string | null
          business_address_enc: string | null
          business_name: string | null
          business_name_enc: string | null
          country_code: string
          created_at: string
          encryption_version: number
          id: string
          provider_type: string
          provider_user_id: string
          tax_id: string | null
          tax_id_enc: string | null
          tax_id_last4: string | null
          updated_at: string
          vat_number: string | null
          vat_number_enc: string | null
          vat_number_last4: string | null
          vat_registered: boolean
        }
        Insert: {
          business_address?: string | null
          business_address_enc?: string | null
          business_name?: string | null
          business_name_enc?: string | null
          country_code: string
          created_at?: string
          encryption_version?: number
          id?: string
          provider_type?: string
          provider_user_id: string
          tax_id?: string | null
          tax_id_enc?: string | null
          tax_id_last4?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_number_enc?: string | null
          vat_number_last4?: string | null
          vat_registered?: boolean
        }
        Update: {
          business_address?: string | null
          business_address_enc?: string | null
          business_name?: string | null
          business_name_enc?: string | null
          country_code?: string
          created_at?: string
          encryption_version?: number
          id?: string
          provider_type?: string
          provider_user_id?: string
          tax_id?: string | null
          tax_id_enc?: string | null
          tax_id_last4?: string | null
          updated_at?: string
          vat_number?: string | null
          vat_number_enc?: string | null
          vat_number_last4?: string | null
          vat_registered?: boolean
        }
        Relationships: []
      }
      refund_requests: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          booking_id: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          requested_amount: number
          response_snapshot: Json
          status: string
          stripe_error: string | null
          stripe_refund_id: string | null
          updated_at: string
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          booking_id: string
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          requested_amount: number
          response_snapshot?: Json
          status?: string
          stripe_error?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          requested_amount?: number
          response_snapshot?: Json
          status?: string
          stripe_error?: string | null
          stripe_refund_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
          related_booking_id: string | null
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
          related_booking_id?: string | null
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
          related_booking_id?: string | null
          status?: string
          subject?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_related_booking_id_fkey"
            columns: ["related_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      get_providers_in_bounds: {
        Args: { ne_lat: number; ne_lng: number; sw_lat: number; sw_lng: number }
        Returns: {
          address: string
          country_code: string
          full_name: string
          id: string
          is_business: boolean
          lat: number
          lng: number
          provider_id: string
        }[]
      }
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
      next_credit_note_number: {
        Args: { _country_code: string }
        Returns: string
      }
      next_invoice_number: { Args: { _country_code: string }; Returns: string }
      tax_decrypt: {
        Args: { _ciphertext: string; _key: string }
        Returns: string
      }
      tax_encrypt: {
        Args: { _key: string; _plaintext: string }
        Returns: string
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
