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
      account_deletion_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          deactivated_at: string | null
          id: string
          legal_hold_id: string | null
          reason: string | null
          rejection_legal_reason: string | null
          requested_ip: string | null
          requested_ua: string | null
          reviewer_notes: string | null
          reviewer_user_id: string | null
          scheduled_delete_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          legal_hold_id?: string | null
          reason?: string | null
          rejection_legal_reason?: string | null
          requested_ip?: string | null
          requested_ua?: string | null
          reviewer_notes?: string | null
          reviewer_user_id?: string | null
          scheduled_delete_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deactivated_at?: string | null
          id?: string
          legal_hold_id?: string | null
          reason?: string | null
          rejection_legal_reason?: string | null
          requested_ip?: string | null
          requested_ua?: string | null
          reviewer_notes?: string | null
          reviewer_user_id?: string | null
          scheduled_delete_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
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
      admin_country_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          iso: string
          locked_by: string
          locked_by_email: string | null
        }
        Insert: {
          acquired_at?: string
          expires_at?: string
          iso: string
          locked_by: string
          locked_by_email?: string | null
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          iso?: string
          locked_by?: string
          locked_by_email?: string | null
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
          booking_rules_snapshot: Json | null
          cancellation_policy_snapshot: Json
          cancellation_reason_code: string | null
          cancelled_at: string | null
          cancelled_by_role: string | null
          cancelled_by_user_id: string | null
          commission_config_snapshot: Json | null
          country_code: string | null
          country_config_version: number | null
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
          tax_config_snapshot: Json | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address: string
          address_place_id?: string | null
          authorization_expires_at?: string | null
          booking_date: string
          booking_rules_snapshot?: Json | null
          cancellation_policy_snapshot?: Json
          cancellation_reason_code?: string | null
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          cancelled_by_user_id?: string | null
          commission_config_snapshot?: Json | null
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_snapshot?: Json | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          address_place_id?: string | null
          authorization_expires_at?: string | null
          booking_date?: string
          booking_rules_snapshot?: Json | null
          cancellation_policy_snapshot?: Json
          cancellation_reason_code?: string | null
          cancelled_at?: string | null
          cancelled_by_role?: string | null
          cancelled_by_user_id?: string | null
          commission_config_snapshot?: Json | null
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_snapshot?: Json | null
          timezone?: string | null
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
      consent_ledger: {
        Row: {
          consent_type: string
          country_code: string | null
          created_at: string
          granted: boolean
          id: string
          ip_address: string | null
          policy_version: string
          source: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consent_type: string
          country_code?: string | null
          created_at?: string
          granted: boolean
          id?: string
          ip_address?: string | null
          policy_version: string
          source?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consent_type?: string
          country_code?: string | null
          created_at?: string
          granted?: boolean
          id?: string
          ip_address?: string | null
          policy_version?: string
          source?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversation_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          archived_at: string | null
          conversation_id: string
          joined_at: string
          left_at: string | null
          muted_at: string | null
          participant_role: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          joined_at?: string
          left_at?: string | null
          muted_at?: string | null
          participant_role: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          joined_at?: string
          left_at?: string | null
          muted_at?: string | null
          participant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          last_read_message_id: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tag_assignments: {
        Row: {
          assigned_by: string | null
          conversation_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          assigned_by?: string | null
          conversation_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          assigned_by?: string | null
          conversation_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tag_assignments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "conversation_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_summary: string | null
          assigned_support_id: string | null
          booking_id: string | null
          closed_at: string | null
          closed_by: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          customer_user_id: string | null
          id: string
          kind: string
          last_ai_summary_at: string | null
          last_message_at: string | null
          last_message_id: string | null
          priority: string
          provider_user_id: string | null
          status: string
          subject: string | null
          support_case_id: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          assigned_support_id?: string | null
          booking_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_user_id?: string | null
          id?: string
          kind: string
          last_ai_summary_at?: string | null
          last_message_at?: string | null
          last_message_id?: string | null
          priority?: string
          provider_user_id?: string | null
          status?: string
          subject?: string | null
          support_case_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          assigned_support_id?: string | null
          booking_id?: string | null
          closed_at?: string | null
          closed_by?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          customer_user_id?: string | null
          id?: string
          kind?: string
          last_ai_summary_at?: string | null
          last_message_at?: string | null
          last_message_id?: string | null
          priority?: string
          provider_user_id?: string | null
          status?: string
          subject?: string | null
          support_case_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      country_config_versions: {
        Row: {
          change_summary: string | null
          config_version: number
          id: string
          iso: string
          published_at: string
          published_by: string | null
          snapshot: Json
          superseded_at: string | null
          validation_result: Json | null
        }
        Insert: {
          change_summary?: string | null
          config_version: number
          id?: string
          iso: string
          published_at?: string
          published_by?: string | null
          snapshot: Json
          superseded_at?: string | null
          validation_result?: Json | null
        }
        Update: {
          change_summary?: string | null
          config_version?: number
          id?: string
          iso?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          superseded_at?: string | null
          validation_result?: Json | null
        }
        Relationships: []
      }
      country_configs: {
        Row: {
          active: boolean
          booking_rules: Json
          commission_bps: number
          config: Json
          config_version: number
          created_at: string
          currency: string
          default_language: string
          iso: string
          launch_status: string
          lifecycle_state: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules: Json
          published_at: string | null
          published_by: string | null
          status: string
          stripe_account_id: string | null
          supported_languages: string[]
          timezone: string
          updated_at: string
          vat_rate_bps: number
        }
        Insert: {
          active?: boolean
          booking_rules?: Json
          commission_bps?: number
          config?: Json
          config_version?: number
          created_at?: string
          currency: string
          default_language: string
          iso: string
          launch_status?: string
          lifecycle_state?: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules?: Json
          published_at?: string | null
          published_by?: string | null
          status?: string
          stripe_account_id?: string | null
          supported_languages?: string[]
          timezone: string
          updated_at?: string
          vat_rate_bps?: number
        }
        Update: {
          active?: boolean
          booking_rules?: Json
          commission_bps?: number
          config?: Json
          config_version?: number
          created_at?: string
          currency?: string
          default_language?: string
          iso?: string
          launch_status?: string
          lifecycle_state?: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules?: Json
          published_at?: string | null
          published_by?: string | null
          status?: string
          stripe_account_id?: string | null
          supported_languages?: string[]
          timezone?: string
          updated_at?: string
          vat_rate_bps?: number
        }
        Relationships: []
      }
      country_holidays: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          holiday_date: string
          id: string
          name: string
          region: string | null
          source: string
          surcharge_eligible: boolean
          updated_at: string
          year: number | null
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          region?: string | null
          source?: string
          surcharge_eligible?: boolean
          updated_at?: string
          year?: number | null
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          region?: string | null
          source?: string
          surcharge_eligible?: boolean
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      country_readiness_runs: {
        Row: {
          actor: string | null
          actor_kind: string
          checks: Json
          config_version: number
          deployment_version: string | null
          id: string
          iso: string
          passed: boolean
          ran_at: string
        }
        Insert: {
          actor?: string | null
          actor_kind?: string
          checks?: Json
          config_version: number
          deployment_version?: string | null
          id?: string
          iso: string
          passed: boolean
          ran_at?: string
        }
        Update: {
          actor?: string | null
          actor_kind?: string
          checks?: Json
          config_version?: number
          deployment_version?: string | null
          id?: string
          iso?: string
          passed?: boolean
          ran_at?: string
        }
        Relationships: []
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
      customer_preferences: {
        Row: {
          created_at: string
          floors: string | null
          has_garden: boolean
          has_pets: boolean
          notes: string | null
          preferred_days: string[]
          preferred_time: string | null
          property_size_sqm: number | null
          property_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          floors?: string | null
          has_garden?: boolean
          has_pets?: boolean
          notes?: string | null
          preferred_days?: string[]
          preferred_time?: string | null
          property_size_sqm?: number | null
          property_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          floors?: string | null
          has_garden?: boolean
          has_pets?: boolean
          notes?: string | null
          preferred_days?: string[]
          preferred_time?: string | null
          property_size_sqm?: number | null
          property_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      data_retention_policies: {
        Row: {
          action: string
          created_at: string
          description: string | null
          dry_run: boolean
          enabled: boolean
          id: string
          notes: string | null
          record_type: string
          respects_legal_hold: boolean
          retention_days: number
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          description?: string | null
          dry_run?: boolean
          enabled?: boolean
          id?: string
          notes?: string | null
          record_type: string
          respects_legal_hold?: boolean
          retention_days: number
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          dry_run?: boolean
          enabled?: boolean
          id?: string
          notes?: string | null
          record_type?: string
          respects_legal_hold?: boolean
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      deployments: {
        Row: {
          commit_sha: string | null
          deployed_at: string
          edge_versions: Json
          environment: string
          id: string
          migration_version: string | null
          notes: string | null
          release: string
          rolled_back_from: string | null
          status: string
        }
        Insert: {
          commit_sha?: string | null
          deployed_at?: string
          edge_versions?: Json
          environment?: string
          id?: string
          migration_version?: string | null
          notes?: string | null
          release: string
          rolled_back_from?: string | null
          status?: string
        }
        Update: {
          commit_sha?: string | null
          deployed_at?: string
          edge_versions?: Json
          environment?: string
          id?: string
          migration_version?: string | null
          notes?: string | null
          release?: string
          rolled_back_from?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_rolled_back_from_fkey"
            columns: ["rolled_back_from"]
            isOneToOne: false
            referencedRelation: "deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_alerts: {
        Row: {
          code: string
          created_at: string
          details: Json
          dispute_id: string | null
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          code: string
          created_at?: string
          details?: Json
          dispute_id?: string | null
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          code?: string
          created_at?: string
          details?: Json
          dispute_id?: string | null
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_alerts_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "stripe_disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          content_type: string | null
          created_at: string
          dispute_id: string
          file_name: string | null
          file_size: number | null
          id: string
          kind: string
          note: string | null
          storage_path: string | null
          stripe_field: string | null
          submitted_by: string | null
          submitted_to_stripe_at: string | null
          uploaded_by: string
          uploader_role: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          dispute_id: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind: string
          note?: string | null
          storage_path?: string | null
          stripe_field?: string | null
          submitted_by?: string | null
          submitted_to_stripe_at?: string | null
          uploaded_by: string
          uploader_role: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          dispute_id?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          kind?: string
          note?: string | null
          storage_path?: string | null
          stripe_field?: string | null
          submitted_by?: string | null
          submitted_to_stripe_at?: string | null
          uploaded_by?: string
          uploader_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "stripe_disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      error_events: {
        Row: {
          booking_id: string | null
          correlation_id: string | null
          dispute_id: string | null
          duration_ms: number | null
          environment: string | null
          error_category: string | null
          function_name: string | null
          id: string
          ip_address: string | null
          job_id: string | null
          level: string
          message: string
          metadata: Json
          occurred_at: string
          payment_id: string | null
          release: string | null
          request_id: string | null
          route: string | null
          source: string
          stack: string | null
          status_code: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          correlation_id?: string | null
          dispute_id?: string | null
          duration_ms?: number | null
          environment?: string | null
          error_category?: string | null
          function_name?: string | null
          id?: string
          ip_address?: string | null
          job_id?: string | null
          level?: string
          message: string
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          release?: string | null
          request_id?: string | null
          route?: string | null
          source: string
          stack?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          correlation_id?: string | null
          dispute_id?: string | null
          duration_ms?: number | null
          environment?: string | null
          error_category?: string | null
          function_name?: string | null
          id?: string
          ip_address?: string | null
          job_id?: string | null
          level?: string
          message?: string
          metadata?: Json
          occurred_at?: string
          payment_id?: string | null
          release?: string | null
          request_id?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          status_code?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_key: string
          id: string
          reason: string | null
          rollout_pct: number
          rollout_seed: string | null
          scope: string
          target_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_key: string
          id?: string
          reason?: string | null
          rollout_pct?: number
          rollout_seed?: string | null
          scope: string
          target_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          reason?: string | null
          rollout_pct?: number
          rollout_seed?: string | null
          scope?: string
          target_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      gdpr_export_jobs: {
        Row: {
          created_at: string
          download_count: number
          downloaded_at: string | null
          error_message: string | null
          expires_at: string | null
          file_bytes: number | null
          format: string
          id: string
          ready_at: string | null
          requested_ip: string | null
          requested_ua: string | null
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          downloaded_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_bytes?: number | null
          format?: string
          id?: string
          ready_at?: string | null
          requested_ip?: string | null
          requested_ua?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          download_count?: number
          downloaded_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          file_bytes?: number | null
          format?: string
          id?: string
          ready_at?: string | null
          requested_ip?: string | null
          requested_ua?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      identity_account_links: {
        Row: {
          id: string
          identity_id: string
          link_reason: Database["public"]["Enums"]["identity_link_reason"]
          linked_at: string
          linked_by: string | null
          user_id: string
        }
        Insert: {
          id?: string
          identity_id: string
          link_reason?: Database["public"]["Enums"]["identity_link_reason"]
          linked_at?: string
          linked_by?: string | null
          user_id: string
        }
        Update: {
          id?: string
          identity_id?: string
          link_reason?: Database["public"]["Enums"]["identity_link_reason"]
          linked_at?: string
          linked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_account_links_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "person_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verification_attempts: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          identity_id: string
          level: Database["public"]["Enums"]["identity_level"] | null
          provider: string
          provider_applicant_id: string | null
          review_summary: Json
          started_at: string
          status: Database["public"]["Enums"]["identity_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          identity_id: string
          level?: Database["public"]["Enums"]["identity_level"] | null
          provider?: string
          provider_applicant_id?: string | null
          review_summary?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["identity_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          identity_id?: string
          level?: Database["public"]["Enums"]["identity_level"] | null
          provider?: string
          provider_applicant_id?: string | null
          review_summary?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["identity_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_verification_attempts_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "person_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string | null
          id: string
          payload_hash: string
          processed_at: string | null
          provider: string
          received_at: string
          result: Database["public"]["Enums"]["identity_webhook_result"]
          signature_ok: boolean
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          payload_hash: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          result?: Database["public"]["Enums"]["identity_webhook_result"]
          signature_ok?: boolean
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          payload_hash?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          result?: Database["public"]["Enums"]["identity_webhook_result"]
          signature_ok?: boolean
        }
        Relationships: []
      }
      incident_timeline: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          incident_id: string
          kind: string
          message: string
          metadata: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          incident_id: string
          kind: string
          message: string
          metadata?: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          incident_id?: string
          kind?: string
          message?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "incident_timeline_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          follow_up_actions: string | null
          id: string
          linked_alert_ids: string[]
          linked_booking_ids: string[]
          linked_deployment_ids: string[]
          linked_payment_ids: string[]
          opened_at: string
          opened_by: string | null
          owner_user_id: string | null
          resolution: string | null
          resolved_at: string | null
          root_cause: string | null
          severity: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          follow_up_actions?: string | null
          id?: string
          linked_alert_ids?: string[]
          linked_booking_ids?: string[]
          linked_deployment_ids?: string[]
          linked_payment_ids?: string[]
          opened_at?: string
          opened_by?: string | null
          owner_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          follow_up_actions?: string | null
          id?: string
          linked_alert_ids?: string[]
          linked_booking_ids?: string[]
          linked_deployment_ids?: string[]
          linked_payment_ids?: string[]
          opened_at?: string
          opened_by?: string | null
          owner_user_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          root_cause?: string | null
          severity?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_runs: {
        Row: {
          correlation_id: string | null
          deployment_release: string | null
          duration_ms: number | null
          error_summary: string | null
          failed_count: number
          finished_at: string | null
          id: string
          job_name: string
          metadata: Json
          processed_count: number
          retry_count: number
          started_at: string
          status: string
          success_count: number
        }
        Insert: {
          correlation_id?: string | null
          deployment_release?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          job_name: string
          metadata?: Json
          processed_count?: number
          retry_count?: number
          started_at?: string
          status?: string
          success_count?: number
        }
        Update: {
          correlation_id?: string | null
          deployment_release?: string | null
          duration_ms?: number | null
          error_summary?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          job_name?: string
          metadata?: Json
          processed_count?: number
          retry_count?: number
          started_at?: string
          status?: string
          success_count?: number
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          body_hash: string
          body_md: string
          country_code: string
          created_at: string
          created_by: string | null
          effective_at: string | null
          fallback_to_english: boolean
          id: string
          kind: string
          language: string
          published_at: string | null
          required: boolean
          scheduled_publish_at: string | null
          status: string
          summary_md: string | null
          superseded_at: string | null
          title: string | null
          version: string
        }
        Insert: {
          body_hash: string
          body_md: string
          country_code: string
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          fallback_to_english?: boolean
          id?: string
          kind: string
          language: string
          published_at?: string | null
          required?: boolean
          scheduled_publish_at?: string | null
          status?: string
          summary_md?: string | null
          superseded_at?: string | null
          title?: string | null
          version: string
        }
        Update: {
          body_hash?: string
          body_md?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          effective_at?: string | null
          fallback_to_english?: boolean
          id?: string
          kind?: string
          language?: string
          published_at?: string | null
          required?: boolean
          scheduled_publish_at?: string | null
          status?: string
          summary_md?: string | null
          superseded_at?: string | null
          title?: string | null
          version?: string
        }
        Relationships: []
      }
      legal_holds: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          notes: string | null
          reason: string
          released_at: string | null
          released_by: string | null
          starts_at: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          notes?: string | null
          reason: string
          released_at?: string | null
          released_by?: string | null
          starts_at?: string
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
          released_at?: string | null
          released_by?: string | null
          starts_at?: string
          target_id?: string
          target_type?: string
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
      message_attachments: {
        Row: {
          created_at: string
          height: number | null
          id: string
          message_id: string
          mime_type: string
          original_filename: string | null
          size_bytes: number
          storage_path: string
          thumbnail_path: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          original_filename?: string | null
          size_bytes: number
          storage_path: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          original_filename?: string | null
          size_bytes?: number
          storage_path?: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_internal_note: boolean
          message_type: string
          reply_to_message_id: string | null
          sender_role: string
          sender_user_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal_note?: boolean
          message_type?: string
          reply_to_message_id?: string | null
          sender_role: string
          sender_user_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal_note?: boolean
          message_type?: string
          reply_to_message_id?: string | null
          sender_role?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      person_identities: {
        Row: {
          country_code: string | null
          created_at: string
          expires_at: string | null
          external_ref: string | null
          id: string
          last_review_at: string | null
          level: Database["public"]["Enums"]["identity_level"] | null
          metadata: Json
          provider: string
          risk_level: string | null
          status: Database["public"]["Enums"]["identity_status"]
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_ref?: string | null
          id?: string
          last_review_at?: string | null
          level?: Database["public"]["Enums"]["identity_level"] | null
          metadata?: Json
          provider?: string
          risk_level?: string | null
          status?: Database["public"]["Enums"]["identity_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_ref?: string | null
          id?: string
          last_review_at?: string | null
          level?: Database["public"]["Enums"]["identity_level"] | null
          metadata?: Json
          provider?: string
          risk_level?: string | null
          status?: Database["public"]["Enums"]["identity_status"]
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      place_validations: {
        Row: {
          apartment: string | null
          city: string | null
          country_code: string
          door: string | null
          entrance: string | null
          floor: string | null
          formatted_address: string
          house_number: string | null
          id: string
          lat: number | null
          letter: string | null
          lng: number | null
          municipality: string | null
          normalized_address: string | null
          place_id: string
          postal_code: string | null
          side: string | null
          source: string
          street: string | null
          user_id: string
          validated_at: string
        }
        Insert: {
          apartment?: string | null
          city?: string | null
          country_code: string
          door?: string | null
          entrance?: string | null
          floor?: string | null
          formatted_address: string
          house_number?: string | null
          id?: string
          lat?: number | null
          letter?: string | null
          lng?: number | null
          municipality?: string | null
          normalized_address?: string | null
          place_id: string
          postal_code?: string | null
          side?: string | null
          source?: string
          street?: string | null
          user_id: string
          validated_at?: string
        }
        Update: {
          apartment?: string | null
          city?: string | null
          country_code?: string
          door?: string | null
          entrance?: string | null
          floor?: string | null
          formatted_address?: string
          house_number?: string | null
          id?: string
          lat?: number | null
          letter?: string | null
          lng?: number | null
          municipality?: string | null
          normalized_address?: string | null
          place_id?: string
          postal_code?: string | null
          side?: string | null
          source?: string
          street?: string | null
          user_id?: string
          validated_at?: string
        }
        Relationships: []
      }
      platform_credit_notes: {
        Row: {
          booking_id: string
          country_code: string | null
          country_config_version: number | null
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
          tax_config_version: number | null
          updated_at: string
          vat_rate: number
          vat_treatment: string
        }
        Insert: {
          booking_id: string
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_version?: number | null
          updated_at?: string
          vat_rate?: number
          vat_treatment: string
        }
        Update: {
          booking_id?: string
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_version?: number | null
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
          country_code: string | null
          country_config_version: number | null
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
          tax_config_version: number | null
          total_amount: number
          updated_at: string
          vat_amount: number
          vat_rate: number
          vat_treatment: string
        }
        Insert: {
          booking_id: string
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_version?: number | null
          total_amount: number
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          vat_treatment?: string
        }
        Update: {
          booking_id?: string
          country_code?: string | null
          country_config_version?: number | null
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
          tax_config_version?: number | null
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
          country_manual: boolean
          created_at: string
          deactivated_at: string | null
          deactivation_reason: string | null
          encryption_version: number
          full_name: string | null
          id: string
          language_manual: boolean
          lat: number | null
          legal_acceptance_required: boolean
          lng: number | null
          marketplace_country: string | null
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
          ui_language: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_country_code?: string | null
          address_place_id?: string | null
          country_code?: string | null
          country_manual?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          encryption_version?: number
          full_name?: string | null
          id: string
          language_manual?: boolean
          lat?: number | null
          legal_acceptance_required?: boolean
          lng?: number | null
          marketplace_country?: string | null
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
          ui_language?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_country_code?: string | null
          address_place_id?: string | null
          country_code?: string | null
          country_manual?: boolean
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string | null
          encryption_version?: number
          full_name?: string | null
          id?: string
          language_manual?: boolean
          lat?: number | null
          legal_acceptance_required?: boolean
          lng?: number | null
          marketplace_country?: string | null
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
          ui_language?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_admin_actions: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["provider_status"] | null
          id: number
          idempotency_key: string | null
          metadata: Json
          reason: string | null
          to_status: Database["public"]["Enums"]["provider_status"] | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["provider_status"] | null
          id?: number
          idempotency_key?: string | null
          metadata?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["provider_status"] | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["provider_status"] | null
          id?: number
          idempotency_key?: string | null
          metadata?: Json
          reason?: string | null
          to_status?: Database["public"]["Enums"]["provider_status"] | null
          user_id?: string
        }
        Relationships: []
      }
      provider_profiles: {
        Row: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          base_address_formatted: string | null
          base_address_place_id: string | null
          base_country_code: string | null
          base_lat: number | null
          base_lng: number | null
          base_validation_source: string | null
          bio: string | null
          completion_pct: number
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          emergency_contact: Json | null
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          rejected_at: string | null
          rejected_reason: string | null
          scoring_config_version: number | null
          service_area_radius_km: number | null
          service_categories: string[]
          status: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_disabled_reason: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements_due: string[]
          submitted_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          terms_accepted_at: string | null
          tier_calculated_at: string | null
          tier_is_manual: boolean
          trust_flags: Json
          trust_score: number
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["provider_visibility"]
          years_experience: number | null
        }
        Insert: {
          activated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          base_address_formatted?: string | null
          base_address_place_id?: string | null
          base_country_code?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_validation_source?: string | null
          bio?: string | null
          completion_pct?: number
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          emergency_contact?: Json | null
          headline?: string | null
          hourly_rate?: number | null
          identity_status?: string
          insurance_doc_path?: string | null
          insurance_expires_on?: string | null
          insurance_policy_number?: string | null
          languages?: string[]
          payout_frozen?: boolean
          payout_frozen_reason?: string | null
          performance_snapshot?: Json
          photo_path?: string | null
          provider_score?: number
          provider_tier?: Database["public"]["Enums"]["provider_tier"]
          rejected_at?: string | null
          rejected_reason?: string | null
          scoring_config_version?: number | null
          service_area_radius_km?: number | null
          service_categories?: string[]
          status?: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_disabled_reason?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements_due?: string[]
          submitted_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          terms_accepted_at?: string | null
          tier_calculated_at?: string | null
          tier_is_manual?: boolean
          trust_flags?: Json
          trust_score?: number
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["provider_visibility"]
          years_experience?: number | null
        }
        Update: {
          activated_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          base_address_formatted?: string | null
          base_address_place_id?: string | null
          base_country_code?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_validation_source?: string | null
          bio?: string | null
          completion_pct?: number
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          emergency_contact?: Json | null
          headline?: string | null
          hourly_rate?: number | null
          identity_status?: string
          insurance_doc_path?: string | null
          insurance_expires_on?: string | null
          insurance_policy_number?: string | null
          languages?: string[]
          payout_frozen?: boolean
          payout_frozen_reason?: string | null
          performance_snapshot?: Json
          photo_path?: string | null
          provider_score?: number
          provider_tier?: Database["public"]["Enums"]["provider_tier"]
          rejected_at?: string | null
          rejected_reason?: string | null
          scoring_config_version?: number | null
          service_area_radius_km?: number | null
          service_categories?: string[]
          status?: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled?: boolean
          stripe_details_submitted?: boolean
          stripe_disabled_reason?: string | null
          stripe_payouts_enabled?: boolean
          stripe_requirements_due?: string[]
          submitted_at?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          terms_accepted_at?: string | null
          tier_calculated_at?: string | null
          tier_is_manual?: boolean
          trust_flags?: Json
          trust_score?: number
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["provider_visibility"]
          years_experience?: number | null
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
      provider_score_history: {
        Row: {
          breakdown: Json
          calculated_at: string
          id: number
          metrics_snapshot: Json
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          reason: string
          scoring_config_version: number
          trust_score: number | null
          user_id: string
        }
        Insert: {
          breakdown?: Json
          calculated_at?: string
          id?: number
          metrics_snapshot?: Json
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          reason: string
          scoring_config_version: number
          trust_score?: number | null
          user_id: string
        }
        Update: {
          breakdown?: Json
          calculated_at?: string
          id?: number
          metrics_snapshot?: Json
          provider_score?: number
          provider_tier?: Database["public"]["Enums"]["provider_tier"]
          reason?: string
          scoring_config_version?: number
          trust_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      provider_scoring_config: {
        Row: {
          config_version: number
          created_at: string
          created_by: string | null
          is_active: boolean
          normalizers: Json
          notes: string | null
          weights: Json
        }
        Insert: {
          config_version: number
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          normalizers: Json
          notes?: string | null
          weights: Json
        }
        Update: {
          config_version?: number
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          normalizers?: Json
          notes?: string | null
          weights?: Json
        }
        Relationships: []
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
      provider_tier_rules: {
        Row: {
          manual_only: boolean
          max_cancellation_rate: number | null
          min_completed: number
          min_completion_rate: number | null
          min_rating: number | null
          min_repeat_customer_rate: number | null
          notes: string | null
          priority: number
          require_email: boolean
          require_identity: boolean
          require_no_trust_flags: boolean
          require_phone: boolean
          require_stripe: boolean
          tier: Database["public"]["Enums"]["provider_tier"]
          updated_at: string
        }
        Insert: {
          manual_only?: boolean
          max_cancellation_rate?: number | null
          min_completed?: number
          min_completion_rate?: number | null
          min_rating?: number | null
          min_repeat_customer_rate?: number | null
          notes?: string | null
          priority: number
          require_email?: boolean
          require_identity?: boolean
          require_no_trust_flags?: boolean
          require_phone?: boolean
          require_stripe?: boolean
          tier: Database["public"]["Enums"]["provider_tier"]
          updated_at?: string
        }
        Update: {
          manual_only?: boolean
          max_cancellation_rate?: number | null
          min_completed?: number
          min_completion_rate?: number | null
          min_rating?: number | null
          min_repeat_customer_rate?: number | null
          notes?: string | null
          priority?: number
          require_email?: boolean
          require_identity?: boolean
          require_no_trust_flags?: boolean
          require_phone?: boolean
          require_stripe?: boolean
          tier?: Database["public"]["Enums"]["provider_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      provider_trust_config: {
        Row: {
          config_version: number
          created_at: string
          created_by: string | null
          is_active: boolean
          notes: string | null
          thresholds: Json
          weights: Json
        }
        Insert: {
          config_version: number
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          notes?: string | null
          thresholds: Json
          weights: Json
        }
        Update: {
          config_version?: number
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          notes?: string | null
          thresholds?: Json
          weights?: Json
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
      refund_requests_v2: {
        Row: {
          booking_id: string | null
          conversation_id: string
          created_at: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          execution_ref: string | null
          id: string
          reason: string
          requested_amount: number
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          conversation_id: string
          created_at?: string
          currency: string
          decided_at?: string | null
          decided_by?: string | null
          execution_ref?: string | null
          id?: string
          reason: string
          requested_amount: number
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          conversation_id?: string
          created_at?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          execution_ref?: string | null
          id?: string
          reason?: string
          requested_amount?: number
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_v2_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_v2_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_worker_runs: {
        Row: {
          affected_counts: Json
          dry_run: boolean
          error_message: string | null
          finished_at: string | null
          id: string
          report: Json
          started_at: string
          status: string
        }
        Insert: {
          affected_counts?: Json
          dry_run?: boolean
          error_message?: string | null
          finished_at?: string | null
          id?: string
          report?: Json
          started_at?: string
          status?: string
        }
        Update: {
          affected_counts?: Json
          dry_run?: boolean
          error_message?: string | null
          finished_at?: string | null
          id?: string
          report?: Json
          started_at?: string
          status?: string
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
      stripe_disputes: {
        Row: {
          amount: number
          booking_id: string | null
          closed_at: string | null
          created_at: string
          currency: string
          customer_user_id: string | null
          evidence_due_by: string | null
          funds_reinstated_at: string | null
          funds_withdrawn_at: string | null
          has_evidence: boolean
          id: string
          is_charge_refundable: boolean | null
          last_event_at: string | null
          livemode: boolean
          metadata: Json
          outcome: string | null
          provider_id: string | null
          provider_user_id: string | null
          reason: string | null
          status: string
          stripe_charge_id: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id: string | null
          submission_count: number
          updated_at: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_user_id?: string | null
          evidence_due_by?: string | null
          funds_reinstated_at?: string | null
          funds_withdrawn_at?: string | null
          has_evidence?: boolean
          id?: string
          is_charge_refundable?: boolean | null
          last_event_at?: string | null
          livemode?: boolean
          metadata?: Json
          outcome?: string | null
          provider_id?: string | null
          provider_user_id?: string | null
          reason?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_dispute_id: string
          stripe_payment_intent_id?: string | null
          submission_count?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_user_id?: string | null
          evidence_due_by?: string | null
          funds_reinstated_at?: string | null
          funds_withdrawn_at?: string | null
          has_evidence?: boolean
          id?: string
          is_charge_refundable?: boolean | null
          last_event_at?: string | null
          livemode?: boolean
          metadata?: Json
          outcome?: string | null
          provider_id?: string | null
          provider_user_id?: string | null
          reason?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_dispute_id?: string
          stripe_payment_intent_id?: string | null
          submission_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      system_alerts: {
        Row: {
          alert_key: string
          body: string | null
          correlation_id: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          resolved_at: string | null
          resolved_by: string | null
          seen_count: number
          severity: string
          source: string
          status: string
          title: string
        }
        Insert: {
          alert_key: string
          body?: string | null
          correlation_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          seen_count?: number
          severity?: string
          source: string
          status?: string
          title: string
        }
        Update: {
          alert_key?: string
          body?: string | null
          correlation_id?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          seen_count?: number
          severity?: string
          source?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      user_legal_acceptances: {
        Row: {
          accepted_at: string
          country_code: string
          document_hash: string
          document_id: string
          id: string
          ip: string | null
          language: string
          source: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          country_code: string
          document_hash: string
          document_id: string
          id?: string
          ip?: string | null
          language: string
          source?: string
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          country_code?: string
          document_hash?: string
          document_id?: string
          id?: string
          ip?: string | null
          language?: string
          source?: string
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_legal_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
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
      webhook_metrics: {
        Row: {
          attempt_count: number
          correlation_id: string | null
          duration_ms: number | null
          error_category: string | null
          event_id: string
          event_type: string
          id: string
          metadata: Json
          processed_at: string | null
          provider: string
          received_at: string
          result: string
        }
        Insert: {
          attempt_count?: number
          correlation_id?: string | null
          duration_ms?: number | null
          error_category?: string | null
          event_id: string
          event_type: string
          id?: string
          metadata?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          result?: string
        }
        Update: {
          attempt_count?: number
          correlation_id?: string | null
          duration_ms?: number | null
          error_category?: string | null
          event_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          result?: string
        }
        Relationships: []
      }
    }
    Views: {
      country_configs_public: {
        Row: {
          active: boolean | null
          booking_public: Json | null
          contact_public: Json | null
          currency: string | null
          default_language: string | null
          feature_availability_public: Json | null
          iso: string | null
          launch_status: string | null
          legal_references_public: Json | null
          payment_methods_public: Json | null
          supported_languages: string[] | null
          timezone: string | null
        }
        Insert: {
          active?: boolean | null
          booking_public?: never
          contact_public?: never
          currency?: string | null
          default_language?: string | null
          feature_availability_public?: never
          iso?: string | null
          launch_status?: string | null
          legal_references_public?: never
          payment_methods_public?: never
          supported_languages?: string[] | null
          timezone?: string | null
        }
        Update: {
          active?: boolean | null
          booking_public?: never
          contact_public?: never
          currency?: string | null
          default_language?: string | null
          feature_availability_public?: never
          iso?: string | null
          launch_status?: string | null
          legal_references_public?: never
          payment_methods_public?: never
          supported_languages?: string[] | null
          timezone?: string | null
        }
        Relationships: []
      }
      platform_tax_settings_v: {
        Row: {
          country_code: string | null
          country_config_json: Json | null
          country_config_status: string | null
          country_config_version: number | null
          created_at: string | null
          id: string | null
          invoice_series_prefix: string | null
          legal_entity_address: string | null
          legal_entity_name: string | null
          next_invoice_number: number | null
          tax_id: string | null
          updated_at: string | null
          vat_rate: number | null
        }
        Relationships: []
      }
      public_provider_marketplace: {
        Row: {
          approx_lat: number | null
          approx_lng: number | null
          base_country_code: string | null
          bio: string | null
          display_name: string | null
          headline: string | null
          hourly_rate: number | null
          languages: string[] | null
          photo_path: string | null
          provider_score: number | null
          provider_tier: Database["public"]["Enums"]["provider_tier"] | null
          service_area_radius_km: number | null
          service_categories: string[] | null
          tier_calculated_at: string | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          approx_lat?: never
          approx_lng?: never
          base_country_code?: string | null
          bio?: string | null
          display_name?: string | null
          headline?: string | null
          hourly_rate?: number | null
          languages?: string[] | null
          photo_path?: string | null
          provider_score?: number | null
          provider_tier?: Database["public"]["Enums"]["provider_tier"] | null
          service_area_radius_km?: number | null
          service_categories?: string[] | null
          tier_calculated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          approx_lat?: never
          approx_lng?: never
          base_country_code?: string | null
          bio?: string | null
          display_name?: string | null
          headline?: string | null
          hourly_rate?: number | null
          languages?: string[] | null
          photo_path?: string | null
          provider_score?: number | null
          provider_tier?: Database["public"]["Enums"]["provider_tier"] | null
          service_area_radius_km?: number | null
          service_categories?: string[] | null
          tier_calculated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _pp_as_service: { Args: never; Returns: undefined }
      admin_provider_action: {
        Args: {
          _action: string
          _idempotency_key?: string
          _metadata?: Json
          _reason?: string
          _target_user_id: string
        }
        Returns: Json
      }
      calc_provider_completion: { Args: { _uid: string }; Returns: Json }
      calc_provider_metrics: { Args: { _uid: string }; Returns: Json }
      calc_provider_score: { Args: { _uid: string }; Returns: Json }
      calc_provider_tier: {
        Args: { _metrics?: Json; _uid: string }
        Returns: Database["public"]["Enums"]["provider_tier"]
      }
      evaluate_feature_flag: {
        Args: {
          _country_iso?: string
          _flag_key: string
          _provider_id?: string
          _user_id?: string
        }
        Returns: boolean
      }
      get_lifecycle_public_isos: {
        Args: never
        Returns: {
          default_language: string
          iso: string
          supported_languages: string[]
        }[]
      }
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
      get_published_country_config: {
        Args: { _iso: string }
        Returns: {
          active: boolean
          commission_bps: number
          config: Json
          config_version: number
          currency: string
          default_language: string
          iso: string
          launch_status: string
          published_at: string
          timezone: string
          vat_rate_bps: number
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
      is_admin_only: { Args: { _uid: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_visible_to: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_country_bookable: { Args: { _iso: string }; Returns: boolean }
      is_country_launch_ready: { Args: { _iso: string }; Returns: boolean }
      is_country_visible: { Args: { _iso: string }; Returns: boolean }
      is_support_agent: { Args: { _uid: string }; Returns: boolean }
      is_under_legal_hold: {
        Args: { _target_id: string; _target_type: string }
        Returns: boolean
      }
      migrate_legacy_support_threads: {
        Args: never
        Returns: {
          messages_migrated: number
          threads_migrated: number
          threads_skipped: number
        }[]
      }
      next_credit_note_number: {
        Args: { _country_code: string }
        Returns: string
      }
      next_invoice_number: { Args: { _country_code: string }; Returns: string }
      provider_can_accept_booking: { Args: { _uid: string }; Returns: boolean }
      provider_can_receive_payout: { Args: { _uid: string }; Returns: boolean }
      provider_is_marketplace_visible: {
        Args: { _uid: string }
        Returns: boolean
      }
      raise_system_alert: {
        Args: {
          _alert_key: string
          _body?: string
          _correlation_id?: string
          _metadata?: Json
          _severity: string
          _source: string
          _title: string
        }
        Returns: string
      }
      reconcile_provider_status: {
        Args: { _uid: string }
        Returns: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          base_address_formatted: string | null
          base_address_place_id: string | null
          base_country_code: string | null
          base_lat: number | null
          base_lng: number | null
          base_validation_source: string | null
          bio: string | null
          completion_pct: number
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          emergency_contact: Json | null
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          rejected_at: string | null
          rejected_reason: string | null
          scoring_config_version: number | null
          service_area_radius_km: number | null
          service_categories: string[]
          status: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_disabled_reason: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements_due: string[]
          submitted_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          terms_accepted_at: string | null
          tier_calculated_at: string | null
          tier_is_manual: boolean
          trust_flags: Json
          trust_score: number
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["provider_visibility"]
          years_experience: number | null
        }
        SetofOptions: {
          from: "*"
          to: "provider_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_provider_score_tier: {
        Args: { _reason?: string; _uid: string }
        Returns: Json
      }
      resolve_system_alert: {
        Args: { _alert_key: string; _resolver?: string }
        Returns: number
      }
      start_provider_application: {
        Args: never
        Returns: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          base_address_formatted: string | null
          base_address_place_id: string | null
          base_country_code: string | null
          base_lat: number | null
          base_lng: number | null
          base_validation_source: string | null
          bio: string | null
          completion_pct: number
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          emergency_contact: Json | null
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          rejected_at: string | null
          rejected_reason: string | null
          scoring_config_version: number | null
          service_area_radius_km: number | null
          service_categories: string[]
          status: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_disabled_reason: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements_due: string[]
          submitted_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          terms_accepted_at: string | null
          tier_calculated_at: string | null
          tier_is_manual: boolean
          trust_flags: Json
          trust_score: number
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["provider_visibility"]
          years_experience: number | null
        }
        SetofOptions: {
          from: "*"
          to: "provider_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_provider_application: {
        Args: never
        Returns: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          base_address_formatted: string | null
          base_address_place_id: string | null
          base_country_code: string | null
          base_lat: number | null
          base_lng: number | null
          base_validation_source: string | null
          bio: string | null
          completion_pct: number
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          emergency_contact: Json | null
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          rejected_at: string | null
          rejected_reason: string | null
          scoring_config_version: number | null
          service_area_radius_km: number | null
          service_categories: string[]
          status: Database["public"]["Enums"]["provider_status"]
          stripe_charges_enabled: boolean
          stripe_details_submitted: boolean
          stripe_disabled_reason: string | null
          stripe_payouts_enabled: boolean
          stripe_requirements_due: string[]
          submitted_at: string | null
          suspended_at: string | null
          suspended_by: string | null
          terms_accepted_at: string | null
          tier_calculated_at: string | null
          tier_is_manual: boolean
          trust_flags: Json
          trust_score: number
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["provider_visibility"]
          years_experience: number | null
        }
        SetofOptions: {
          from: "*"
          to: "provider_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      support_booking_summary: { Args: { _booking_id: string }; Returns: Json }
      support_counters: { Args: { _user: string }; Returns: Json }
      support_customer_summary: { Args: { _user_id: string }; Returns: Json }
      support_provider_summary: {
        Args: { _provider_id: string }
        Returns: Json
      }
      support_search_bookings: {
        Args: { _limit?: number; _q?: string }
        Returns: {
          booking_date: string
          country_code: string
          currency: string
          customer_pays: number
          customer_user_id: string
          id: string
          payment_status: string
          provider_id: string
          status: string
        }[]
      }
      support_search_providers: {
        Args: { _limit?: number; _q?: string }
        Returns: {
          country_code: string
          created_at: string
          deactivated_at: string
          full_name: string
          id: string
          provider_id: string
        }[]
      }
      support_search_users: {
        Args: { _limit?: number; _q?: string }
        Returns: {
          country_code: string
          created_at: string
          deactivated_at: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      tax_decrypt: {
        Args: { _ciphertext: string; _key: string }
        Returns: string
      }
      tax_encrypt: {
        Args: { _key: string; _plaintext: string }
        Returns: string
      }
      user_owns_identity: { Args: { _identity_id: string }; Returns: boolean }
      user_owns_provider: { Args: { _provider_id: string }; Returns: boolean }
      visible_conversation_ids: {
        Args: { _user: string }
        Returns: {
          conversation_id: string
          last_message_at: string
        }[]
      }
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
      app_role:
        | "admin"
        | "employee"
        | "provider"
        | "customer"
        | "super_admin"
        | "support"
      booking_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "completed"
      country_lifecycle_state:
        | "development"
        | "beta"
        | "launch_ready"
        | "active"
        | "suspended"
        | "retired"
      identity_level: "customer" | "provider"
      identity_link_reason:
        | "auto_created"
        | "signup"
        | "admin_merge"
        | "admin_relink"
      identity_status:
        | "unverified"
        | "pending"
        | "approved"
        | "rejected"
        | "on_hold"
        | "expired"
      identity_webhook_result:
        | "received"
        | "processed"
        | "duplicate"
        | "failed"
        | "signature_invalid"
        | "unknown_type"
      payment_status:
        | "none"
        | "authorized"
        | "captured"
        | "canceled"
        | "failed"
        | "expired"
        | "refunded"
        | "partially_refunded"
      provider_status:
        | "draft"
        | "pending_identity"
        | "pending_stripe"
        | "pending_review"
        | "active"
        | "paused"
        | "suspended"
        | "rejected"
        | "archived"
      provider_tier:
        | "new"
        | "verified"
        | "experienced"
        | "top_rated"
        | "elite"
        | "partner"
      provider_visibility: "hidden" | "public"
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
      app_role: [
        "admin",
        "employee",
        "provider",
        "customer",
        "super_admin",
        "support",
      ],
      booking_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "completed",
      ],
      country_lifecycle_state: [
        "development",
        "beta",
        "launch_ready",
        "active",
        "suspended",
        "retired",
      ],
      identity_level: ["customer", "provider"],
      identity_link_reason: [
        "auto_created",
        "signup",
        "admin_merge",
        "admin_relink",
      ],
      identity_status: [
        "unverified",
        "pending",
        "approved",
        "rejected",
        "on_hold",
        "expired",
      ],
      identity_webhook_result: [
        "received",
        "processed",
        "duplicate",
        "failed",
        "signature_invalid",
        "unknown_type",
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
      provider_status: [
        "draft",
        "pending_identity",
        "pending_stripe",
        "pending_review",
        "active",
        "paused",
        "suspended",
        "rejected",
        "archived",
      ],
      provider_tier: [
        "new",
        "verified",
        "experienced",
        "top_rated",
        "elite",
        "partner",
      ],
      provider_visibility: ["hidden", "public"],
    },
  },
} as const
