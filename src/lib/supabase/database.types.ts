export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Required extends keyof Row, Relations extends Relationship[] = []> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: Relations;
};

type Organization = {
  id: string;
  name: string;
  display_name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  sector: string | null;
  company_size: string | null;
  status: "trial" | "active" | "suspended" | "inactive";
  enabled_modules: Json;
  created_at: string;
  updated_at: string;
};

type PlatformAuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: "organization" | "membership" | "esg_criteria_version" | "esg_knowledge_item";
  target_id: string | null;
  details: Json | null;
  created_at: string;
};

type EsgCriteriaVersion = {
  id: string;
  label: string;
  status: "draft" | "active" | "archived";
  dimensions: Json;
  potential_thresholds: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
};

type EsgKnowledgeItem = {
  id: string;
  title: string;
  description: string;
  category:
    | "concept"
    | "evaluation_criteria"
    | "classification_rule"
    | "reference"
    | "guiding_question"
    | "recommendation";
  source: string | null;
  status: "draft" | "active" | "archived";
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "company_admin" | "member";
  status: "active" | "blocked";
  created_at: string;
};

type Idea = {
  id: string;
  organization_id: string;
  author_id: string;
  title: string;
  problem: string | null;
  solution: string | null;
  original_description: string | null;
  structured_proposal: Json | null;
  submitted_at: string | null;
  area: string | null;
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "awaiting_info"
    | "technical_review"
    | "approved"
    | "in_progress"
    | "implemented"
    | "rejected"
    | "archived";
  analysis: Json | null;
  created_at: string;
  updated_at: string;
};

type IdeaCopilotMessage = {
  id: string;
  organization_id: string;
  idea_id: string;
  role: "user" | "assistant";
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

type IdeaEvaluation = {
  id: string;
  organization_id: string;
  idea_id: string;
  status: "pending" | "completed" | "failed";
  criteria_version_id: string | null;
  criteria_version_label: string | null;
  model: string | null;
  result: Json | null;
  error_message: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  completed_at: string | null;
};

type IdeaActivity = {
  id: string;
  organization_id: string;
  idea_id: string;
  actor_id: string | null;
  action: "created" | "updated" | "status_changed";
  old_status: string | null;
  new_status: string | null;
  created_at: string;
};

type EsgProject = {
  id: string;
  organization_id: string;
  idea_id: string | null;
  title: string;
  objective: string;
  owner_id: string | null;
  status: "planned" | "in_progress" | "completed" | "paused" | "cancelled";
  starts_on: string | null;
  target_date: string | null;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
};

type EsgIndicator = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  dimension: "E" | "S" | "G";
  unit: string;
  baseline: number | null;
  target: number | null;
  measured: number | null;
  measured_at: string | null;
  evidence_note: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: Table<Organization, "name">;
      memberships: Table<
        Membership,
        "organization_id" | "user_id",
        [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ]
      >;
      ideas: Table<
        Idea,
        "organization_id" | "author_id" | "title",
        [
          {
            foreignKeyName: "ideas_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ]
      >;
      idea_activity: Table<
        IdeaActivity,
        "organization_id" | "idea_id" | "action",
        [
          {
            foreignKeyName: "idea_activity_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "idea_activity_idea_id_organization_id_fkey";
            columns: ["idea_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id", "organization_id"];
          },
        ]
      >;
      esg_projects: Table<
        EsgProject,
        "organization_id" | "title" | "objective",
        [
          {
            foreignKeyName: "esg_projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esg_projects_idea_id_organization_id_fkey";
            columns: ["idea_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "ideas";
            referencedColumns: ["id", "organization_id"];
          },
        ]
      >;
      esg_indicators: Table<
        EsgIndicator,
        "organization_id" | "project_id" | "name" | "dimension" | "unit",
        [
          {
            foreignKeyName: "esg_indicators_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "esg_indicators_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "esg_projects";
            referencedColumns: ["id", "organization_id"];
          },
        ]
      >;
      idea_copilot_messages: Table<IdeaCopilotMessage, "organization_id" | "idea_id" | "role" | "content">;
      idea_evaluations: Table<IdeaEvaluation, "organization_id" | "idea_id">;
      platform_audit_log: Table<PlatformAuditLog, "action" | "target_type">;
      esg_criteria_versions: Table<EsgCriteriaVersion, "label" | "dimensions">;
      esg_knowledge_items: Table<EsgKnowledgeItem, "title" | "description" | "category">;
    };
    Views: { [_ in never]: never };
    Functions: {
      is_org_member: { Args: { target_org_id: string }; Returns: boolean };
      is_org_admin: { Args: { target_org_id: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      platform_dashboard_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      platform_list_organizations: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          display_name: string | null;
          sector: string | null;
          company_size: string | null;
          status: string;
          enabled_modules: Json;
          created_at: string;
          member_count: number;
          idea_count: number;
          project_count: number;
        }[];
      };
      platform_find_user_by_email: {
        Args: { target_email: string };
        Returns: { id: string; email: string }[];
      };
      platform_list_organization_members: {
        Args: { target_org_id: string };
        Returns: {
          id: string;
          user_id: string;
          email: string;
          role: "company_admin" | "member";
          status: "active" | "blocked";
          created_at: string;
        }[];
      };
      platform_activate_criteria_version: {
        Args: { target_id: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
