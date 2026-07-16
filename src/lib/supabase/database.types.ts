export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clinics: {
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
      };
      consultations: {
        Row: {
          id: string;
          clinic_id: string;
          patient_id: string;
          consultation_date: string;
          counselor_id: string | null;
          doctor_id: string | null;
          visit_channel_id: string | null;
          treatment_category_id: string | null;
          consulted_teeth_count: number;
          agreed_teeth_count: number;
          result: "same_day" | "follow_up" | "declined" | "cancelled";
          consultation_amount: number;
          agreed_amount: number;
          disagreement_reason_id: string | null;
          memo: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          consultation_date: string;
          counselor_id?: string | null;
          doctor_id?: string | null;
          visit_channel_id?: string | null;
          treatment_category_id?: string | null;
          consulted_teeth_count?: number;
          agreed_teeth_count?: number;
          result: "same_day" | "follow_up" | "declined" | "cancelled";
          consultation_amount?: number;
          agreed_amount?: number;
          disagreement_reason_id?: string | null;
          memo?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          consultation_date?: string;
          counselor_id?: string | null;
          doctor_id?: string | null;
          visit_channel_id?: string | null;
          treatment_category_id?: string | null;
          consulted_teeth_count?: number;
          agreed_teeth_count?: number;
          result?: "same_day" | "follow_up" | "declined" | "cancelled";
          consultation_amount?: number;
          agreed_amount?: number;
          disagreement_reason_id?: string | null;
          memo?: string | null;
          updated_at?: string;
        };
      };
    };
    Views: {
      monthly_consultation_stats: {
        Row: {
          clinic_id: string;
          month: string;
          consultations: number;
          agreements: number;
          consent_rate: number;
          consultation_amount: number;
          agreed_amount: number;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
