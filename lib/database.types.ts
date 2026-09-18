export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Row = { [key: string]: Json | null };

type Table = { Row: Row; Insert: Row; Update: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      users: Table;
      roles: Table;
      reports: Table;
      report_photos: Table;
      categories: Table;
      barangays: Table;
      departments: Table;
      assignments: Table;
      notifications: Table;
      status_history: Table;
      ai_analysis: Table;
      locations: Table;
      audit_logs: Table;
      app_settings: Table;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
