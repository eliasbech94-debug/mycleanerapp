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
      booking_bank_payout_attributions: {
        Row: {
          attribution_method: string
          attribution_source: string
          booking_id: string
          confidence: string
          created_at: string
          id: string
          provider_bank_payout_id: string
          reconciliation_run_id: string | null
          stripe_transfer_id: string
        }
        Insert: {
          attribution_method: string
          attribution_source: string
          booking_id: string
          confidence?: string
          created_at?: string
          id?: string
          provider_bank_payout_id: string
          reconciliation_run_id?: string | null
          stripe_transfer_id: string
        }
        Update: {
          attribution_method?: string
          attribution_source?: string
          booking_id?: string
          confidence?: string
          created_at?: string
          id?: string
          provider_bank_payout_id?: string
          reconciliation_run_id?: string | null
          stripe_transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_bank_payout_attributions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_bank_payout_attributions_provider_bank_payout_id_fkey"
            columns: ["provider_bank_payout_id"]
            isOneToOne: false
            referencedRelation: "provider_bank_payouts"
            referencedColumns: ["id"]
          },
        ]
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
      booking_holds: {
        Row: {
          booking_id: string
          created_at: string
          created_by: string | null
          created_by_role: string | null
          expires_at: string | null
          hold_type: Database["public"]["Enums"]["booking_hold_type"]
          id: string
          metadata: Json
          reason: string
          release_note: string | null
          released_at: string | null
          released_by: string | null
          released_by_role: string | null
          status: Database["public"]["Enums"]["booking_hold_status"]
        }
        Insert: {
          booking_id: string
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          expires_at?: string | null
          hold_type: Database["public"]["Enums"]["booking_hold_type"]
          id?: string
          metadata?: Json
          reason: string
          release_note?: string | null
          released_at?: string | null
          released_by?: string | null
          released_by_role?: string | null
          status?: Database["public"]["Enums"]["booking_hold_status"]
        }
        Update: {
          booking_id?: string
          created_at?: string
          created_by?: string | null
          created_by_role?: string | null
          expires_at?: string | null
          hold_type?: Database["public"]["Enums"]["booking_hold_type"]
          id?: string
          metadata?: Json
          reason?: string
          release_note?: string | null
          released_at?: string | null
          released_by?: string | null
          released_by_role?: string | null
          status?: Database["public"]["Enums"]["booking_hold_status"]
        }
        Relationships: [
          {
            foreignKeyName: "booking_holds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_slot_locks: {
        Row: {
          booking_date: string | null
          booking_id: string
          created_at: string
          ends_at: string
          hours: number | null
          id: string
          provider_user_id: string
          reason: string | null
          released_at: string | null
          slot: string | null
          starts_at: string
          status: string
        }
        Insert: {
          booking_date?: string | null
          booking_id: string
          created_at?: string
          ends_at: string
          hours?: number | null
          id?: string
          provider_user_id: string
          reason?: string | null
          released_at?: string | null
          slot?: string | null
          starts_at: string
          status?: string
        }
        Update: {
          booking_date?: string | null
          booking_id?: string
          created_at?: string
          ends_at?: string
          hours?: number | null
          id?: string
          provider_user_id?: string
          reason?: string | null
          released_at?: string | null
          slot?: string | null
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_slot_locks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_workers: {
        Row: {
          assigned_at: string
          booking_id: string
          created_at: string
          id: string
          is_lead: boolean
          provider_id: string
          share_bps: number
          status: string
          updated_at: string
          worker_user_id: string
        }
        Insert: {
          assigned_at?: string
          booking_id: string
          created_at?: string
          id?: string
          is_lead?: boolean
          provider_id: string
          share_bps: number
          status?: string
          updated_at?: string
          worker_user_id: string
        }
        Update: {
          assigned_at?: string
          booking_id?: string
          created_at?: string
          id?: string
          is_lead?: boolean
          provider_id?: string
          share_bps?: number
          status?: string
          updated_at?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_workers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          acquisition_provider_id: string | null
          acquisition_source: string
          address: string
          address_place_id: string | null
          assigned_at: string | null
          assigned_provider_id: string | null
          assignment_deadline_at: string | null
          assignment_mode: Database["public"]["Enums"]["booking_assignment_mode"]
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
          dispatch_status: Database["public"]["Enums"]["booking_dispatch_status"]
          dispatched_at: string | null
          dynamic_pricing_applied: boolean | null
          fee_reconciliation_overdue: boolean
          funds_release_at: string | null
          hours: number
          id: string
          lat: number | null
          legacy_classification: string | null
          lng: number | null
          max_provider_cost_minor: number | null
          notes: string | null
          payment_flow_version:
            | Database["public"]["Enums"]["booking_payment_flow_version"]
            | null
          payment_intent_id: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payout_status:
            | Database["public"]["Enums"]["booking_payout_status"]
            | null
          platform_fee_amount: number
          pricing_calculation_id: string | null
          pricing_mode: Database["public"]["Enums"]["pricing_mode"] | null
          pricing_snapshot: Json | null
          pricing_version: number | null
          provider_gets: number
          provider_id: string
          provider_name: string
          provider_stripe_account_id: string | null
          refund_amount: number | null
          refund_id: string | null
          refund_reason: string | null
          refunded_at: string | null
          refunds: Json
          requested_provider_id: string | null
          service: string
          settled_reason: string | null
          slot: string
          status: Database["public"]["Enums"]["booking_status"]
          tax_config_snapshot: Json | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          acquisition_provider_id?: string | null
          acquisition_source?: string
          address: string
          address_place_id?: string | null
          assigned_at?: string | null
          assigned_provider_id?: string | null
          assignment_deadline_at?: string | null
          assignment_mode?: Database["public"]["Enums"]["booking_assignment_mode"]
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
          dispatch_status?: Database["public"]["Enums"]["booking_dispatch_status"]
          dispatched_at?: string | null
          dynamic_pricing_applied?: boolean | null
          fee_reconciliation_overdue?: boolean
          funds_release_at?: string | null
          hours: number
          id?: string
          lat?: number | null
          legacy_classification?: string | null
          lng?: number | null
          max_provider_cost_minor?: number | null
          notes?: string | null
          payment_flow_version?:
            | Database["public"]["Enums"]["booking_payment_flow_version"]
            | null
          payment_intent_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_status?:
            | Database["public"]["Enums"]["booking_payout_status"]
            | null
          platform_fee_amount?: number
          pricing_calculation_id?: string | null
          pricing_mode?: Database["public"]["Enums"]["pricing_mode"] | null
          pricing_snapshot?: Json | null
          pricing_version?: number | null
          provider_gets: number
          provider_id: string
          provider_name: string
          provider_stripe_account_id?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunds?: Json
          requested_provider_id?: string | null
          service: string
          settled_reason?: string | null
          slot: string
          status?: Database["public"]["Enums"]["booking_status"]
          tax_config_snapshot?: Json | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_provider_id?: string | null
          acquisition_source?: string
          address?: string
          address_place_id?: string | null
          assigned_at?: string | null
          assigned_provider_id?: string | null
          assignment_deadline_at?: string | null
          assignment_mode?: Database["public"]["Enums"]["booking_assignment_mode"]
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
          dispatch_status?: Database["public"]["Enums"]["booking_dispatch_status"]
          dispatched_at?: string | null
          dynamic_pricing_applied?: boolean | null
          fee_reconciliation_overdue?: boolean
          funds_release_at?: string | null
          hours?: number
          id?: string
          lat?: number | null
          legacy_classification?: string | null
          lng?: number | null
          max_provider_cost_minor?: number | null
          notes?: string | null
          payment_flow_version?:
            | Database["public"]["Enums"]["booking_payment_flow_version"]
            | null
          payment_intent_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_status?:
            | Database["public"]["Enums"]["booking_payout_status"]
            | null
          platform_fee_amount?: number
          pricing_calculation_id?: string | null
          pricing_mode?: Database["public"]["Enums"]["pricing_mode"] | null
          pricing_snapshot?: Json | null
          pricing_version?: number | null
          provider_gets?: number
          provider_id?: string
          provider_name?: string
          provider_stripe_account_id?: string | null
          refund_amount?: number | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunds?: Json
          requested_provider_id?: string | null
          service?: string
          settled_reason?: string | null
          slot?: string
          status?: Database["public"]["Enums"]["booking_status"]
          tax_config_snapshot?: Json | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_pricing_calculation_id_fkey"
            columns: ["pricing_calculation_id"]
            isOneToOne: false
            referencedRelation: "pricing_calculations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_applications: {
        Row: {
          accepted_privacy_at: string | null
          accepted_terms_at: string | null
          approval_idempotency_key: string | null
          assigned_number: number | null
          campaign_id: string
          categories: string[]
          city: string | null
          company_logo_path: string | null
          company_name: string | null
          country_code: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          email: string
          email_verification_expires_at: string | null
          email_verification_sent_at: string | null
          email_verification_token: string | null
          email_verification_used_at: string | null
          email_verified_at: string | null
          experience_years: number | null
          full_name: string
          heard_about: string | null
          hourly_rate_minor: number | null
          id: string
          invite_source: string | null
          ip: string | null
          languages: string[]
          phone: string | null
          postal_codes: string[]
          profile_photo_path: string | null
          provider_user_id: string | null
          referral_code: string | null
          referred_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["campaign_application_status"]
          updated_at: string
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          waiting_list_position: number | null
        }
        Insert: {
          accepted_privacy_at?: string | null
          accepted_terms_at?: string | null
          approval_idempotency_key?: string | null
          assigned_number?: number | null
          campaign_id: string
          categories?: string[]
          city?: string | null
          company_logo_path?: string | null
          company_name?: string | null
          country_code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email: string
          email_verification_expires_at?: string | null
          email_verification_sent_at?: string | null
          email_verification_token?: string | null
          email_verification_used_at?: string | null
          email_verified_at?: string | null
          experience_years?: number | null
          full_name: string
          heard_about?: string | null
          hourly_rate_minor?: number | null
          id?: string
          invite_source?: string | null
          ip?: string | null
          languages?: string[]
          phone?: string | null
          postal_codes?: string[]
          profile_photo_path?: string | null
          provider_user_id?: string | null
          referral_code?: string | null
          referred_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["campaign_application_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          waiting_list_position?: number | null
        }
        Update: {
          accepted_privacy_at?: string | null
          accepted_terms_at?: string | null
          approval_idempotency_key?: string | null
          assigned_number?: number | null
          campaign_id?: string
          categories?: string[]
          city?: string | null
          company_logo_path?: string | null
          company_name?: string | null
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string
          email_verification_expires_at?: string | null
          email_verification_sent_at?: string | null
          email_verification_token?: string | null
          email_verification_used_at?: string | null
          email_verified_at?: string | null
          experience_years?: number | null
          full_name?: string
          heard_about?: string | null
          hourly_rate_minor?: number | null
          id?: string
          invite_source?: string | null
          ip?: string | null
          languages?: string[]
          phone?: string | null
          postal_codes?: string[]
          profile_photo_path?: string | null
          provider_user_id?: string | null
          referral_code?: string | null
          referred_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["campaign_application_status"]
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          waiting_list_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_apply_attempts: {
        Row: {
          campaign_id: string | null
          created_at: string
          email: string | null
          id: number
          ip: string | null
          outcome: string
          reason: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          email?: string | null
          id?: number
          ip?: string | null
          outcome: string
          reason?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          email?: string | null
          id?: number
          ip?: string | null
          outcome?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_apply_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_apply_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_benefits: {
        Row: {
          campaign_id: string
          country_code: string | null
          created_at: string
          description: string | null
          enabled: boolean
          icon: string | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          enabled?: boolean
          icon?: string | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_benefits_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_benefits_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_country_settings: {
        Row: {
          ai_config: Json
          badge_emoji: string | null
          badge_label: string | null
          badge_template: string | null
          campaign_id: string
          countdown_enabled: boolean
          countdown_target_at: string | null
          country_code: string
          created_at: string
          cta_primary_label: string | null
          cta_secondary_label: string | null
          currency: string | null
          enabled: boolean
          hero_headline: string | null
          hero_subheadline: string | null
          max_applicants: number | null
          seo_description: string | null
          seo_og_image_url: string | null
          seo_title: string | null
          title: string | null
          updated_at: string
          waiting_list_enabled: boolean
        }
        Insert: {
          ai_config?: Json
          badge_emoji?: string | null
          badge_label?: string | null
          badge_template?: string | null
          campaign_id: string
          countdown_enabled?: boolean
          countdown_target_at?: string | null
          country_code: string
          created_at?: string
          cta_primary_label?: string | null
          cta_secondary_label?: string | null
          currency?: string | null
          enabled?: boolean
          hero_headline?: string | null
          hero_subheadline?: string | null
          max_applicants?: number | null
          seo_description?: string | null
          seo_og_image_url?: string | null
          seo_title?: string | null
          title?: string | null
          updated_at?: string
          waiting_list_enabled?: boolean
        }
        Update: {
          ai_config?: Json
          badge_emoji?: string | null
          badge_label?: string | null
          badge_template?: string | null
          campaign_id?: string
          countdown_enabled?: boolean
          countdown_target_at?: string | null
          country_code?: string
          created_at?: string
          cta_primary_label?: string | null
          cta_secondary_label?: string | null
          currency?: string | null
          enabled?: boolean
          hero_headline?: string | null
          hero_subheadline?: string | null
          max_applicants?: number | null
          seo_description?: string | null
          seo_og_image_url?: string | null
          seo_title?: string | null
          title?: string | null
          updated_at?: string
          waiting_list_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaign_country_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_country_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_email_outbox: {
        Row: {
          application_id: string | null
          attempts: number
          campaign_id: string
          created_at: string
          dedupe_key: string
          email: string
          id: string
          last_error: string | null
          payload: Json
          scheduled_for: string
          sent_at: string | null
          status: string
          template: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          campaign_id: string
          created_at?: string
          dedupe_key: string
          email: string
          id?: string
          last_error?: string | null
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          attempts?: number
          campaign_id?: string
          created_at?: string
          dedupe_key?: string
          email?: string
          id?: string
          last_error?: string | null
          payload?: Json
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_email_outbox_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_email_outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_email_outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          application_id: string | null
          campaign_id: string
          country_code: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["campaign_event_type"]
          id: number
          ip: string | null
          payload: Json
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          application_id?: string | null
          campaign_id: string
          country_code?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["campaign_event_type"]
          id?: number
          ip?: string | null
          payload?: Json
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          application_id?: string | null
          campaign_id?: string
          country_code?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["campaign_event_type"]
          id?: number
          ip?: string | null
          payload?: Json
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_faq: {
        Row: {
          answer: string
          campaign_id: string
          country_code: string | null
          created_at: string
          enabled: boolean
          id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          campaign_id: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          campaign_id?: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_faq_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_faq_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_number_counters: {
        Row: {
          campaign_id: string
          last_number: number
        }
        Insert: {
          campaign_id: string
          last_number?: number
        }
        Update: {
          campaign_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_number_counters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_number_counters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_page_blocks: {
        Row: {
          ai_config: Json
          block_type: Database["public"]["Enums"]["campaign_block_type"]
          campaign_id: string
          country_code: string | null
          created_at: string
          enabled: boolean
          id: string
          payload: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_config?: Json
          block_type: Database["public"]["Enums"]["campaign_block_type"]
          campaign_id: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          payload?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_config?: Json
          block_type?: Database["public"]["Enums"]["campaign_block_type"]
          campaign_id?: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          payload?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_page_blocks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_page_blocks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_reward_grants: {
        Row: {
          application_id: string
          campaign_id: string
          consumed_minor: number
          created_at: string
          expires_at: string | null
          granted_at: string
          id: string
          metadata: Json
          remaining_minor: number | null
          reward_id: string
          status: Database["public"]["Enums"]["campaign_reward_grant_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          application_id: string
          campaign_id: string
          consumed_minor?: number
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          metadata?: Json
          remaining_minor?: number | null
          reward_id: string
          status?: Database["public"]["Enums"]["campaign_reward_grant_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          application_id?: string
          campaign_id?: string
          consumed_minor?: number
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          id?: string
          metadata?: Json
          remaining_minor?: number | null
          reward_id?: string
          status?: Database["public"]["Enums"]["campaign_reward_grant_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_reward_grants_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_reward_grants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_reward_grants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_reward_grants_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "campaign_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_rewards: {
        Row: {
          campaign_id: string
          cap_minor: number | null
          country_code: string | null
          created_at: string
          currency: string | null
          description: string | null
          duration_days: number | null
          enabled: boolean
          id: string
          reward_type: Database["public"]["Enums"]["campaign_reward_type"]
          updated_at: string
          value_minor: number | null
          value_percent: number | null
        }
        Insert: {
          campaign_id: string
          cap_minor?: number | null
          country_code?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_days?: number | null
          enabled?: boolean
          id?: string
          reward_type: Database["public"]["Enums"]["campaign_reward_type"]
          updated_at?: string
          value_minor?: number | null
          value_percent?: number | null
        }
        Update: {
          campaign_id?: string
          cap_minor?: number | null
          country_code?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          duration_days?: number | null
          enabled?: boolean
          id?: string
          reward_type?: Database["public"]["Enums"]["campaign_reward_type"]
          updated_at?: string
          value_minor?: number | null
          value_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_rewards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_rewards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_testimonials: {
        Row: {
          author: string
          avatar_url: string | null
          campaign_id: string
          country_code: string | null
          created_at: string
          enabled: boolean
          id: string
          quote: string
          role_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          author: string
          avatar_url?: string | null
          campaign_id: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          quote: string
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author?: string
          avatar_url?: string | null
          campaign_id?: string
          country_code?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          quote?: string
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_testimonials_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaign_counters"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "campaign_testimonials_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ai_config: Json
          created_at: string
          created_by: string | null
          default_locale: string
          deleted_at: string | null
          deleted_by: string | null
          enable_badges: boolean
          enable_countdown: boolean
          enable_live_counter: boolean
          enable_referrals: boolean
          enable_rewards: boolean
          enable_testimonials: boolean
          enable_waiting_list: boolean
          ends_at: string | null
          id: string
          kind: Database["public"]["Enums"]["campaign_kind"]
          lifecycle: Database["public"]["Enums"]["campaign_lifecycle"]
          owner_role: string
          slug: string
          starts_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          ai_config?: Json
          created_at?: string
          created_by?: string | null
          default_locale?: string
          deleted_at?: string | null
          deleted_by?: string | null
          enable_badges?: boolean
          enable_countdown?: boolean
          enable_live_counter?: boolean
          enable_referrals?: boolean
          enable_rewards?: boolean
          enable_testimonials?: boolean
          enable_waiting_list?: boolean
          ends_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["campaign_kind"]
          lifecycle?: Database["public"]["Enums"]["campaign_lifecycle"]
          owner_role?: string
          slug: string
          starts_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          ai_config?: Json
          created_at?: string
          created_by?: string | null
          default_locale?: string
          deleted_at?: string | null
          deleted_by?: string | null
          enable_badges?: boolean
          enable_countdown?: boolean
          enable_live_counter?: boolean
          enable_referrals?: boolean
          enable_rewards?: boolean
          enable_testimonials?: boolean
          enable_waiting_list?: boolean
          ends_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["campaign_kind"]
          lifecycle?: Database["public"]["Enums"]["campaign_lifecycle"]
          owner_role?: string
          slug?: string
          starts_at?: string | null
          updated_at?: string
          version?: number
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
          funds_release_enabled: boolean
          iso: string
          launch_status: string
          lifecycle_state: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules: Json
          provider_liability_policy: Json
          published_at: string | null
          published_by: string | null
          require_bank_payout_ready: boolean
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
          funds_release_enabled?: boolean
          iso: string
          launch_status?: string
          lifecycle_state?: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules?: Json
          provider_liability_policy?: Json
          published_at?: string | null
          published_by?: string | null
          require_bank_payout_ready?: boolean
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
          funds_release_enabled?: boolean
          iso?: string
          launch_status?: string
          lifecycle_state?: Database["public"]["Enums"]["country_lifecycle_state"]
          pricing_rules?: Json
          provider_liability_policy?: Json
          published_at?: string | null
          published_by?: string | null
          require_bank_payout_ready?: boolean
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
      customer_favorites: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          provider_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          provider_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          provider_id?: string
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
      dynamic_pricing_config: {
        Row: {
          band_bps: Json
          band_thresholds: Json
          country_code: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          max_total_adjustment_bps: number
          min_supply_for_dynamic: number
          same_day_hours: number
          service_category: string | null
          surcharge_holiday_bps: number
          surcharge_same_day_bps: number
          surcharge_urgent_bps: number
          surcharge_weekend_bps: number
          updated_at: string
          urgent_hours: number
          version: number
        }
        Insert: {
          band_bps: Json
          band_thresholds: Json
          country_code: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          max_total_adjustment_bps?: number
          min_supply_for_dynamic?: number
          same_day_hours?: number
          service_category?: string | null
          surcharge_holiday_bps?: number
          surcharge_same_day_bps?: number
          surcharge_urgent_bps?: number
          surcharge_weekend_bps?: number
          updated_at?: string
          urgent_hours?: number
          version?: number
        }
        Update: {
          band_bps?: Json
          band_thresholds?: Json
          country_code?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          max_total_adjustment_bps?: number
          min_supply_for_dynamic?: number
          same_day_hours?: number
          service_category?: string | null
          surcharge_holiday_bps?: number
          surcharge_same_day_bps?: number
          surcharge_urgent_bps?: number
          surcharge_weekend_bps?: number
          updated_at?: string
          urgent_hours?: number
          version?: number
        }
        Relationships: []
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
      finance_accounts: {
        Row: {
          account_class: Database["public"]["Enums"]["finance_account_class"]
          code: string
          created_at: string
          description: string
          enabled: boolean
          reserved: boolean
          scope_keys: string[]
        }
        Insert: {
          account_class: Database["public"]["Enums"]["finance_account_class"]
          code: string
          created_at?: string
          description: string
          enabled?: boolean
          reserved?: boolean
          scope_keys?: string[]
        }
        Update: {
          account_class?: Database["public"]["Enums"]["finance_account_class"]
          code?: string
          created_at?: string
          description?: string
          enabled?: boolean
          reserved?: boolean
          scope_keys?: string[]
        }
        Relationships: []
      }
      finance_event_catalogue: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          event_type: string
          idempotency_shape: string
          multi_leg_accounts: string[]
          reserved: boolean
        }
        Insert: {
          created_at?: string
          description: string
          enabled?: boolean
          event_type: string
          idempotency_shape: string
          multi_leg_accounts?: string[]
          reserved?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          event_type?: string
          idempotency_shape?: string
          multi_leg_accounts?: string[]
          reserved?: boolean
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
      ledger_entries: {
        Row: {
          account: string
          amount_minor: number
          booking_id: string | null
          created_at: string
          currency: string
          direction: Database["public"]["Enums"]["ledger_entry_direction"]
          id: string
          leg_index: number
          provider_user_id: string | null
          transaction_id: string
        }
        Insert: {
          account: string
          amount_minor: number
          booking_id?: string | null
          created_at?: string
          currency: string
          direction: Database["public"]["Enums"]["ledger_entry_direction"]
          id?: string
          leg_index?: number
          provider_user_id?: string | null
          transaction_id: string
        }
        Update: {
          account?: string
          amount_minor?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          direction?: Database["public"]["Enums"]["ledger_entry_direction"]
          id?: string
          leg_index?: number
          provider_user_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          booking_id: string | null
          currency: string
          event_id: string
          event_type: string
          id: string
          memo: string | null
          payload_fingerprint: string | null
          posted_at: string
          provider_user_id: string | null
          raw: Json | null
          source: string
        }
        Insert: {
          booking_id?: string | null
          currency: string
          event_id: string
          event_type: string
          id?: string
          memo?: string | null
          payload_fingerprint?: string | null
          posted_at?: string
          provider_user_id?: string | null
          raw?: Json | null
          source?: string
        }
        Update: {
          booking_id?: string | null
          currency?: string
          event_id?: string
          event_type?: string
          id?: string
          memo?: string | null
          payload_fingerprint?: string | null
          posted_at?: string
          provider_user_id?: string | null
          raw?: Json | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_transactions_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "finance_event_catalogue"
            referencedColumns: ["event_type"]
          },
        ]
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
      market_pricing_multipliers: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          id: string
          key: string
          label: string | null
          multiplier_bps: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          id?: string
          key: string
          label?: string | null
          multiplier_bps: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          id?: string
          key?: string
          label?: string | null
          multiplier_bps?: number
          updated_at?: string
        }
        Relationships: []
      }
      market_pricing_rules: {
        Row: {
          active: boolean
          city: string | null
          country_code: string
          created_at: string
          currency: string
          id: string
          max_hourly_minor: number | null
          min_hourly_minor: number
          notes: string | null
          postcode: string | null
          recommended_hourly_minor: number | null
          region: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          country_code: string
          created_at?: string
          currency: string
          id?: string
          max_hourly_minor?: number | null
          min_hourly_minor: number
          notes?: string | null
          postcode?: string | null
          recommended_hourly_minor?: number | null
          region?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          max_hourly_minor?: number | null
          min_hourly_minor?: number
          notes?: string | null
          postcode?: string | null
          recommended_hourly_minor?: number | null
          region?: string | null
          scope?: string
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
      payout_audit_log: {
        Row: {
          action: string
          actor: string
          authorization_id: string | null
          booking_id: string | null
          created_at: string
          detail: Json | null
          from_state: string | null
          id: string
          provider_user_id: string | null
          reason: string | null
          to_state: string | null
        }
        Insert: {
          action: string
          actor: string
          authorization_id?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: Json | null
          from_state?: string | null
          id?: string
          provider_user_id?: string | null
          reason?: string | null
          to_state?: string | null
        }
        Update: {
          action?: string
          actor?: string
          authorization_id?: string | null
          booking_id?: string | null
          created_at?: string
          detail?: Json | null
          from_state?: string | null
          id?: string
          provider_user_id?: string | null
          reason?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_audit_log_authorization_id_fkey"
            columns: ["authorization_id"]
            isOneToOne: false
            referencedRelation: "payout_authorizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_audit_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_authorizations: {
        Row: {
          action: string
          booking_id: string | null
          consumed_at: string | null
          expires_at: string
          id: string
          issued_at: string
          payload: Json
          reason: string
          request_id: string
          requested_by: string
          status: string
        }
        Insert: {
          action: string
          booking_id?: string | null
          consumed_at?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          payload?: Json
          reason: string
          request_id: string
          requested_by: string
          status?: string
        }
        Update: {
          action?: string
          booking_id?: string | null
          consumed_at?: string | null
          expires_at?: string
          id?: string
          issued_at?: string
          payload?: Json
          reason?: string
          request_id?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_authorizations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_transfer_attempts: {
        Row: {
          amount_minor: number
          attempt_number: number
          attempt_scope: string
          booking_id: string
          created_at: string
          currency: string
          eligibility_snapshot: Json | null
          funding_mode: Database["public"]["Enums"]["transfer_funding_mode"]
          funding_source_ref: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          provider_user_id: string
          retry_count: number
          state: string
          stripe_idempotency_key: string
          stripe_transfer_id: string | null
          transfer_group: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          attempt_number?: number
          attempt_scope: string
          booking_id: string
          created_at?: string
          currency: string
          eligibility_snapshot?: Json | null
          funding_mode: Database["public"]["Enums"]["transfer_funding_mode"]
          funding_source_ref?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          provider_user_id: string
          retry_count?: number
          state?: string
          stripe_idempotency_key: string
          stripe_transfer_id?: string | null
          transfer_group: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          attempt_number?: number
          attempt_scope?: string
          booking_id?: string
          created_at?: string
          currency?: string
          eligibility_snapshot?: Json | null
          funding_mode?: Database["public"]["Enums"]["transfer_funding_mode"]
          funding_source_ref?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          provider_user_id?: string
          retry_count?: number
          state?: string
          stripe_idempotency_key?: string
          stripe_transfer_id?: string | null
          transfer_group?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_transfer_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
      pricing_calculations: {
        Row: {
          adjusted_rate_minor: number
          allow_decrease: boolean
          allow_increase: boolean
          base_rate_minor: number
          booking_id: string | null
          clamped_rate_minor: number
          commission_bps: number
          config_version: number | null
          country_code: string
          created_at: string
          currency: string
          customer_half_bps: number
          customer_total_minor: number
          customer_user_id: string | null
          demand_band: Database["public"]["Enums"]["pricing_demand_band"]
          demand_band_bps: number
          demand_count: number
          demand_ratio_bps: number
          duration_minutes: number
          dynamic_pricing_applied: boolean
          dynamic_pricing_config_id: string | null
          expires_at: string
          fail_reason: string | null
          holiday_bps: number
          hours_billed: number
          id: string
          location_fingerprint: string
          locked_at: string | null
          notes: Json
          platform_fee_minor: number
          pricing_mode: Database["public"]["Enums"]["pricing_mode"]
          pricing_version: number
          provider_half_bps: number
          provider_id_text: string
          provider_max_rate_minor: number
          provider_min_rate_minor: number
          provider_net_minor: number
          provider_pricing_settings_id: string | null
          provider_settings_version: number | null
          provider_user_id: string
          quote_context: Database["public"]["Enums"]["pricing_quote_context"]
          quote_context_key: string
          requester_user_id: string
          same_day_bps: number
          service_category: string
          start_at: string
          status: Database["public"]["Enums"]["pricing_quote_status"]
          subtotal_minor: number
          supersedes_id: string | null
          supply_count: number
          total_adjustment_bps: number
          urgent_bps: number
          weekend_bps: number
        }
        Insert: {
          adjusted_rate_minor: number
          allow_decrease: boolean
          allow_increase: boolean
          base_rate_minor: number
          booking_id?: string | null
          clamped_rate_minor: number
          commission_bps: number
          config_version?: number | null
          country_code: string
          created_at?: string
          currency: string
          customer_half_bps: number
          customer_total_minor: number
          customer_user_id?: string | null
          demand_band: Database["public"]["Enums"]["pricing_demand_band"]
          demand_band_bps: number
          demand_count: number
          demand_ratio_bps: number
          duration_minutes: number
          dynamic_pricing_applied: boolean
          dynamic_pricing_config_id?: string | null
          expires_at: string
          fail_reason?: string | null
          holiday_bps: number
          hours_billed: number
          id?: string
          location_fingerprint: string
          locked_at?: string | null
          notes?: Json
          platform_fee_minor: number
          pricing_mode: Database["public"]["Enums"]["pricing_mode"]
          pricing_version?: number
          provider_half_bps: number
          provider_id_text: string
          provider_max_rate_minor: number
          provider_min_rate_minor: number
          provider_net_minor: number
          provider_pricing_settings_id?: string | null
          provider_settings_version?: number | null
          provider_user_id: string
          quote_context: Database["public"]["Enums"]["pricing_quote_context"]
          quote_context_key: string
          requester_user_id: string
          same_day_bps: number
          service_category: string
          start_at: string
          status?: Database["public"]["Enums"]["pricing_quote_status"]
          subtotal_minor: number
          supersedes_id?: string | null
          supply_count: number
          total_adjustment_bps: number
          urgent_bps: number
          weekend_bps: number
        }
        Update: {
          adjusted_rate_minor?: number
          allow_decrease?: boolean
          allow_increase?: boolean
          base_rate_minor?: number
          booking_id?: string | null
          clamped_rate_minor?: number
          commission_bps?: number
          config_version?: number | null
          country_code?: string
          created_at?: string
          currency?: string
          customer_half_bps?: number
          customer_total_minor?: number
          customer_user_id?: string | null
          demand_band?: Database["public"]["Enums"]["pricing_demand_band"]
          demand_band_bps?: number
          demand_count?: number
          demand_ratio_bps?: number
          duration_minutes?: number
          dynamic_pricing_applied?: boolean
          dynamic_pricing_config_id?: string | null
          expires_at?: string
          fail_reason?: string | null
          holiday_bps?: number
          hours_billed?: number
          id?: string
          location_fingerprint?: string
          locked_at?: string | null
          notes?: Json
          platform_fee_minor?: number
          pricing_mode?: Database["public"]["Enums"]["pricing_mode"]
          pricing_version?: number
          provider_half_bps?: number
          provider_id_text?: string
          provider_max_rate_minor?: number
          provider_min_rate_minor?: number
          provider_net_minor?: number
          provider_pricing_settings_id?: string | null
          provider_settings_version?: number | null
          provider_user_id?: string
          quote_context?: Database["public"]["Enums"]["pricing_quote_context"]
          quote_context_key?: string
          requester_user_id?: string
          same_day_bps?: number
          service_category?: string
          start_at?: string
          status?: Database["public"]["Enums"]["pricing_quote_status"]
          subtotal_minor?: number
          supersedes_id?: string | null
          supply_count?: number
          total_adjustment_bps?: number
          urgent_bps?: number
          weekend_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "pricing_calculations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_calculations_dynamic_pricing_config_id_fkey"
            columns: ["dynamic_pricing_config_id"]
            isOneToOne: false
            referencedRelation: "dynamic_pricing_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_calculations_provider_pricing_settings_id_fkey"
            columns: ["provider_pricing_settings_id"]
            isOneToOne: false
            referencedRelation: "provider_pricing_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_calculations_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "pricing_calculations"
            referencedColumns: ["id"]
          },
        ]
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
      provider_balance_accounts: {
        Row: {
          available_credit_minor: number
          currency: string
          outstanding_debt_minor: number
          provider_user_id: string
          updated_at: string
          version: number
        }
        Insert: {
          available_credit_minor?: number
          currency: string
          outstanding_debt_minor?: number
          provider_user_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          available_credit_minor?: number
          currency?: string
          outstanding_debt_minor?: number
          provider_user_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      provider_balance_movements: {
        Row: {
          amount_minor: number
          created_at: string
          credit_item_id: string | null
          currency: string
          debt_item_id: string | null
          id: string
          ledger_transaction_id: string
          movement_type: Database["public"]["Enums"]["provider_balance_movement_type"]
          provider_user_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          credit_item_id?: string | null
          currency: string
          debt_item_id?: string | null
          id?: string
          ledger_transaction_id: string
          movement_type: Database["public"]["Enums"]["provider_balance_movement_type"]
          provider_user_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          credit_item_id?: string | null
          currency?: string
          debt_item_id?: string | null
          id?: string
          ledger_transaction_id?: string
          movement_type?: Database["public"]["Enums"]["provider_balance_movement_type"]
          provider_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_balance_movements_credit_item_id_fkey"
            columns: ["credit_item_id"]
            isOneToOne: false
            referencedRelation: "provider_credit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_balance_movements_debt_item_id_fkey"
            columns: ["debt_item_id"]
            isOneToOne: false
            referencedRelation: "provider_debt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_balance_movements_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_bank_payouts: {
        Row: {
          amount_minor: number
          arrival_date: string | null
          created_at: string
          currency: string
          failure_code: string | null
          failure_message: string | null
          id: string
          method: string | null
          provider_user_id: string
          raw: Json
          source_type: string | null
          status: string
          stripe_account_id: string
          stripe_payout_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          arrival_date?: string | null
          created_at?: string
          currency: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          method?: string | null
          provider_user_id: string
          raw: Json
          source_type?: string | null
          status: string
          stripe_account_id: string
          stripe_payout_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          arrival_date?: string | null
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          method?: string | null
          provider_user_id?: string
          raw?: Json
          source_type?: string | null
          status?: string
          stripe_account_id?: string
          stripe_payout_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_credit_allocations: {
        Row: {
          amount_minor: number
          booking_id: string | null
          created_at: string
          credit_item_id: string
          id: string
          ledger_transaction_id: string
          target: string
          target_debt_item_id: string | null
        }
        Insert: {
          amount_minor: number
          booking_id?: string | null
          created_at?: string
          credit_item_id: string
          id?: string
          ledger_transaction_id: string
          target: string
          target_debt_item_id?: string | null
        }
        Update: {
          amount_minor?: number
          booking_id?: string | null
          created_at?: string
          credit_item_id?: string
          id?: string
          ledger_transaction_id?: string
          target?: string
          target_debt_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_credit_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credit_allocations_credit_item_id_fkey"
            columns: ["credit_item_id"]
            isOneToOne: false
            referencedRelation: "provider_credit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credit_allocations_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credit_allocations_target_debt_item_id_fkey"
            columns: ["target_debt_item_id"]
            isOneToOne: false
            referencedRelation: "provider_debt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credit_items: {
        Row: {
          created_at: string
          currency: string
          id: string
          original_amount_minor: number
          provider_user_id: string
          source_booking_id: string | null
          source_movement_id: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          original_amount_minor: number
          provider_user_id: string
          source_booking_id?: string | null
          source_movement_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          original_amount_minor?: number
          provider_user_id?: string
          source_booking_id?: string | null
          source_movement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_credit_items_source_booking_id_fkey"
            columns: ["source_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_credit_items_source_movement_fkey"
            columns: ["source_movement_id"]
            isOneToOne: false
            referencedRelation: "provider_balance_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_debt_allocations: {
        Row: {
          amount_minor: number
          booking_id: string | null
          created_at: string
          debt_item_id: string
          id: string
          ledger_transaction_id: string
          source: string
          source_credit_item_id: string | null
        }
        Insert: {
          amount_minor: number
          booking_id?: string | null
          created_at?: string
          debt_item_id: string
          id?: string
          ledger_transaction_id: string
          source: string
          source_credit_item_id?: string | null
        }
        Update: {
          amount_minor?: number
          booking_id?: string | null
          created_at?: string
          debt_item_id?: string
          id?: string
          ledger_transaction_id?: string
          source?: string
          source_credit_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_debt_allocations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_debt_allocations_debt_item_id_fkey"
            columns: ["debt_item_id"]
            isOneToOne: false
            referencedRelation: "provider_debt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_debt_allocations_ledger_transaction_id_fkey"
            columns: ["ledger_transaction_id"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_debt_allocations_source_credit_item_id_fkey"
            columns: ["source_credit_item_id"]
            isOneToOne: false
            referencedRelation: "provider_credit_items"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_debt_items: {
        Row: {
          created_at: string
          currency: string
          id: string
          original_amount_minor: number
          provider_user_id: string
          source_booking_id: string | null
          source_movement_id: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          id?: string
          original_amount_minor: number
          provider_user_id: string
          source_booking_id?: string | null
          source_movement_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          original_amount_minor?: number
          provider_user_id?: string
          source_booking_id?: string | null
          source_movement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_debt_items_source_booking_id_fkey"
            columns: ["source_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_debt_items_source_movement_fkey"
            columns: ["source_movement_id"]
            isOneToOne: false
            referencedRelation: "provider_balance_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_offers: {
        Row: {
          accepted_at: string | null
          booking_id: string
          created_at: string
          declined_at: string | null
          expired_at: string | null
          id: string
          offer_batch: number
          offer_status: Database["public"]["Enums"]["offer_status"]
          offered_at: string
          provider_user_id: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          booking_id: string
          created_at?: string
          declined_at?: string | null
          expired_at?: string | null
          id?: string
          offer_batch?: number
          offer_status?: Database["public"]["Enums"]["offer_status"]
          offered_at?: string
          provider_user_id: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          booking_id?: string
          created_at?: string
          declined_at?: string | null
          expired_at?: string | null
          id?: string
          offer_batch?: number
          offer_status?: Database["public"]["Enums"]["offer_status"]
          offered_at?: string
          provider_user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_offers_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_pricing_preferences: {
        Row: {
          city: string | null
          country_code: string
          created_at: string
          currency: string
          hourly_rate_minor: number
          matched_scope: string | null
          postcode: string | null
          region: string | null
          resolved_max_minor: number | null
          resolved_min_minor: number | null
          smart_max_minor: number | null
          smart_min_minor: number | null
          smart_pricing_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          country_code: string
          created_at?: string
          currency: string
          hourly_rate_minor: number
          matched_scope?: string | null
          postcode?: string | null
          region?: string | null
          resolved_max_minor?: number | null
          resolved_min_minor?: number | null
          smart_max_minor?: number | null
          smart_min_minor?: number | null
          smart_pricing_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          country_code?: string
          created_at?: string
          currency?: string
          hourly_rate_minor?: number
          matched_scope?: string | null
          postcode?: string | null
          region?: string | null
          resolved_max_minor?: number | null
          resolved_min_minor?: number | null
          smart_max_minor?: number | null
          smart_min_minor?: number | null
          smart_pricing_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_pricing_settings: {
        Row: {
          allow_decrease: boolean
          allow_increase: boolean
          base_rate_minor: number
          country_code: string
          created_at: string
          currency: string
          enabled: boolean
          id: string
          max_decrease_bps: number
          max_increase_bps: number
          max_rate_minor: number
          min_rate_minor: number
          provider_user_id: string
          service_category: string
          updated_at: string
          version: number
        }
        Insert: {
          allow_decrease?: boolean
          allow_increase?: boolean
          base_rate_minor: number
          country_code: string
          created_at?: string
          currency: string
          enabled?: boolean
          id?: string
          max_decrease_bps?: number
          max_increase_bps?: number
          max_rate_minor: number
          min_rate_minor: number
          provider_user_id: string
          service_category: string
          updated_at?: string
          version?: number
        }
        Update: {
          allow_decrease?: boolean
          allow_increase?: boolean
          base_rate_minor?: number
          country_code?: string
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          max_decrease_bps?: number
          max_increase_bps?: number
          max_rate_minor?: number
          min_rate_minor?: number
          provider_user_id?: string
          service_category?: string
          updated_at?: string
          version?: number
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
          avg_response_minutes: number | null
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
          equipment_badges: Json
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          is_public: boolean
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string | null
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
          avg_response_minutes?: number | null
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
          equipment_badges?: Json
          headline?: string | null
          hourly_rate?: number | null
          identity_status?: string
          insurance_doc_path?: string | null
          insurance_expires_on?: string | null
          insurance_policy_number?: string | null
          is_public?: boolean
          languages?: string[]
          payout_frozen?: boolean
          payout_frozen_reason?: string | null
          performance_snapshot?: Json
          photo_path?: string | null
          provider_score?: number
          provider_slug: string
          provider_tier?: Database["public"]["Enums"]["provider_tier"]
          public_bio?: string | null
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
          avg_response_minutes?: number | null
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
          equipment_badges?: Json
          headline?: string | null
          hourly_rate?: number | null
          identity_status?: string
          insurance_doc_path?: string | null
          insurance_expires_on?: string | null
          insurance_policy_number?: string | null
          is_public?: boolean
          languages?: string[]
          payout_frozen?: boolean
          payout_frozen_reason?: string | null
          performance_snapshot?: Json
          photo_path?: string | null
          provider_score?: number
          provider_slug?: string
          provider_tier?: Database["public"]["Enums"]["provider_tier"]
          public_bio?: string | null
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
          idempotency_key: string
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
          idempotency_key: string
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
          idempotency_key?: string
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
      provider_slug_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_slug: string
          old_slug: string
          provider_user_id: string
          reason: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_slug: string
          old_slug: string
          provider_user_id: string
          reason?: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_slug?: string
          old_slug?: string
          provider_user_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_slug_history_provider_user_id_fkey"
            columns: ["provider_user_id"]
            isOneToOne: false
            referencedRelation: "provider_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "provider_slug_history_provider_user_id_fkey"
            columns: ["provider_user_id"]
            isOneToOne: false
            referencedRelation: "public_provider_marketplace"
            referencedColumns: ["user_id"]
          },
        ]
      }
      provider_slug_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string
          slug?: string
        }
        Relationships: []
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
      provider_trust: {
        Row: {
          config_version: number
          created_at: string
          last_calculated_at: string
          provider_id: string
          risk_reason: string | null
          trust_flags: Json
          trust_level: string
          trust_score: number
          updated_at: string
        }
        Insert: {
          config_version?: number
          created_at?: string
          last_calculated_at?: string
          provider_id: string
          risk_reason?: string | null
          trust_flags?: Json
          trust_level?: string
          trust_score?: number
          updated_at?: string
        }
        Update: {
          config_version?: number
          created_at?: string
          last_calculated_at?: string
          provider_id?: string
          risk_reason?: string | null
          trust_flags?: Json
          trust_level?: string
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_trust_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "provider_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "provider_trust_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: true
            referencedRelation: "public_provider_marketplace"
            referencedColumns: ["user_id"]
          },
        ]
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
      release_eligibility_decisions: {
        Row: {
          booking_id: string
          booking_snapshot: Json
          decision: string
          engine_version: string
          evaluated_at: string
          evaluator_role: string | null
          evaluator_user_id: string | null
          failed_rules: Json
          hold_snapshot: Json
          id: string
          provider_readiness: Json
          provider_user_id: string | null
          remaining_hold_seconds: number | null
          scheduled_release_at: string | null
        }
        Insert: {
          booking_id: string
          booking_snapshot?: Json
          decision: string
          engine_version?: string
          evaluated_at?: string
          evaluator_role?: string | null
          evaluator_user_id?: string | null
          failed_rules?: Json
          hold_snapshot?: Json
          id?: string
          provider_readiness?: Json
          provider_user_id?: string | null
          remaining_hold_seconds?: number | null
          scheduled_release_at?: string | null
        }
        Update: {
          booking_id?: string
          booking_snapshot?: Json
          decision?: string
          engine_version?: string
          evaluated_at?: string
          evaluator_role?: string | null
          evaluator_user_id?: string | null
          failed_rules?: Json
          hold_snapshot?: Json
          id?: string
          provider_readiness?: Json
          provider_user_id?: string | null
          remaining_hold_seconds?: number | null
          scheduled_release_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "release_eligibility_decisions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
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
      service_duration_rules: {
        Row: {
          active: boolean
          country_code: string | null
          created_at: string
          id: string
          max_minutes: number
          min_minutes: number
          notes: string | null
          service_key: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_code?: string | null
          created_at?: string
          id?: string
          max_minutes?: number
          min_minutes: number
          notes?: string | null
          service_key: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_code?: string | null
          created_at?: string
          id?: string
          max_minutes?: number
          min_minutes?: number
          notes?: string | null
          service_key?: string
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
      stripe_refund_events: {
        Row: {
          amount_minor: number
          currency: string
          id: string
          raw: Json
          received_at: string
          source: string
          status: string
          stripe_created_at: string
          stripe_event_id: string
          stripe_refund_id: string
        }
        Insert: {
          amount_minor: number
          currency: string
          id?: string
          raw: Json
          received_at?: string
          source?: string
          status: string
          stripe_created_at: string
          stripe_event_id: string
          stripe_refund_id: string
        }
        Update: {
          amount_minor?: number
          currency?: string
          id?: string
          raw?: Json
          received_at?: string
          source?: string
          status?: string
          stripe_created_at?: string
          stripe_event_id?: string
          stripe_refund_id?: string
        }
        Relationships: []
      }
      stripe_refunds: {
        Row: {
          amount_minor: number
          booking_id: string | null
          currency: string
          last_received_at: string
          last_stripe_event_created_at: string
          last_stripe_event_id: string
          status: string
          stripe_refund_id: string
          updated_at: string
        }
        Insert: {
          amount_minor: number
          booking_id?: string | null
          currency: string
          last_received_at: string
          last_stripe_event_created_at: string
          last_stripe_event_id: string
          status: string
          stripe_refund_id: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          booking_id?: string | null
          currency?: string
          last_received_at?: string
          last_stripe_event_created_at?: string
          last_stripe_event_id?: string
          status?: string
          stripe_refund_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_source_transfer_events: {
        Row: {
          booking_id: string | null
          created_at: string
          currency: string
          event_kind: string
          gross_amount_minor: number
          id: string
          raw: Json
          source_charge_id: string
          stripe_created_at: string
          stripe_event_id: string
          stripe_transfer_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          currency: string
          event_kind: string
          gross_amount_minor: number
          id?: string
          raw: Json
          source_charge_id: string
          stripe_created_at: string
          stripe_event_id: string
          stripe_transfer_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          currency?: string
          event_kind?: string
          gross_amount_minor?: number
          id?: string
          raw?: Json
          source_charge_id?: string
          stripe_created_at?: string
          stripe_event_id?: string
          stripe_transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_source_transfer_events_booking_id_fkey"
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
      unclassified_balance_transactions: {
        Row: {
          amount_minor: number | null
          created_at: string
          currency: string | null
          id: string
          raw: Json
          reason: string
          reporting_category: string | null
          resolution_note: string | null
          resolved_at: string | null
          status: string
          stripe_balance_transaction_id: string
        }
        Insert: {
          amount_minor?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          raw: Json
          reason: string
          reporting_category?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          stripe_balance_transaction_id: string
        }
        Update: {
          amount_minor?: number | null
          created_at?: string
          currency?: string | null
          id?: string
          raw?: Json
          reason?: string
          reporting_category?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          status?: string
          stripe_balance_transaction_id?: string
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
      worker_earnings: {
        Row: {
          booking_id: string
          created_at: string
          currency: string
          earned_at: string
          gross_amount_minor: number
          id: string
          net_amount_minor: number
          platform_fee_amount_minor: number
          provider_id: string
          status: string
          stripe_destination_account: string | null
          stripe_transfer_id: string | null
          updated_at: string
          worker_user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          currency: string
          earned_at?: string
          gross_amount_minor: number
          id?: string
          net_amount_minor: number
          platform_fee_amount_minor?: number
          provider_id: string
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
          worker_user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          currency?: string
          earned_at?: string
          gross_amount_minor?: number
          id?: string
          net_amount_minor?: number
          platform_fee_amount_minor?: number
          provider_id?: string
          status?: string
          stripe_destination_account?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
          worker_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_earnings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      campaign_counters: {
        Row: {
          approved_count: number | null
          campaign_id: string | null
          country_code: string | null
          is_full: boolean | null
          max_applicants: number | null
          pending_count: number | null
          remaining: number | null
          total_count: number | null
          waiting_list_count: number | null
        }
        Relationships: []
      }
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
      v_source_transfer_capacity: {
        Row: {
          currency: string | null
          source_charge_id: string | null
          source_linked_gross_transfers_minor: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _ledger_normalize_entries: { Args: { _entries: Json }; Returns: Json }
      _ledger_payload_fingerprint: {
        Args: {
          _booking_id: string
          _currency: string
          _entries: Json
          _event_id: string
          _event_type: string
          _provider_user_id: string
        }
        Returns: string
      }
      _market_rule_to_jsonb: {
        Args: {
          _matched: string
          r: Database["public"]["Tables"]["market_pricing_rules"]["Row"]
        }
        Returns: Json
      }
      _pp_scope_clear: { Args: never; Returns: undefined }
      _pp_scope_set: { Args: { _scope: string }; Returns: undefined }
      admin_get_provider_trust: {
        Args: { _uid: string }
        Returns: {
          config_version: number
          created_at: string
          last_calculated_at: string
          provider_id: string
          risk_reason: string | null
          trust_flags: Json
          trust_level: string
          trust_score: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "provider_trust"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_list_flagged_provider_ids: { Args: never; Returns: string[] }
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
      admin_release_slug_v1: { Args: { _slug: string }; Returns: undefined }
      admin_reserve_slug_v1: {
        Args: { _reason: string; _slug: string }
        Returns: undefined
      }
      assert_ledger_writer_authorized: { Args: never; Returns: undefined }
      begin_ledger_write: { Args: never; Returns: undefined }
      booking_interval_from_row: {
        Args: { _b: Database["public"]["Tables"]["bookings"]["Row"] }
        Returns: {
          ends_at: string
          starts_at: string
        }[]
      }
      booking_lock_blocked_range: {
        Args: { _ends_at: string; _starts_at: string }
        Returns: unknown
      }
      calc_provider_completion: { Args: { _uid: string }; Returns: Json }
      calc_provider_metrics: { Args: { _uid: string }; Returns: Json }
      calc_provider_score: { Args: { _uid: string }; Returns: Json }
      calc_provider_tier: {
        Args: { _metrics?: Json; _uid: string }
        Returns: Database["public"]["Enums"]["provider_tier"]
      }
      check_provider_payout_readiness_v1: {
        Args: { p_provider_user_id: string }
        Returns: Json
      }
      check_slug_availability_v1: {
        Args: { _slug: string }
        Returns: {
          available: boolean
          reason: string
        }[]
      }
      claim_booking_offer_v1: { Args: { _offer_id: string }; Returns: Json }
      classify_booking_payment_flow_v1: {
        Args: {
          _booking_id: string
          _flow: Database["public"]["Enums"]["booking_payment_flow_version"]
          _reason?: string
        }
        Returns: Database["public"]["Enums"]["booking_payment_flow_version"]
      }
      compute_recommended_price: { Args: { _user_id: string }; Returns: Json }
      create_booking_hold_v1: {
        Args: {
          p_actor_role?: string
          p_actor_user_id: string
          p_booking_id: string
          p_expires_at?: string
          p_hold_type: Database["public"]["Enums"]["booking_hold_type"]
          p_metadata?: Json
          p_reason: string
        }
        Returns: string
      }
      decline_booking_offer_v1: { Args: { _offer_id: string }; Returns: Json }
      evaluate_booking_release_eligibility_v1: {
        Args: {
          p_booking_id: string
          p_evaluator_role?: string
          p_evaluator_user_id?: string
        }
        Returns: Json
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
      expire_pricing_quotes: { Args: never; Returns: number }
      funds_release_max_retries_v1: { Args: never; Returns: number }
      funds_release_reason_codes_v1: { Args: never; Returns: Json }
      funds_release_rehearsal_worker_tick_v1: {
        Args: { _limit?: number }
        Returns: Json
      }
      funds_release_worker_tick_v1: { Args: { _limit?: number }; Returns: Json }
      gen_provider_slug: {
        Args: { _display_name: string; _user_id: string }
        Returns: string
      }
      get_booking_captured_gross_minor_v1: {
        Args: { _booking_id: string }
        Returns: number
      }
      get_booking_refunded_gross_minor_v1: {
        Args: { _booking_id: string }
        Returns: number
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
          provider_slug: string
        }[]
      }
      get_public_provider_profile_v1: {
        Args: { _slug: string }
        Returns: {
          approximate_service_area: Json
          avatar_url: string
          average_rating: number
          avg_response_minutes: number
          completed_bookings: number
          country_code: string
          display_name: string
          equipment_badges: Json
          identity_verified_badge: boolean
          insurance_valid: boolean
          languages: string[]
          marketplace_score: number
          price_from: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string
          service_categories: string[]
          service_radius_km: number
          total_reviews: number
          years_experience: number
          years_on_platform: number
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
      get_source_transfer_capacity_v1: {
        Args: {
          _currency: string
          _expected_charge_gross_minor: number
          _source_charge_id: string
        }
        Returns: {
          charge_gross_minor: number
          consumed_minor: number
          currency: string
          remaining_minor: number
          source_charge_id: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_request_context: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_payment_captured_reclassify_v1: {
        Args: {
          _booking_id: string
          _currency: string
          _gross_minor: number
          _payment_intent_id: string
          _raw?: Json
          _version: number
        }
        Returns: string
      }
      ingest_payment_captured_suspense_v1: {
        Args: {
          _currency: string
          _gross_minor: number
          _payment_intent_id: string
          _raw?: Json
        }
        Returns: string
      }
      ingest_payment_captured_v1: {
        Args: {
          _booking_id: string
          _currency: string
          _gross_minor: number
          _payment_intent_id: string
          _raw?: Json
        }
        Returns: string
      }
      ingest_refund_recorded_v1: {
        Args: {
          _amount_minor: number
          _booking_id: string
          _currency: string
          _raw?: Json
          _status: string
          _stripe_created_at: string
          _stripe_event_id: string
          _stripe_refund_id: string
        }
        Returns: string
      }
      ingest_stripe_fee_actual_v1: {
        Args: {
          _balance_tx_id: string
          _booking_id: string
          _currency: string
          _fee_minor: number
          _raw?: Json
        }
        Returns: string
      }
      ingest_stripe_fee_estimate_v1: {
        Args: {
          _booking_id: string
          _currency: string
          _estimate_minor: number
          _payment_intent_id: string
          _raw?: Json
        }
        Returns: string
      }
      ingest_stripe_fee_zero_v1: {
        Args: {
          _booking_id: string
          _currency: string
          _estimate_minor: number
          _evidence_id: string
          _payment_intent_id: string
          _raw?: Json
        }
        Returns: string
      }
      ingest_transfer_event_v1: {
        Args: {
          _booking_id: string
          _currency: string
          _event_kind: string
          _gross_minor: number
          _raw?: Json
          _source_charge_id: string
          _stripe_created_at: string
          _stripe_event_id: string
          _stripe_transfer_id: string
        }
        Returns: undefined
      }
      is_admin_only: { Args: { _uid: string }; Returns: boolean }
      is_campaign_public: {
        Args: { _lc: Database["public"]["Enums"]["campaign_lifecycle"] }
        Returns: boolean
      }
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
      list_favorite_providers_v1: {
        Args: never
        Returns: {
          added_at: string
          provider_id: string
          provider_slug: string
        }[]
      }
      list_provider_bookable_slots_v1: {
        Args: { _from: string; _slug: string; _to: string }
        Returns: {
          slot_date: string
          slot_hour: number
        }[]
      }
      lock_pricing_quote: {
        Args: { _booking_id: string; _quote_id: string }
        Returns: {
          adjusted_rate_minor: number
          allow_decrease: boolean
          allow_increase: boolean
          base_rate_minor: number
          booking_id: string | null
          clamped_rate_minor: number
          commission_bps: number
          config_version: number | null
          country_code: string
          created_at: string
          currency: string
          customer_half_bps: number
          customer_total_minor: number
          customer_user_id: string | null
          demand_band: Database["public"]["Enums"]["pricing_demand_band"]
          demand_band_bps: number
          demand_count: number
          demand_ratio_bps: number
          duration_minutes: number
          dynamic_pricing_applied: boolean
          dynamic_pricing_config_id: string | null
          expires_at: string
          fail_reason: string | null
          holiday_bps: number
          hours_billed: number
          id: string
          location_fingerprint: string
          locked_at: string | null
          notes: Json
          platform_fee_minor: number
          pricing_mode: Database["public"]["Enums"]["pricing_mode"]
          pricing_version: number
          provider_half_bps: number
          provider_id_text: string
          provider_max_rate_minor: number
          provider_min_rate_minor: number
          provider_net_minor: number
          provider_pricing_settings_id: string | null
          provider_settings_version: number | null
          provider_user_id: string
          quote_context: Database["public"]["Enums"]["pricing_quote_context"]
          quote_context_key: string
          requester_user_id: string
          same_day_bps: number
          service_category: string
          start_at: string
          status: Database["public"]["Enums"]["pricing_quote_status"]
          subtotal_minor: number
          supersedes_id: string | null
          supply_count: number
          total_adjustment_bps: number
          urgent_bps: number
          weekend_bps: number
        }
        SetofOptions: {
          from: "*"
          to: "pricing_calculations"
          isOneToOne: true
          isSetofReturn: false
        }
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
      plan_pending_releases_v1: {
        Args: { _force_dry_run?: boolean; _limit?: number }
        Returns: Json
      }
      post_ledger_transaction_v1: {
        Args: {
          _booking_id?: string
          _currency: string
          _entries: Json
          _event_id: string
          _event_type: string
          _memo?: string
          _provider_user_id?: string
          _raw?: Json
          _source?: string
        }
        Returns: string
      }
      provider_can_accept_booking: { Args: { _uid: string }; Returns: boolean }
      provider_can_receive_payout: { Args: { _uid: string }; Returns: boolean }
      provider_is_marketplace_visible: {
        Args: { _uid: string }
        Returns: boolean
      }
      provider_profile_protected_columns: { Args: never; Returns: string[] }
      provider_profile_scope_allowlist: {
        Args: { _scope: string }
        Returns: string[]
      }
      provider_profile_service_update_v1: {
        Args: { _patch: Json; _scope: string; _user_id: string }
        Returns: undefined
      }
      provider_profile_write_scope: { Args: never; Returns: string }
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
      reconcile_provider_payout_readiness_v1: {
        Args: { _limit?: number }
        Returns: Json
      }
      reconcile_provider_status: {
        Args: { _uid: string }
        Returns: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          avg_response_minutes: number | null
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
          equipment_badges: Json
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          is_public: boolean
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string | null
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
      refresh_provider_score_tier:
        | { Args: { _reason: string; _uid: string }; Returns: Json }
        | {
            Args: { _event_id?: string; _reason?: string; _uid: string }
            Returns: Json
          }
      rehearse_release_attempt_v1: {
        Args: { _authorization_id: string; _simulate_failure_code?: string }
        Returns: Json
      }
      release_booking_hold_v1: {
        Args: {
          p_actor_role?: string
          p_actor_user_id: string
          p_hold_id: string
          p_note?: string
        }
        Returns: undefined
      }
      rename_provider_slug_v1: {
        Args: { _new_slug: string }
        Returns: {
          new_slug: string
          next_change_allowed_at: string
          old_slug: string
        }[]
      }
      request_release_authorization_v1: {
        Args: {
          _booking_id: string
          _reason?: string
          _request_id: string
          _requested_by: string
        }
        Returns: Json
      }
      resolve_dynamic_pricing_config: {
        Args: { _category: string; _country: string }
        Returns: {
          band_bps: Json
          band_thresholds: Json
          country_code: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          max_total_adjustment_bps: number
          min_supply_for_dynamic: number
          same_day_hours: number
          service_category: string | null
          surcharge_holiday_bps: number
          surcharge_same_day_bps: number
          surcharge_urgent_bps: number
          surcharge_weekend_bps: number
          updated_at: string
          urgent_hours: number
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "dynamic_pricing_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_market_minimum: {
        Args: {
          _city?: string
          _country_code: string
          _postcode?: string
          _region?: string
        }
        Returns: Json
      }
      resolve_service_duration_rule: {
        Args: { _country_code: string; _service: string }
        Returns: {
          max_minutes: number
          min_minutes: number
          source: string
        }[]
      }
      resolve_slug_v1: {
        Args: { _slug: string }
        Returns: {
          slug: string
          status: string
        }[]
      }
      resolve_system_alert: {
        Args: { _alert_key: string; _resolver?: string }
        Returns: number
      }
      round_half_away: { Args: { _x: number }; Returns: number }
      save_provider_pricing: { Args: { _payload: Json }; Returns: Json }
      search_marketplace_providers_v1: {
        Args: {
          _country_code?: string
          _language?: string
          _limit?: number
          _max_hourly_rate?: number
          _min_score?: number
          _min_tier?: Database["public"]["Enums"]["provider_tier"]
          _offset?: number
          _search?: string
          _service_category?: string
          _sort?: string
        }
        Returns: {
          approximate_service_area: Json
          avatar_url: string
          average_rating: number
          avg_response_minutes: number
          completed_bookings: number
          country_code: string
          display_name: string
          equipment_badges: Json
          identity_verified_badge: boolean
          languages: string[]
          marketplace_score: number
          price_from: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string
          repeat_customer_badge: boolean
          service_categories: string[]
          service_radius_km: number
          total_count: number
          total_reviews: number
          years_experience: number
          years_on_platform: number
        }[]
      }
      start_provider_application: {
        Args: never
        Returns: {
          activated_at: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          archived_by: string | null
          avg_response_minutes: number | null
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
          equipment_badges: Json
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          is_public: boolean
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string | null
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
          avg_response_minutes: number | null
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
          equipment_badges: Json
          headline: string | null
          hourly_rate: number | null
          identity_status: string
          insurance_doc_path: string | null
          insurance_expires_on: string | null
          insurance_policy_number: string | null
          is_public: boolean
          languages: string[]
          payout_frozen: boolean
          payout_frozen_reason: string | null
          performance_snapshot: Json
          photo_path: string | null
          provider_score: number
          provider_slug: string
          provider_tier: Database["public"]["Enums"]["provider_tier"]
          public_bio: string | null
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
      toggle_favorite_by_slug_v1: { Args: { _slug: string }; Returns: boolean }
      toggle_favorite_provider_v1: {
        Args: { _provider_id: string }
        Returns: boolean
      }
      user_owns_identity: { Args: { _identity_id: string }; Returns: boolean }
      user_owns_provider: { Args: { _provider_id: string }; Returns: boolean }
      validate_booking_interval: {
        Args: {
          _ends_at: string
          _max_minutes?: number
          _min_minutes?: number
          _starts_at: string
        }
        Returns: undefined
      }
      validate_provider_slug_format: {
        Args: { _slug: string }
        Returns: string
      }
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
      booking_assignment_mode: "direct_provider" | "quick_match"
      booking_dispatch_status:
        | "queued"
        | "awaiting_provider"
        | "dispatched"
        | "assigned"
        | "unfulfilled"
        | "cancelled"
      booking_hold_status: "active" | "released" | "expired"
      booking_hold_type:
        | "complaint"
        | "dispute"
        | "refund"
        | "cancellation"
        | "manual"
        | "admin_block"
      booking_payment_flow_version:
        | "destination_charge_v1"
        | "separate_charges_v1"
      booking_payout_status:
        | "pending"
        | "eligible"
        | "attempting"
        | "retry_pending"
        | "transferred"
        | "partially_reversed"
        | "fully_reversed"
        | "settled_no_transfer"
        | "needs_review"
        | "frozen"
        | "disputed"
      booking_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "completed"
      campaign_application_status:
        | "pending"
        | "approved"
        | "rejected"
        | "waiting_list"
        | "withdrawn"
      campaign_block_type:
        | "hero"
        | "text"
        | "image"
        | "cards"
        | "benefits"
        | "testimonials"
        | "faq"
        | "cta"
        | "countdown"
        | "counter"
        | "richtext"
      campaign_event_type:
        | "landing_viewed"
        | "cta_clicked"
        | "application_started"
        | "application_submitted"
        | "application_approved"
        | "application_rejected"
        | "email_verified"
        | "stripe_connected"
        | "identity_verified"
        | "first_booking"
        | "first_completed_job"
        | "first_payout"
        | "campaign_completed"
      campaign_kind:
        | "provider_recruitment"
        | "customer_promo"
        | "referral"
        | "seasonal"
        | "launch"
      campaign_lifecycle:
        | "draft"
        | "scheduled"
        | "pre_launch"
        | "preview"
        | "active"
        | "paused"
        | "ended"
        | "archived"
      campaign_reward_grant_status:
        | "active"
        | "expired"
        | "exhausted"
        | "revoked"
      campaign_reward_type:
        | "commission_discount"
        | "voucher"
        | "cash_bonus"
        | "free_months"
        | "credits"
        | "points"
        | "campaign_badge"
      country_lifecycle_state:
        | "development"
        | "beta"
        | "launch_ready"
        | "active"
        | "suspended"
        | "retired"
      finance_account_class:
        | "asset"
        | "liability"
        | "revenue"
        | "expense"
        | "clearing"
        | "contra_revenue"
        | "contra_liability"
        | "suspense"
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
      ledger_entry_direction: "debit" | "credit"
      offer_status:
        | "pending"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
        | "superseded"
      payment_status:
        | "none"
        | "authorized"
        | "captured"
        | "canceled"
        | "failed"
        | "expired"
        | "refunded"
        | "partially_refunded"
      pricing_demand_band: "very_low" | "low" | "normal" | "high" | "very_high"
      pricing_mode: "static" | "dynamic"
      pricing_quote_context:
        | "customer_checkout"
        | "provider_preview"
        | "admin_preview"
      pricing_quote_status:
        | "quoted"
        | "locked"
        | "expired"
        | "superseded"
        | "void"
      provider_balance_movement_type:
        | "debt_increase"
        | "debt_decrease"
        | "credit_increase"
        | "credit_decrease"
        | "credit_to_debt_offset"
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
      transfer_funding_mode: "source_linked" | "platform_unlinked"
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
      booking_assignment_mode: ["direct_provider", "quick_match"],
      booking_dispatch_status: [
        "queued",
        "awaiting_provider",
        "dispatched",
        "assigned",
        "unfulfilled",
        "cancelled",
      ],
      booking_hold_status: ["active", "released", "expired"],
      booking_hold_type: [
        "complaint",
        "dispute",
        "refund",
        "cancellation",
        "manual",
        "admin_block",
      ],
      booking_payment_flow_version: [
        "destination_charge_v1",
        "separate_charges_v1",
      ],
      booking_payout_status: [
        "pending",
        "eligible",
        "attempting",
        "retry_pending",
        "transferred",
        "partially_reversed",
        "fully_reversed",
        "settled_no_transfer",
        "needs_review",
        "frozen",
        "disputed",
      ],
      booking_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "completed",
      ],
      campaign_application_status: [
        "pending",
        "approved",
        "rejected",
        "waiting_list",
        "withdrawn",
      ],
      campaign_block_type: [
        "hero",
        "text",
        "image",
        "cards",
        "benefits",
        "testimonials",
        "faq",
        "cta",
        "countdown",
        "counter",
        "richtext",
      ],
      campaign_event_type: [
        "landing_viewed",
        "cta_clicked",
        "application_started",
        "application_submitted",
        "application_approved",
        "application_rejected",
        "email_verified",
        "stripe_connected",
        "identity_verified",
        "first_booking",
        "first_completed_job",
        "first_payout",
        "campaign_completed",
      ],
      campaign_kind: [
        "provider_recruitment",
        "customer_promo",
        "referral",
        "seasonal",
        "launch",
      ],
      campaign_lifecycle: [
        "draft",
        "scheduled",
        "pre_launch",
        "preview",
        "active",
        "paused",
        "ended",
        "archived",
      ],
      campaign_reward_grant_status: [
        "active",
        "expired",
        "exhausted",
        "revoked",
      ],
      campaign_reward_type: [
        "commission_discount",
        "voucher",
        "cash_bonus",
        "free_months",
        "credits",
        "points",
        "campaign_badge",
      ],
      country_lifecycle_state: [
        "development",
        "beta",
        "launch_ready",
        "active",
        "suspended",
        "retired",
      ],
      finance_account_class: [
        "asset",
        "liability",
        "revenue",
        "expense",
        "clearing",
        "contra_revenue",
        "contra_liability",
        "suspense",
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
      ledger_entry_direction: ["debit", "credit"],
      offer_status: [
        "pending",
        "viewed",
        "accepted",
        "declined",
        "expired",
        "superseded",
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
      pricing_demand_band: ["very_low", "low", "normal", "high", "very_high"],
      pricing_mode: ["static", "dynamic"],
      pricing_quote_context: [
        "customer_checkout",
        "provider_preview",
        "admin_preview",
      ],
      pricing_quote_status: [
        "quoted",
        "locked",
        "expired",
        "superseded",
        "void",
      ],
      provider_balance_movement_type: [
        "debt_increase",
        "debt_decrease",
        "credit_increase",
        "credit_decrease",
        "credit_to_debt_offset",
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
      transfer_funding_mode: ["source_linked", "platform_unlinked"],
    },
  },
} as const
