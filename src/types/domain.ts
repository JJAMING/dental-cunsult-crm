export type PatientType = "new" | "returning";

export type ConsultationResult =
  | "same_day"
  | "follow_up"
  | "declined"
  | "cancelled";

export type RecallRound = 1 | 2 | 3 | "final";

export type Consultation = {
  id: number;
  clinicId?: string;
  clinicName?: string;
  date: string;
  patientName: string;
  chartNo: string;
  patientType: PatientType;
  counselor: string;
  doctor: string;
  visitChannel: string;
  treatmentCategory: string;
  consultedTeeth: number;
  agreedTeeth: number;
  result: ConsultationResult;
  consultationAmount: number;
  agreedAmount: number;
  disagreementReason?: string;
  memo?: string;
};

export type MonthlyStat = {
  month: string;
  consultations: number;
  agreements: number;
  cancellations: number;
  sameDay: number;
  followUp: number;
};

export type SegmentStat = {
  name: string;
  consultations: number;
  agreements: number;
  consultationAmount: number;
  agreedAmount: number;
};

export type RecallTask = {
  id: number;
  patientName: string;
  counselor: string;
  doctor: string;
  round: RecallRound;
  dueDate: string;
  targetAmount: number;
  reason: string;
  status: "due_today" | "overdue" | "scheduled";
};
