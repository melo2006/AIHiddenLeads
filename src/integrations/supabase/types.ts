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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ad_scan_jobs: {
        Row: {
          ads_converted: number
          ads_found: number
          completed_at: string | null
          countries: string[]
          created_at: string
          id: string
          languages: string[]
          last_error: string | null
          location: string | null
          niche: string
          platform_results: Json
          platforms: string[]
          result_limit: number
          status: string
          total_cost_usd: number
          updated_at: string
        }
        Insert: {
          ads_converted?: number
          ads_found?: number
          completed_at?: string | null
          countries?: string[]
          created_at?: string
          id?: string
          languages?: string[]
          last_error?: string | null
          location?: string | null
          niche: string
          platform_results?: Json
          platforms?: string[]
          result_limit?: number
          status?: string
          total_cost_usd?: number
          updated_at?: string
        }
        Update: {
          ads_converted?: number
          ads_found?: number
          completed_at?: string | null
          countries?: string[]
          created_at?: string
          id?: string
          languages?: string[]
          last_error?: string | null
          location?: string | null
          niche?: string
          platform_results?: Json
          platforms?: string[]
          result_limit?: number
          status?: string
          total_cost_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      browser_voice_handoffs: {
        Row: {
          browser_call_sid: string | null
          call_history_id: string
          created_at: string
          expires_at: string
          id: string
          last_error: string | null
          manager_name: string
          organization_id: string | null
          owner_call_sid: string | null
          session_id: string
          status: Database["public"]["Enums"]["call_transfer_status"]
          summary: string
          target_phone: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          browser_call_sid?: string | null
          call_history_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_error?: string | null
          manager_name?: string
          organization_id?: string | null
          owner_call_sid?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["call_transfer_status"]
          summary?: string
          target_phone: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          browser_call_sid?: string | null
          call_history_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          manager_name?: string
          organization_id?: string | null
          owner_call_sid?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["call_transfer_status"]
          summary?: string
          target_phone?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_voice_handoffs_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_voice_handoffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "browser_voice_handoffs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "gemini_voice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_event_logs: {
        Row: {
          call_history_id: string
          created_at: string
          event_source: string
          event_type: string
          id: string
          message: string | null
          occurred_at: string
          payload: Json
        }
        Insert: {
          call_history_id: string
          created_at?: string
          event_source?: string
          event_type: string
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json
        }
        Update: {
          call_history_id?: string
          created_at?: string
          event_source?: string
          event_type?: string
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "call_event_logs_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      call_history: {
        Row: {
          business_name: string
          call_status: string
          caller_email: string | null
          caller_name: string | null
          caller_phone: string | null
          caller_phone_source: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          key_points: Json
          lead_id: string | null
          metadata: Json
          next_step: string | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          prospect_id: string | null
          recording_url: string | null
          retell_call_id: string
          started_at: string
          summary: string | null
          transcript: string | null
          transfer_caller_call_sid: string | null
          transfer_conference_name: string | null
          transfer_error: string | null
          transfer_owner_call_sid: string | null
          transfer_requested: boolean
          transfer_status: Database["public"]["Enums"]["call_transfer_status"]
          transfer_target_phone: string | null
          trigger_source: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          business_name: string
          call_status?: string
          caller_email?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          caller_phone_source?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          key_points?: Json
          lead_id?: string | null
          metadata?: Json
          next_step?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          prospect_id?: string | null
          recording_url?: string | null
          retell_call_id: string
          started_at?: string
          summary?: string | null
          transcript?: string | null
          transfer_caller_call_sid?: string | null
          transfer_conference_name?: string | null
          transfer_error?: string | null
          transfer_owner_call_sid?: string | null
          transfer_requested?: boolean
          transfer_status?: Database["public"]["Enums"]["call_transfer_status"]
          transfer_target_phone?: string | null
          trigger_source?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          business_name?: string
          call_status?: string
          caller_email?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          caller_phone_source?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          key_points?: Json
          lead_id?: string | null
          metadata?: Json
          next_step?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          prospect_id?: string | null
          recording_url?: string | null
          retell_call_id?: string
          started_at?: string
          summary?: string | null
          transcript?: string | null
          transfer_caller_call_sid?: string | null
          transfer_conference_name?: string | null
          transfer_error?: string | null
          transfer_owner_call_sid?: string | null
          transfer_requested?: boolean
          transfer_status?: Database["public"]["Enums"]["call_transfer_status"]
          transfer_target_phone?: string | null
          trigger_source?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_history_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      call_transfer_jobs: {
        Row: {
          attempts: number
          call_history_id: string
          caller_call_sid: string | null
          caller_phone: string | null
          conference_name: string | null
          created_at: string
          id: string
          last_error: string | null
          metadata: Json
          owner_call_sid: string | null
          processed_at: string | null
          requested_at: string
          retell_call_id: string
          status: Database["public"]["Enums"]["call_transfer_status"]
          target_phone: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          call_history_id: string
          caller_call_sid?: string | null
          caller_phone?: string | null
          conference_name?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          owner_call_sid?: string | null
          processed_at?: string | null
          requested_at?: string
          retell_call_id: string
          status?: Database["public"]["Enums"]["call_transfer_status"]
          target_phone: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          call_history_id?: string
          caller_call_sid?: string | null
          caller_phone?: string | null
          conference_name?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          owner_call_sid?: string | null
          processed_at?: string | null
          requested_at?: string
          retell_call_id?: string
          status?: Database["public"]["Enums"]["call_transfer_status"]
          target_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_transfer_jobs_call_history_id_fkey"
            columns: ["call_history_id"]
            isOneToOne: false
            referencedRelation: "call_history"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sequence_steps: {
        Row: {
          clicked_count: number
          created_at: string
          delay_days: number
          email_subject: string
          email_template: string
          id: string
          opened_count: number
          sent_count: number
          sequence_id: string
          step_number: number
          template_variables: Json
          updated_at: string
        }
        Insert: {
          clicked_count?: number
          created_at?: string
          delay_days?: number
          email_subject: string
          email_template?: string
          id?: string
          opened_count?: number
          sent_count?: number
          sequence_id: string
          step_number?: number
          template_variables?: Json
          updated_at?: string
        }
        Update: {
          clicked_count?: number
          created_at?: string
          delay_days?: number
          email_subject?: string
          email_template?: string
          id?: string
          opened_count?: number
          sent_count?: number
          sequence_id?: string
          step_number?: number
          template_variables?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "campaign_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sequences: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_visit_events: {
        Row: {
          campaign: string
          created_at: string
          event: string
          id: string
          path: string
          source: string
          visit_id: string
        }
        Insert: {
          campaign?: string
          created_at?: string
          event: string
          id?: string
          path: string
          source?: string
          visit_id: string
        }
        Update: {
          campaign?: string
          created_at?: string
          event?: string
          id?: string
          path?: string
          source?: string
          visit_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          created_at: string
          demos_viewed: number | null
          description: string | null
          emails_clicked: number | null
          emails_opened: number | null
          emails_sent: number | null
          id: string
          name: string
          niche: string | null
          prospect_count: number | null
          sms_sent: number | null
          status: string
          target_filters: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          demos_viewed?: number | null
          description?: string | null
          emails_clicked?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          name: string
          niche?: string | null
          prospect_count?: number | null
          sms_sent?: number | null
          status?: string
          target_filters?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          demos_viewed?: number | null
          description?: string | null
          emails_clicked?: number | null
          emails_opened?: number | null
          emails_sent?: number | null
          id?: string
          name?: string
          niche?: string | null
          prospect_count?: number | null
          sms_sent?: number | null
          status?: string
          target_filters?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_copy_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          record_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          record_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          record_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_copy_links_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "conversation_records"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_records: {
        Row: {
          agent_id: string | null
          audio_paths: Json
          business_name: string
          channel: string
          copy_requested_at: string | null
          copy_sent_at: string | null
          created_at: string
          ended_at: string | null
          id: string
          recipient_email: string | null
          recipient_name: string | null
          recording_agreed_at: string | null
          session_ref: string
          status: string
          summary: Json | null
          summary_error: string | null
          summary_status: string
          transcript: Json
        }
        Insert: {
          agent_id?: string | null
          audio_paths?: Json
          business_name?: string
          channel: string
          copy_requested_at?: string | null
          copy_sent_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          recording_agreed_at?: string | null
          session_ref: string
          status?: string
          summary?: Json | null
          summary_error?: string | null
          summary_status?: string
          transcript?: Json
        }
        Update: {
          agent_id?: string | null
          audio_paths?: Json
          business_name?: string
          channel?: string
          copy_requested_at?: string | null
          copy_sent_at?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          recording_agreed_at?: string | null
          session_ref?: string
          status?: string
          summary?: Json | null
          summary_error?: string | null
          summary_status?: string
          transcript?: Json
        }
        Relationships: []
      }
      customer_workspaces: {
        Row: {
          agent_id: string
          created_at: string
          environment: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          environment: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          environment?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_workspaces_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_call_attempts: {
        Row: {
          allowed: boolean
          blocked_reason: string | null
          business_name: string | null
          created_at: string
          id: string
          ip_address: string | null
          max_call_seconds: number | null
          visitor_key: string | null
          website_url: string | null
        }
        Insert: {
          allowed?: boolean
          blocked_reason?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          max_call_seconds?: number | null
          visitor_key?: string | null
          website_url?: string | null
        }
        Update: {
          allowed?: boolean
          blocked_reason?: string | null
          business_name?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          max_call_seconds?: number | null
          visitor_key?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      demo_chat_interactions: {
        Row: {
          ai_interest_summary: string | null
          business_name: string
          caller_email: string | null
          caller_name: string | null
          caller_phone: string | null
          content: string
          created_at: string
          id: string
          lead_id: string | null
          prospect_id: string | null
          role: string
          session_id: string
          website_url: string | null
        }
        Insert: {
          ai_interest_summary?: string | null
          business_name: string
          caller_email?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id?: string | null
          prospect_id?: string | null
          role?: string
          session_id: string
          website_url?: string | null
        }
        Update: {
          ai_interest_summary?: string | null
          business_name?: string
          caller_email?: string | null
          caller_name?: string | null
          caller_phone?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          prospect_id?: string | null
          role?: string
          session_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_chat_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demo_chat_interactions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      gemini_voice_sessions: {
        Row: {
          agent_id: string | null
          config: Json
          consumed: boolean
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          expires_at: string
          id: string
          last_activity_at: string | null
          last_error: string | null
          lead_id: string | null
          max_seconds: number
          organization_id: string | null
          prospect_id: string | null
          started_at: string | null
          status: string
          token_hash: string
          transcript: Json
          usage: Json | null
          visitor_hash: string
        }
        Insert: {
          agent_id?: string | null
          config: Json
          consumed?: boolean
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          last_activity_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          max_seconds?: number
          organization_id?: string | null
          prospect_id?: string | null
          started_at?: string | null
          status?: string
          token_hash: string
          transcript?: Json
          usage?: Json | null
          visitor_hash: string
        }
        Update: {
          agent_id?: string | null
          config?: Json
          consumed?: boolean
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          last_activity_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          max_seconds?: number
          organization_id?: string | null
          prospect_id?: string | null
          started_at?: string | null
          status?: string
          token_hash?: string
          transcript?: Json
          usage?: Json | null
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "gemini_voice_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gemini_voice_sessions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gemini_voice_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gemini_voice_sessions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      implementation_calls: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          slot_start: string
          status: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          slot_start: string
          status?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          slot_start?: string
          status?: string
        }
        Relationships: []
      }
      imported_leads: {
        Row: {
          ai_chatbot_detected: boolean | null
          business_name: string
          category: string | null
          city: string | null
          created_at: string
          demo_sent: boolean | null
          demo_sent_at: string | null
          demo_viewed_at: string | null
          email: string | null
          id: string
          lead_score: string | null
          list_id: string
          notes: string | null
          phone: string | null
          phone_type: string | null
          social_media_score: number | null
          state: string | null
          status: string | null
          updated_at: string
          website_quality_score: number | null
          website_url: string | null
        }
        Insert: {
          ai_chatbot_detected?: boolean | null
          business_name: string
          category?: string | null
          city?: string | null
          created_at?: string
          demo_sent?: boolean | null
          demo_sent_at?: string | null
          demo_viewed_at?: string | null
          email?: string | null
          id?: string
          lead_score?: string | null
          list_id: string
          notes?: string | null
          phone?: string | null
          phone_type?: string | null
          social_media_score?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string
          website_quality_score?: number | null
          website_url?: string | null
        }
        Update: {
          ai_chatbot_detected?: boolean | null
          business_name?: string
          category?: string | null
          city?: string | null
          created_at?: string
          demo_sent?: boolean | null
          demo_sent_at?: string | null
          demo_viewed_at?: string | null
          email?: string | null
          id?: string
          lead_score?: string | null
          list_id?: string
          notes?: string | null
          phone?: string | null
          phone_type?: string | null
          social_media_score?: number | null
          state?: string | null
          status?: string | null
          updated_at?: string
          website_quality_score?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "imported_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          lead_count: number
          name: string
          niche: string | null
          source_filename: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          lead_count?: number
          name: string
          niche?: string | null
          source_filename?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          lead_count?: number
          name?: string
          niche?: string | null
          source_filename?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      intent_leads: {
        Row: {
          added_to_crm: boolean
          ai_recommended_services: string | null
          ai_summary: string | null
          author_name: string | null
          author_profile_url: string | null
          created_at: string
          id: string
          intent_category: string | null
          intent_score: number
          is_dismissed: boolean
          lead_temperature: string
          location: string | null
          niche: string
          post_content: string | null
          post_title: string | null
          posted_at: string | null
          search_location: string | null
          search_niche: string | null
          search_query: string | null
          source_platform: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          added_to_crm?: boolean
          ai_recommended_services?: string | null
          ai_summary?: string | null
          author_name?: string | null
          author_profile_url?: string | null
          created_at?: string
          id?: string
          intent_category?: string | null
          intent_score?: number
          is_dismissed?: boolean
          lead_temperature?: string
          location?: string | null
          niche: string
          post_content?: string | null
          post_title?: string | null
          posted_at?: string | null
          search_location?: string | null
          search_niche?: string | null
          search_query?: string | null
          source_platform?: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          added_to_crm?: boolean
          ai_recommended_services?: string | null
          ai_summary?: string | null
          author_name?: string | null
          author_profile_url?: string | null
          created_at?: string
          id?: string
          intent_category?: string | null
          intent_score?: number
          is_dismissed?: boolean
          lead_temperature?: string
          location?: string | null
          niche?: string
          post_content?: string | null
          post_title?: string | null
          posted_at?: string | null
          search_location?: string | null
          search_niche?: string | null
          search_query?: string | null
          source_platform?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          brand_colors: Json | null
          brand_fonts: Json | null
          brand_logo: string | null
          business_name: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          niche: string
          phone: string | null
          scan_status: string
          screenshot_mobile: string | null
          screenshot_tablet: string | null
          secondary_url: string | null
          status: string
          updated_at: string
          uploaded_files: Json | null
          website_content: string | null
          website_description: string | null
          website_screenshot: string | null
          website_title: string | null
          website_url: string
        }
        Insert: {
          brand_colors?: Json | null
          brand_fonts?: Json | null
          brand_logo?: string | null
          business_name: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          niche?: string
          phone?: string | null
          scan_status?: string
          screenshot_mobile?: string | null
          screenshot_tablet?: string | null
          secondary_url?: string | null
          status?: string
          updated_at?: string
          uploaded_files?: Json | null
          website_content?: string | null
          website_description?: string | null
          website_screenshot?: string | null
          website_title?: string | null
          website_url: string
        }
        Update: {
          brand_colors?: Json | null
          brand_fonts?: Json | null
          brand_logo?: string | null
          business_name?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          niche?: string
          phone?: string | null
          scan_status?: string
          screenshot_mobile?: string | null
          screenshot_tablet?: string | null
          secondary_url?: string | null
          status?: string
          updated_at?: string
          uploaded_files?: Json | null
          website_content?: string | null
          website_description?: string | null
          website_screenshot?: string | null
          website_title?: string | null
          website_url?: string
        }
        Relationships: []
      }
      prospect_enrichment_job_items: {
        Row: {
          attempts: number
          completed_at: string | null
          cost: Json
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          order_index: number
          prospect_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["prospect_enrichment_item_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          cost?: Json
          created_at?: string
          id?: string
          job_id: string
          last_error?: string | null
          order_index?: number
          prospect_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["prospect_enrichment_item_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          cost?: Json
          created_at?: string
          id?: string
          job_id?: string
          last_error?: string | null
          order_index?: number
          prospect_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["prospect_enrichment_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_enrichment_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "prospect_enrichment_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospect_enrichment_job_items_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_enrichment_jobs: {
        Row: {
          api_totals: Json
          auto_resume: boolean
          completed: number
          created_at: string
          current_prospect_id: string | null
          current_prospect_name: string | null
          emails_found: number
          failed: number
          finished_at: string | null
          id: string
          label: string | null
          last_error: string | null
          last_heartbeat_at: string | null
          pause_requested: boolean
          phase: string
          phones_classified: number
          recent_events: Json
          sms_ready: number
          started_at: string | null
          status: Database["public"]["Enums"]["prospect_enrichment_job_status"]
          stop_requested: boolean
          total: number
          total_cost_usd: number
          updated_at: string
        }
        Insert: {
          api_totals?: Json
          auto_resume?: boolean
          completed?: number
          created_at?: string
          current_prospect_id?: string | null
          current_prospect_name?: string | null
          emails_found?: number
          failed?: number
          finished_at?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_heartbeat_at?: string | null
          pause_requested?: boolean
          phase?: string
          phones_classified?: number
          recent_events?: Json
          sms_ready?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["prospect_enrichment_job_status"]
          stop_requested?: boolean
          total?: number
          total_cost_usd?: number
          updated_at?: string
        }
        Update: {
          api_totals?: Json
          auto_resume?: boolean
          completed?: number
          created_at?: string
          current_prospect_id?: string | null
          current_prospect_name?: string | null
          emails_found?: number
          failed?: number
          finished_at?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_heartbeat_at?: string | null
          pause_requested?: boolean
          phase?: string
          phones_classified?: number
          recent_events?: Json
          sms_ready?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["prospect_enrichment_job_status"]
          stop_requested?: boolean
          total?: number
          total_cost_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_enrichment_jobs_current_prospect_id_fkey"
            columns: ["current_prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_sequence_enrollments: {
        Row: {
          created_at: string
          current_step: number
          enrolled_at: string
          id: string
          last_sent_at: string | null
          next_send_at: string | null
          prospect_id: string
          sequence_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          next_send_at?: string | null
          prospect_id: string
          sequence_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          next_send_at?: string | null
          prospect_id?: string
          sequence_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "campaign_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          ai_analysis: string | null
          ai_analyzed: boolean | null
          business_data: Json | null
          business_name: string
          business_types: Json | null
          campaign_id: string | null
          city: string | null
          contact_method: string | null
          country: string | null
          created_at: string
          demo_link: string | null
          demo_viewed_at: string | null
          do_not_contact: boolean
          email: string | null
          email_clicked_at: string | null
          email_opened_at: string | null
          email_sent_at: string | null
          facebook_url: string | null
          formatted_address: string | null
          google_maps_url: string | null
          has_chat_widget: boolean | null
          has_online_booking: boolean | null
          has_voice_ai: boolean | null
          has_website: boolean | null
          id: string
          instagram_url: string | null
          last_contacted_at: string | null
          lead_score: number | null
          lead_temperature: string | null
          linkedin_url: string | null
          location_lat: number | null
          location_lng: number | null
          niche: string | null
          notes: string | null
          opening_hours: Json | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          phone: string | null
          phone_type: string | null
          photos: Json | null
          pipeline_stage: string
          place_id: string
          primary_type: string | null
          rating: number | null
          review_count: number | null
          search_location: string | null
          search_query: string | null
          search_radius: number | null
          sms_capable: boolean | null
          sms_clicked_at: string | null
          sms_sent_at: string | null
          social_profiles: Json | null
          state: string | null
          status: string | null
          tags: Json | null
          updated_at: string
          website_quality_score: number | null
          website_screenshot: string | null
          website_url: string | null
          whatsapp_number: string | null
          zip_code: string | null
        }
        Insert: {
          ai_analysis?: string | null
          ai_analyzed?: boolean | null
          business_data?: Json | null
          business_name: string
          business_types?: Json | null
          campaign_id?: string | null
          city?: string | null
          contact_method?: string | null
          country?: string | null
          created_at?: string
          demo_link?: string | null
          demo_viewed_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          email_clicked_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          facebook_url?: string | null
          formatted_address?: string | null
          google_maps_url?: string | null
          has_chat_widget?: boolean | null
          has_online_booking?: boolean | null
          has_voice_ai?: boolean | null
          has_website?: boolean | null
          id?: string
          instagram_url?: string | null
          last_contacted_at?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          linkedin_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          niche?: string | null
          notes?: string | null
          opening_hours?: Json | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          phone_type?: string | null
          photos?: Json | null
          pipeline_stage?: string
          place_id: string
          primary_type?: string | null
          rating?: number | null
          review_count?: number | null
          search_location?: string | null
          search_query?: string | null
          search_radius?: number | null
          sms_capable?: boolean | null
          sms_clicked_at?: string | null
          sms_sent_at?: string | null
          social_profiles?: Json | null
          state?: string | null
          status?: string | null
          tags?: Json | null
          updated_at?: string
          website_quality_score?: number | null
          website_screenshot?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
          zip_code?: string | null
        }
        Update: {
          ai_analysis?: string | null
          ai_analyzed?: boolean | null
          business_data?: Json | null
          business_name?: string
          business_types?: Json | null
          campaign_id?: string | null
          city?: string | null
          contact_method?: string | null
          country?: string | null
          created_at?: string
          demo_link?: string | null
          demo_viewed_at?: string | null
          do_not_contact?: boolean
          email?: string | null
          email_clicked_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          facebook_url?: string | null
          formatted_address?: string | null
          google_maps_url?: string | null
          has_chat_widget?: boolean | null
          has_online_booking?: boolean | null
          has_voice_ai?: boolean | null
          has_website?: boolean | null
          id?: string
          instagram_url?: string | null
          last_contacted_at?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          linkedin_url?: string | null
          location_lat?: number | null
          location_lng?: number | null
          niche?: string | null
          notes?: string | null
          opening_hours?: Json | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone?: string | null
          phone_type?: string | null
          photos?: Json | null
          pipeline_stage?: string
          place_id?: string
          primary_type?: string | null
          rating?: number | null
          review_count?: number | null
          search_location?: string | null
          search_query?: string | null
          search_radius?: number | null
          sms_capable?: boolean | null
          sms_clicked_at?: string | null
          sms_sent_at?: string | null
          social_profiles?: Json | null
          state?: string | null
          status?: string | null
          tags?: Json | null
          updated_at?: string
          website_quality_score?: number | null
          website_screenshot?: string | null
          website_url?: string | null
          whatsapp_number?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      rank_scan_cache: {
        Row: {
          business_name: string
          cache_key: string
          city: string | null
          created_at: string
          id: string
          keyword: string
          result: Json
          scan_mode: string
        }
        Insert: {
          business_name: string
          cache_key: string
          city?: string | null
          created_at?: string
          id?: string
          keyword: string
          result: Json
          scan_mode: string
        }
        Update: {
          business_name?: string
          cache_key?: string
          city?: string | null
          created_at?: string
          id?: string
          keyword?: string
          result?: Json
          scan_mode?: string
        }
        Relationships: []
      }
      scraped_ads: {
        Row: {
          ad_country: string | null
          ad_creative_text: string | null
          ad_id: string | null
          ad_media_url: string | null
          advertiser_handle: string | null
          advertiser_name: string
          approval_status: string
          comment_template: string | null
          created_at: string
          cta_text: string | null
          detected_language: string | null
          engagement_status: string | null
          id: string
          landing_url: string
          metadata: Json
          platform: string
          posted_at: string | null
          prospect_id: string | null
          scan_job_id: string | null
          source_ad_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ad_country?: string | null
          ad_creative_text?: string | null
          ad_id?: string | null
          ad_media_url?: string | null
          advertiser_handle?: string | null
          advertiser_name: string
          approval_status?: string
          comment_template?: string | null
          created_at?: string
          cta_text?: string | null
          detected_language?: string | null
          engagement_status?: string | null
          id?: string
          landing_url: string
          metadata?: Json
          platform: string
          posted_at?: string | null
          prospect_id?: string | null
          scan_job_id?: string | null
          source_ad_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ad_country?: string | null
          ad_creative_text?: string | null
          ad_id?: string | null
          ad_media_url?: string | null
          advertiser_handle?: string | null
          advertiser_name?: string
          approval_status?: string
          comment_template?: string | null
          created_at?: string
          cta_text?: string | null
          detected_language?: string | null
          engagement_status?: string | null
          id?: string
          landing_url?: string
          metadata?: Json
          platform?: string
          posted_at?: string | null
          prospect_id?: string | null
          scan_job_id?: string | null
          source_ad_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraped_ads_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "ad_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraping_usage: {
        Row: {
          ai_calls: number
          created_at: string
          estimated_cost_usd: number
          firecrawl_calls: number
          id: string
          leads_found: number
          location: string | null
          niche: string | null
          platforms_used: string[] | null
          scan_type: string
        }
        Insert: {
          ai_calls?: number
          created_at?: string
          estimated_cost_usd?: number
          firecrawl_calls?: number
          id?: string
          leads_found?: number
          location?: string | null
          niche?: string | null
          platforms_used?: string[] | null
          scan_type?: string
        }
        Update: {
          ai_calls?: number
          created_at?: string
          estimated_cost_usd?: number
          firecrawl_calls?: number
          id?: string
          leads_found?: number
          location?: string | null
          niche?: string | null
          platforms_used?: string[] | null
          scan_type?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          click_count: number
          created_at: string
          id: string
          last_clicked_at: string | null
          prospect_id: string | null
          scraped_ad_id: string | null
          slug: string
          target_url: string
          updated_at: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          id?: string
          last_clicked_at?: string | null
          prospect_id?: string | null
          scraped_ad_id?: string | null
          slug: string
          target_url: string
          updated_at?: string
        }
        Update: {
          click_count?: number
          created_at?: string
          id?: string
          last_clicked_at?: string | null
          prospect_id?: string | null
          scraped_ad_id?: string | null
          slug?: string
          target_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_delivery_log: {
        Row: {
          body: string | null
          created_at: string
          delivered_at: string | null
          error_code: string | null
          error_message: string | null
          from_phone: string | null
          id: string
          is_opt_out: boolean
          is_test: boolean
          message_sid: string | null
          price_usd: number | null
          prospect_id: string | null
          segments: number | null
          sent_at: string
          status: string
          template_id: string | null
          to_phone: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          from_phone?: string | null
          id?: string
          is_opt_out?: boolean
          is_test?: boolean
          message_sid?: string | null
          price_usd?: number | null
          prospect_id?: string | null
          segments?: number | null
          sent_at?: string
          status?: string
          template_id?: string | null
          to_phone: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          from_phone?: string | null
          id?: string
          is_opt_out?: boolean
          is_test?: boolean
          message_sid?: string | null
          price_usd?: number | null
          prospect_id?: string | null
          segments?: number | null
          sent_at?: string
          status?: string
          template_id?: string | null
          to_phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_delivery_log_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_opt_outs: {
        Row: {
          created_at: string
          id: string
          phone: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          phone: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string
          reason?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      voice_agent_sources: {
        Row: {
          agent_id: string
          content: string | null
          created_at: string
          id: string
          kind: string
          label: string
          last_error: string | null
          refreshed_at: string | null
          status: string
          storage_path: string | null
          url: string | null
        }
        Insert: {
          agent_id: string
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          last_error?: string | null
          refreshed_at?: string | null
          status?: string
          storage_path?: string | null
          url?: string | null
        }
        Update: {
          agent_id?: string
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          last_error?: string | null
          refreshed_at?: string | null
          status?: string
          storage_path?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_sources_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_versions: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          id: string
          version: number
        }
        Insert: {
          agent_id: string
          config: Json
          created_at?: string
          id?: string
          version: number
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agents: {
        Row: {
          created_at: string
          draft: Json
          id: string
          organization_id: string
          published: Json | null
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          draft?: Json
          id?: string
          organization_id: string
          published?: Json | null
          slug?: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          draft?: Json
          id?: string
          organization_id?: string
          published?: Json | null
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "voice_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_demo_shares: {
        Row: {
          agent_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_demo_shares_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "voice_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_guardrails: {
        Row: {
          created_at: string
          enabled: boolean
          estimated_cost_per_minute: number
          gemini_pricing: Json
          id: string
          max_call_seconds: number
          max_calls_per_day_total: number
          max_calls_per_visitor_per_day: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          estimated_cost_per_minute?: number
          gemini_pricing?: Json
          id?: string
          max_call_seconds?: number
          max_calls_per_day_total?: number
          max_calls_per_visitor_per_day?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          estimated_cost_per_minute?: number
          gemini_pricing?: Json
          id?: string
          max_call_seconds?: number
          max_calls_per_day_total?: number
          max_calls_per_visitor_per_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      voice_memberships: {
        Row: {
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      voice_platform_roles: {
        Row: {
          role: string
          user_id: string
        }
        Insert: {
          role?: string
          user_id: string
        }
        Update: {
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      implementation_call_slots: {
        Row: {
          slot_start: string | null
        }
        Insert: {
          slot_start?: string | null
        }
        Update: {
          slot_start?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_browser_handoff: {
        Args: {
          _error?: string
          _expected: Database["public"]["Enums"]["call_transfer_status"][]
          _id: string
          _next: Database["public"]["Enums"]["call_transfer_status"]
        }
        Returns: boolean
      }
      authorize_gemini_session: {
        Args: {
          _agent?: string
          _config: Json
          _lead?: string
          _org?: string
          _prospect?: string
          _token: string
          _visitor: string
        }
        Returns: string
      }
      can_manage_voice: { Args: { _org: string }; Returns: boolean }
      claim_next_prospect_enrichment_items: {
        Args: { _job_id: string; _limit?: number }
        Returns: {
          attempts: number
          completed_at: string | null
          cost: Json
          created_at: string
          id: string
          job_id: string
          last_error: string | null
          order_index: number
          prospect_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["prospect_enrichment_item_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "prospect_enrichment_job_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_gemini_session: {
        Args: { _token: string }
        Returns: {
          agent_id: string | null
          config: Json
          consumed: boolean
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          expires_at: string
          id: string
          last_activity_at: string | null
          last_error: string | null
          lead_id: string | null
          max_seconds: number
          organization_id: string | null
          prospect_id: string | null
          started_at: string | null
          status: string
          token_hash: string
          transcript: Json
          usage: Json | null
          visitor_hash: string
        }[]
        SetofOptions: {
          from: "*"
          to: "gemini_voice_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_demo_lead: {
        Args: {
          _business_name: string
          _email: string
          _full_name: string
          _niche?: string
          _phone: string
          _scan_status?: string
          _secondary_url?: string
          _website_url: string
        }
        Returns: string
      }
      get_demo_lead: {
        Args: { _lead_id: string }
        Returns: {
          brand_colors: Json
          brand_logo: string
          business_name: string
          email: string
          full_name: string
          id: string
          niche: string
          phone: string
          scan_status: string
          screenshot_mobile: string
          screenshot_tablet: string
          updated_at: string
          website_content: string
          website_description: string
          website_screenshot: string
          website_title: string
          website_url: string
        }[]
      }
      get_demo_prospect_owner: {
        Args: { _id: string }
        Returns: {
          owner_email: string
          owner_name: string
          owner_phone: string
        }[]
      }
      is_admin_email: { Args: { _email: string }; Returns: boolean }
      is_voice_admin: { Args: never; Returns: boolean }
      provision_paid_workspace: {
        Args: { _config: Json; _env: string; _user: string }
        Returns: string
      }
      refresh_prospect_enrichment_job: {
        Args: { _job_id: string }
        Returns: {
          api_totals: Json
          auto_resume: boolean
          completed: number
          created_at: string
          current_prospect_id: string | null
          current_prospect_name: string | null
          emails_found: number
          failed: number
          finished_at: string | null
          id: string
          label: string | null
          last_error: string | null
          last_heartbeat_at: string | null
          pause_requested: boolean
          phase: string
          phones_classified: number
          recent_events: Json
          sms_ready: number
          started_at: string | null
          status: Database["public"]["Enums"]["prospect_enrichment_job_status"]
          stop_requested: boolean
          total: number
          total_cost_usd: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "prospect_enrichment_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      requeue_stalled_prospect_enrichment_items: {
        Args: { _stale_minutes?: number }
        Returns: number
      }
      set_demo_lead_uploads: {
        Args: { _lead_id: string; _uploaded_files: string[] }
        Returns: boolean
      }
    }
    Enums: {
      call_transfer_status:
        | "not_requested"
        | "queued"
        | "dialing_caller"
        | "dialing_owner"
        | "awaiting_owner"
        | "joined"
        | "completed"
        | "failed"
        | "cancelled"
      prospect_enrichment_item_status:
        | "queued"
        | "processing"
        | "completed"
        | "failed"
      prospect_enrichment_job_status:
        | "queued"
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "stopped"
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
      call_transfer_status: [
        "not_requested",
        "queued",
        "dialing_caller",
        "dialing_owner",
        "awaiting_owner",
        "joined",
        "completed",
        "failed",
        "cancelled",
      ],
      prospect_enrichment_item_status: [
        "queued",
        "processing",
        "completed",
        "failed",
      ],
      prospect_enrichment_job_status: [
        "queued",
        "running",
        "paused",
        "completed",
        "failed",
        "stopped",
      ],
    },
  },
} as const
