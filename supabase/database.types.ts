/* eslint-disable */
/**
 * GENERATED FILE -- DO NOT EDIT.
 *
 * Regenerate with `npm run db:types` after every migration, and commit the
 * result. CI regenerates it and fails on any difference, so a schema change
 * that was never reflected here shows up in review rather than at runtime
 * (docs/code-standards.md).
 */


export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "applications": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"next_action_at": string | null,"resume_version_id": string | null,"stage_history": NonNullable<Json>,"tier": Database["public"]['Enums']["effort_tier"] | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"next_action_at"?: string | null,"resume_version_id"?: string | null,"stage_history"?: NonNullable<Json>,"tier"?: Database["public"]['Enums']["effort_tier"] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"next_action_at"?: string | null,"resume_version_id"?: string | null,"stage_history"?: NonNullable<Json>,"tier"?: Database["public"]['Enums']["effort_tier"] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_resume_version_id_fkey"
      columns: ["resume_version_id"]
isOneToOne: false
      referencedRelation: "resume_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "ats_slug": string | null,"ats_type": Database["public"]['Enums']["ats_type"] | null,"created_at": string,"domain": string | null,"hq_country": string | null,"id": string,"name": string,"regions": (Database["public"]['Enums']["region"])[],"research_at": string | null,"research_generated_by": string | null,"research_json": Json | null,"sector": string | null,"size": Database["public"]['Enums']["company_size"] | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ats_slug"?: string | null,"ats_type"?: Database["public"]['Enums']["ats_type"] | null,"created_at"?: string,"domain"?: string | null,"hq_country"?: string | null,"id"?: string,"name": string,"regions"?: (Database["public"]['Enums']["region"])[],"research_at"?: string | null,"research_generated_by"?: string | null,"research_json"?: Json | null,"sector"?: string | null,"size"?: Database["public"]['Enums']["company_size"] | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ats_slug"?: string | null,"ats_type"?: Database["public"]['Enums']["ats_type"] | null,"created_at"?: string,"domain"?: string | null,"hq_country"?: string | null,"id"?: string,"name"?: string,"regions"?: (Database["public"]['Enums']["region"])[],"research_at"?: string | null,"research_generated_by"?: string | null,"research_json"?: Json | null,"sector"?: string | null,"size"?: Database["public"]['Enums']["company_size"] | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"competencies": {
                  Row: {
                    "axis": Database["public"]['Enums']["competency_axis"],"created_at": string,"id": string,"level_junior": string,"level_mid": string,"level_senior": string,"sub_skill": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "axis": Database["public"]['Enums']["competency_axis"],"created_at"?: string,"id"?: string,"level_junior": string,"level_mid": string,"level_senior": string,"sub_skill": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "axis"?: Database["public"]['Enums']["competency_axis"],"created_at"?: string,"id"?: string,"level_junior"?: string,"level_mid"?: string,"level_senior"?: string,"sub_skill"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contacts": {
                  Row: {
                    "company_id": string | null,"created_at": string,"id": string,"last_touch_at": string | null,"name": string,"profile_url": string | null,"role_type": Database["public"]['Enums']["contact_role"],"sequence_step": number,"source": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"last_touch_at"?: string | null,"name": string,"profile_url"?: string | null,"role_type": Database["public"]['Enums']["contact_role"],"sequence_step"?: number,"source": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string | null,"created_at"?: string,"id"?: string,"last_touch_at"?: string | null,"name"?: string,"profile_url"?: string | null,"role_type"?: Database["public"]['Enums']["contact_role"],"sequence_step"?: number,"source"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contacts_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"drills": {
                  Row: {
                    "attempts": number,"created_at": string,"generated_by": string,"id": string,"insight_id": string,"last_score": number | null,"scenario": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"created_at"?: string,"generated_by": string,"id"?: string,"insight_id": string,"last_score"?: number | null,"scenario": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"created_at"?: string,"generated_by"?: string,"id"?: string,"insight_id"?: string,"last_score"?: number | null,"scenario"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drills_insight_id_fkey"
      columns: ["insight_id"]
isOneToOne: false
      referencedRelation: "insights"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence": {
                  Row: {
                    "competency_id": string,"created_at": string,"generated_by": string | null,"id": string,"observed_at": string,"score": number,"source_id": string | null,"source_type": Database["public"]['Enums']["evidence_source"],"updated_at": string,"user_id": string,"weight": number
                  }
                  ComputedFields: never
                  Insert: {
                    "competency_id": string,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"observed_at": string,"score": number,"source_id"?: string | null,"source_type": Database["public"]['Enums']["evidence_source"],"updated_at"?: string,"user_id": string,"weight": number
                  }
                  Update: {
                    "competency_id"?: string,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"observed_at"?: string,"score"?: number,"source_id"?: string | null,"source_type"?: Database["public"]['Enums']["evidence_source"],"updated_at"?: string,"user_id"?: string,"weight"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_competency_id_fkey"
      columns: ["competency_id"]
isOneToOne: false
      referencedRelation: "competencies"
      referencedColumns: ["id"]
    }
                  ]
                },"insights": {
                  Row: {
                    "cluster_id": string | null,"created_at": string,"generated_by": string | null,"id": string,"principle": string | null,"raw_text": string,"sales_dims": (Database["public"]['Enums']["sales_dimension"])[],"source_url": string | null,"summary": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cluster_id"?: string | null,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"principle"?: string | null,"raw_text": string,"sales_dims"?: (Database["public"]['Enums']["sales_dimension"])[],"source_url"?: string | null,"summary"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cluster_id"?: string | null,"created_at"?: string,"generated_by"?: string | null,"id"?: string,"principle"?: string | null,"raw_text"?: string,"sales_dims"?: (Database["public"]['Enums']["sales_dimension"])[],"source_url"?: string | null,"summary"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"interviews": {
                  Row: {
                    "application_id": string,"created_at": string,"feedback": string | null,"followup_sent_at": string | null,"id": string,"notes": string | null,"round": number,"scheduled_at": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"created_at"?: string,"feedback"?: string | null,"followup_sent_at"?: string | null,"id"?: string,"notes"?: string | null,"round": number,"scheduled_at": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "application_id"?: string,"created_at"?: string,"feedback"?: string | null,"followup_sent_at"?: string | null,"id"?: string,"notes"?: string | null,"round"?: number,"scheduled_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "applications"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"jd_text": string | null,"language_required": Json | null,"posted_at": string | null,"region": Database["public"]['Enums']["region"],"source_url": string | null,"title": string,"updated_at": string,"user_id": string,"visa_sponsorship": Database["public"]['Enums']["sponsorship"],"visa_sponsorship_source": string | null,"work_mode": Database["public"]['Enums']["work_mode"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"jd_text"?: string | null,"language_required"?: Json | null,"posted_at"?: string | null,"region": Database["public"]['Enums']["region"],"source_url"?: string | null,"title": string,"updated_at"?: string,"user_id": string,"visa_sponsorship"?: Database["public"]['Enums']["sponsorship"],"visa_sponsorship_source"?: string | null,"work_mode"?: Database["public"]['Enums']["work_mode"] | null
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"jd_text"?: string | null,"language_required"?: Json | null,"posted_at"?: string | null,"region"?: Database["public"]['Enums']["region"],"source_url"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string,"visa_sponsorship"?: Database["public"]['Enums']["sponsorship"],"visa_sponsorship_source"?: string | null,"work_mode"?: Database["public"]['Enums']["work_mode"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"resume_versions": {
                  Row: {
                    "base_json": NonNullable<Json>,"created_at": string,"diff": Json | null,"generated_by": string | null,"id": string,"locale": string,"pdf_url": string | null,"region_profile": Database["public"]['Enums']["resume_profile"],"tailored_json": Json | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_json": NonNullable<Json>,"created_at"?: string,"diff"?: Json | null,"generated_by"?: string | null,"id"?: string,"locale": string,"pdf_url"?: string | null,"region_profile": Database["public"]['Enums']["resume_profile"],"tailored_json"?: Json | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "base_json"?: NonNullable<Json>,"created_at"?: string,"diff"?: Json | null,"generated_by"?: string | null,"id"?: string,"locale"?: string,"pdf_url"?: string | null,"region_profile"?: Database["public"]['Enums']["resume_profile"],"tailored_json"?: Json | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"signals": {
                  Row: {
                    "company_id": string,"created_at": string,"generated_by": string,"id": string,"observed_at": string,"payload": NonNullable<Json>,"severity": Database["public"]['Enums']["signal_severity"],"source_url": string,"type": Database["public"]['Enums']["signal_type"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"generated_by": string,"id"?: string,"observed_at": string,"payload": NonNullable<Json>,"severity": Database["public"]['Enums']["signal_severity"],"source_url": string,"type": Database["public"]['Enums']["signal_type"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"generated_by"?: string,"id"?: string,"observed_at"?: string,"payload"?: NonNullable<Json>,"severity"?: Database["public"]['Enums']["signal_severity"],"source_url"?: string,"type"?: Database["public"]['Enums']["signal_type"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "signals_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "application_stage": "saved"|"applied"|"assessment"|"interview"|"offer"|"rejected"|"withdrawn","ats_type": "greenhouse"|"lever"|"ashby"|"workday"|"other","company_size": "1-10"|"11-50"|"51-200"|"201-500"|"501-1000"|"1001-5000"|"5000+","competency_axis": "coding"|"system_design"|"ai_ml_engineering"|"debugging"|"collaboration"|"communication"|"product_sense"|"sales_influence","contact_role": "engineer"|"hiring_manager"|"alumni"|"recruiter"|"author"|"other","effort_tier": "a"|"b"|"c","evidence_source": "interview_feedback"|"mock_interview"|"flashcard"|"drill"|"insight_debrief"|"project"|"self_assessment","region": "uk"|"ie"|"ee"|"jp"|"de"|"other","resume_profile": "uk_ie_cv"|"eu_cv"|"jp_rirekisho"|"jp_shokumu_keirekisho"|"jp_english_cv"|"de_lebenslauf","sales_dimension": "opening"|"discovery"|"storytelling"|"value_proposition"|"objections"|"trust"|"closing"|"following_up","signal_severity": "info"|"warning"|"critical","signal_type": "funding"|"layoff"|"hiring_freeze"|"headcount_change"|"leadership_change"|"launch"|"news"|"other","sponsorship": "yes"|"no"|"unknown","work_mode": "onsite"|"hybrid"|"remote"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "application_stage": ["saved", "applied", "assessment", "interview", "offer", "rejected", "withdrawn"],"ats_type": ["greenhouse", "lever", "ashby", "workday", "other"],"company_size": ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"],"competency_axis": ["coding", "system_design", "ai_ml_engineering", "debugging", "collaboration", "communication", "product_sense", "sales_influence"],"contact_role": ["engineer", "hiring_manager", "alumni", "recruiter", "author", "other"],"effort_tier": ["a", "b", "c"],"evidence_source": ["interview_feedback", "mock_interview", "flashcard", "drill", "insight_debrief", "project", "self_assessment"],"region": ["uk", "ie", "ee", "jp", "de", "other"],"resume_profile": ["uk_ie_cv", "eu_cv", "jp_rirekisho", "jp_shokumu_keirekisho", "jp_english_cv", "de_lebenslauf"],"sales_dimension": ["opening", "discovery", "storytelling", "value_proposition", "objections", "trust", "closing", "following_up"],"signal_severity": ["info", "warning", "critical"],"signal_type": ["funding", "layoff", "hiring_freeze", "headcount_change", "leadership_change", "launch", "news", "other"],"sponsorship": ["yes", "no", "unknown"],"work_mode": ["onsite", "hybrid", "remote"]
          }
        }
} as const
