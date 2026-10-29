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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      card_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          no: number
          note_id: string
          resolved_at: string | null
          resolved_by_proposal: string | null
          status: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          no?: never
          note_id: string
          resolved_at?: string | null
          resolved_by_proposal?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          no?: never
          note_id?: string
          resolved_at?: string | null
          resolved_by_proposal?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_comments_user_id_note_id_fkey"
            columns: ["user_id", "note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "card_comments_user_id_resolved_by_proposal_fkey"
            columns: ["user_id", "resolved_by_proposal"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      cards: {
        Row: {
          created_at: string
          difficulty: number
          due: string
          id: string
          lapses: number
          last_review: string | null
          note_id: string
          ord: number
          reps: number
          stability: number
          state: number
          step: number
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due?: string
          id?: string
          lapses?: number
          last_review?: string | null
          note_id: string
          ord: number
          reps?: number
          stability?: number
          state?: number
          step?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due?: string
          id?: string
          lapses?: number
          last_review?: string | null
          note_id?: string
          ord?: number
          reps?: number
          stability?: number
          state?: number
          step?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_user_id_note_id_fkey"
            columns: ["user_id", "note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      checkpoint_concepts: {
        Row: {
          checkpoint_id: string
          concept_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          checkpoint_id: string
          concept_id: string
          created_at?: string
          user_id?: string
        }
        Update: {
          checkpoint_id?: string
          concept_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_concepts_user_id_checkpoint_id_fkey"
            columns: ["user_id", "checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "checkpoint_concepts_user_id_concept_id_fkey"
            columns: ["user_id", "concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      checkpoint_prereqs: {
        Row: {
          checkpoint_id: string
          created_at: string
          prereq_id: string
          user_id: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string
          prereq_id: string
          user_id?: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string
          prereq_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoint_prereqs_user_id_checkpoint_id_fkey"
            columns: ["user_id", "checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "checkpoint_prereqs_user_id_prereq_id_fkey"
            columns: ["user_id", "prereq_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          code: string
          created_at: string
          criterion: string
          current_step: number
          demonstrated_at: string | null
          id: string
          needs_revisit: boolean
          objective: string
          pages: string | null
          position: number
          project_id: string
          recheck_due: string | null
          recheck_level: number
          recheck_prompt: string | null
          source_id: string | null
          status: string
          steps: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          criterion: string
          current_step?: number
          demonstrated_at?: string | null
          id?: string
          needs_revisit?: boolean
          objective: string
          pages?: string | null
          position: number
          project_id: string
          recheck_due?: string | null
          recheck_level?: number
          recheck_prompt?: string | null
          source_id?: string | null
          status?: string
          steps?: Json
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          code?: string
          created_at?: string
          criterion?: string
          current_step?: number
          demonstrated_at?: string | null
          id?: string
          needs_revisit?: boolean
          objective?: string
          pages?: string | null
          position?: number
          project_id?: string
          recheck_due?: string | null
          recheck_level?: number
          recheck_prompt?: string | null
          source_id?: string | null
          status?: string
          steps?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "checkpoints_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      concept_links: {
        Row: {
          created_at: string
          from_id: string
          kind: string
          to_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          kind: string
          to_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          from_id?: string
          kind?: string
          to_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concept_links_user_id_from_id_fkey"
            columns: ["user_id", "from_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "concept_links_user_id_to_id_fkey"
            columns: ["user_id", "to_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      concepts: {
        Row: {
          blurb: string | null
          created_at: string
          id: string
          name: string
          pin_x: number | null
          pin_y: number | null
          slug: string
          subject_id: string
          user_id: string
        }
        Insert: {
          blurb?: string | null
          created_at?: string
          id?: string
          name: string
          pin_x?: number | null
          pin_y?: number | null
          slug: string
          subject_id: string
          user_id?: string
        }
        Update: {
          blurb?: string | null
          created_at?: string
          id?: string
          name?: string
          pin_x?: number | null
          pin_y?: number | null
          slug?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_user_id_subject_id_fkey"
            columns: ["user_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      misconceptions: {
        Row: {
          concept_id: string | null
          created_at: string
          id: string
          label: string
          last_seen_at: string
          project_id: string
          resolved_at: string | null
          times: number
          user_id: string
        }
        Insert: {
          concept_id?: string | null
          created_at?: string
          id?: string
          label: string
          last_seen_at?: string
          project_id: string
          resolved_at?: string | null
          times?: number
          user_id?: string
        }
        Update: {
          concept_id?: string | null
          created_at?: string
          id?: string
          label?: string
          last_seen_at?: string
          project_id?: string
          resolved_at?: string | null
          times?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "misconceptions_user_id_concept_id_fkey"
            columns: ["user_id", "concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "misconceptions_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      notes: {
        Row: {
          back: string
          checkpoint_id: string | null
          concept_id: string | null
          created_at: string
          front: string
          id: string
          kind: string
          no: number
          origin: string
          page_label: string | null
          project_id: string
          session_id: string | null
          source_id: string | null
          status: string
          tags: string[]
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back?: string
          checkpoint_id?: string | null
          concept_id?: string | null
          created_at?: string
          front: string
          id?: string
          kind?: string
          no?: never
          origin?: string
          page_label?: string | null
          project_id: string
          session_id?: string | null
          source_id?: string | null
          status?: string
          tags?: string[]
          type?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          back?: string
          checkpoint_id?: string | null
          concept_id?: string | null
          created_at?: string
          front?: string
          id?: string
          kind?: string
          no?: never
          origin?: string
          page_label?: string | null
          project_id?: string
          session_id?: string | null
          source_id?: string | null
          status?: string
          tags?: string[]
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_user_id_checkpoint_id_fkey"
            columns: ["user_id", "checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "notes_user_id_concept_id_fkey"
            columns: ["user_id", "concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "notes_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "notes_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "notes_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          goal: string
          id: string
          last_activity_at: string | null
          next_session_number: number
          slug: string
          status: string
          style: string
          subject_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          last_activity_at?: string | null
          next_session_number?: number
          slug: string
          status?: string
          style?: string
          subject_id: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          last_activity_at?: string | null
          next_session_number?: number
          slug?: string
          status?: string
          style?: string
          subject_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_subject_id_fkey"
            columns: ["user_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          id: string
          kind: string
          no: number
          origin: string
          payload: Json
          project_id: string
          reason: string | null
          result: Json | null
          session_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: string
          no?: never
          origin: string
          payload: Json
          project_id: string
          reason?: string | null
          result?: Json | null
          session_id?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: string
          no?: never
          origin?: string
          payload?: Json
          project_id?: string
          reason?: string | null
          result?: Json | null
          session_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "proposals_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      reviews: {
        Row: {
          card_id: string
          confidence: string | null
          created_at: string
          duration_ms: number
          id: number
          prev: Json
          rating: number
          reviewed_at: string
          state_before: number
          undone_at: string | null
          user_id: string
        }
        Insert: {
          card_id: string
          confidence?: string | null
          created_at?: string
          duration_ms: number
          id?: never
          prev: Json
          rating: number
          reviewed_at?: string
          state_before: number
          undone_at?: string | null
          user_id?: string
        }
        Update: {
          card_id?: string
          confidence?: string | null
          created_at?: string
          duration_ms?: number
          id?: never
          prev?: Json
          rating?: number
          reviewed_at?: string
          state_before?: number
          undone_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_card_id_fkey"
            columns: ["user_id", "card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "reviews_user_id_card_id_fkey"
            columns: ["user_id", "card_id"]
            isOneToOne: false
            referencedRelation: "v_due_cards"
            referencedColumns: ["user_id", "card_id"]
          },
        ]
      }
      session_events: {
        Row: {
          body: string
          checkpoint_id: string | null
          created_at: string
          hint_level: number | null
          id: number
          kind: string
          outcome: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          body: string
          checkpoint_id?: string | null
          created_at?: string
          hint_level?: number | null
          id?: never
          kind: string
          outcome?: string | null
          session_id: string
          user_id?: string
        }
        Update: {
          body?: string
          checkpoint_id?: string | null
          created_at?: string
          hint_level?: number | null
          id?: never
          kind?: string
          outcome?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_user_id_checkpoint_id_fkey"
            columns: ["user_id", "checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "session_events_user_id_session_id_fkey"
            columns: ["user_id", "session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      sessions: {
        Row: {
          checkpoint_id: string | null
          client: string
          created_at: string
          ended_at: string | null
          goal: string
          goal_met: string | null
          id: string
          last_activity_at: string
          minutes: number | null
          number: number
          project_id: string
          resume_note: string | null
          resume_question: string | null
          resume_step: number | null
          started_at: string
          state: string
          style: string
          summary: string | null
          user_id: string
        }
        Insert: {
          checkpoint_id?: string | null
          client?: string
          created_at?: string
          ended_at?: string | null
          goal: string
          goal_met?: string | null
          id?: string
          last_activity_at?: string
          minutes?: number | null
          number: number
          project_id: string
          resume_note?: string | null
          resume_question?: string | null
          resume_step?: number | null
          started_at?: string
          state?: string
          style: string
          summary?: string | null
          user_id?: string
        }
        Update: {
          checkpoint_id?: string | null
          client?: string
          created_at?: string
          ended_at?: string | null
          goal?: string
          goal_met?: string | null
          id?: string
          last_activity_at?: string
          minutes?: number | null
          number?: number
          project_id?: string
          resume_note?: string | null
          resume_question?: string | null
          resume_step?: number | null
          started_at?: string
          state?: string
          style?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_checkpoint_id_fkey"
            columns: ["user_id", "checkpoint_id"]
            isOneToOne: false
            referencedRelation: "checkpoints"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "sessions_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      settings: {
        Row: {
          connector_last_client: string | null
          connector_last_seen_at: string | null
          connector_secret: string
          created_at: string
          default_style: string
          desired_retention: number
          fsrs_tuned_at: string | null
          fsrs_weights: number[] | null
          fuzz: boolean
          learn_ahead_minutes: number
          learn_steps: string
          load_balance: boolean
          macros: string
          max_interval_days: number
          mix_decks: boolean
          new_per_day: number
          preferred_chat: string
          relearn_steps: string
          reviews_per_day: number
          rollover_hour: number
          time_zone: string
          tutor_rules: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connector_last_client?: string | null
          connector_last_seen_at?: string | null
          connector_secret?: string
          created_at?: string
          default_style?: string
          desired_retention?: number
          fsrs_tuned_at?: string | null
          fsrs_weights?: number[] | null
          fuzz?: boolean
          learn_ahead_minutes?: number
          learn_steps?: string
          load_balance?: boolean
          macros?: string
          max_interval_days?: number
          mix_decks?: boolean
          new_per_day?: number
          preferred_chat?: string
          relearn_steps?: string
          reviews_per_day?: number
          rollover_hour?: number
          time_zone?: string
          tutor_rules?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          connector_last_client?: string | null
          connector_last_seen_at?: string | null
          connector_secret?: string
          created_at?: string
          default_style?: string
          desired_retention?: number
          fsrs_tuned_at?: string | null
          fsrs_weights?: number[] | null
          fuzz?: boolean
          learn_ahead_minutes?: number
          learn_steps?: string
          load_balance?: boolean
          macros?: string
          max_interval_days?: number
          mix_decks?: boolean
          new_per_day?: number
          preferred_chat?: string
          relearn_steps?: string
          reviews_per_day?: number
          rollover_hour?: number
          time_zone?: string
          tutor_rules?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      source_pages: {
        Row: {
          body: string
          chars: number | null
          created_at: string
          label: string | null
          page: number
          source_id: string
          tsv: unknown
          user_id: string
        }
        Insert: {
          body?: string
          chars?: number | null
          created_at?: string
          label?: string | null
          page: number
          source_id: string
          tsv?: unknown
          user_id?: string
        }
        Update: {
          body?: string
          chars?: number | null
          created_at?: string
          label?: string | null
          page?: number
          source_id?: string
          tsv?: unknown
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_pages_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      sources: {
        Row: {
          bytes: number | null
          created_at: string
          error: string | null
          filename: string
          has_text: boolean
          id: string
          outline: Json
          page_count: number | null
          project_id: string
          short: string
          status: string
          storage_path: string | null
          title: string
          user_id: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          error?: string | null
          filename?: string
          has_text?: boolean
          id?: string
          outline?: Json
          page_count?: number | null
          project_id: string
          short: string
          status?: string
          storage_path?: string | null
          title: string
          user_id?: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          error?: string | null
          filename?: string
          has_text?: boolean
          id?: string
          outline?: Json
          page_count?: number | null
          project_id?: string
          short?: string
          status?: string
          storage_path?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      styles: {
        Row: {
          created_at: string
          icon: string
          instructions: string
          key: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          icon: string
          instructions: string
          key: string
          name: string
          position?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          icon?: string
          instructions?: string
          key?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string
          glyph: string
          hue: string
          id: string
          name: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          glyph: string
          hue: string
          id?: string
          name: string
          position?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          glyph?: string
          hue?: string
          id?: string
          name?: string
          position?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_due_cards: {
        Row: {
          card_id: string | null
          checkpoint_id: string | null
          due: string | null
          note_id: string | null
          note_no: number | null
          ord: number | null
          project_id: string | null
          session_id: string | null
          state: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_proposal: { Args: { p_edit?: Json; p_id: string }; Returns: Json }
      bootstrap: {
        Args: never
        Returns: {
          connector_last_client: string | null
          connector_last_seen_at: string | null
          connector_secret: string
          created_at: string
          default_style: string
          desired_retention: number
          fsrs_tuned_at: string | null
          fsrs_weights: number[] | null
          fuzz: boolean
          learn_ahead_minutes: number
          learn_steps: string
          load_balance: boolean
          macros: string
          max_interval_days: number
          mix_decks: boolean
          new_per_day: number
          preferred_chat: string
          relearn_steps: string
          reviews_per_day: number
          rollover_hour: number
          time_zone: string
          tutor_rules: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lemma_add_checkpoint: {
        Args: {
          assigned_code: string
          owner: string
          payload: Json
          project: string
          sort_position: number
        }
        Returns: string
      }
      lemma_ensure_concept: {
        Args: {
          description?: string
          owner: string
          subject: string
          title: string
        }
        Returns: string
      }
      lemma_link_checkpoint: {
        Args: {
          checkpoint: string
          owner: string
          payload: Json
          project: string
        }
        Returns: undefined
      }
      lemma_plan_position: {
        Args: {
          after_code: string
          moving?: string
          owner: string
          project: string
        }
        Returns: number
      }
      lemma_reconcile_cards: {
        Args: { note: string; owner: string }
        Returns: undefined
      }
      lemma_slug: { Args: { value: string }; Returns: string }
      lemma_valid_steps: { Args: { value: Json }; Returns: boolean }
      ping: { Args: never; Returns: string }
      record_review: {
        Args: {
          p_card: string
          p_confidence: string
          p_duration_ms: number
          p_next: Json
          p_rating: number
        }
        Returns: number
      }
      reject_proposal: { Args: { p_id: string }; Returns: undefined }
      save_progress: {
        Args: {
          p_payload: Json
          p_project_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      undo_review: { Args: { p_review: number }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

