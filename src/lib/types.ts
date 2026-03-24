// Core database types for CallTime AI

export type OrgType = 'campaign' | 'nonprofit' | 'committee';
export type UserRole = 'admin' | 'caller' | 'director';
export type ContactSource = 'google_contacts' | 'csv' | 'linkedin' | 'vcard' | 'manual';
export type WealthTier = 'low' | 'mid' | 'high' | 'very_high';
export type SessionStatus = 'scheduled' | 'active' | 'completed';
export type ContactStatus = 'queued' | 'in_progress' | 'completed' | 'skipped';
export type CallOutcome = 'pledged' | 'declined' | 'callback' | 'voicemail' | 'wrong_number' | 'no_answer' | 'event_rsvp';
export type PledgeStatus = 'outstanding' | 'fulfilled' | 'overdue';

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: UserRole;
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  uploaded_by: string;
  name: string;
  phone: string;
  email: string | null;
  occupation: string | null;
  employer: string | null;
  notes: string | null;
  estimated_wealth_tier: WealthTier | null;
  ai_recommended_ask: number | null;
  manual_ask_override: number | null;
  source: ContactSource;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: SessionStatus;
  created_at: string;
}

export interface SessionCaller {
  id: string;
  session_id: string;
  user_id: string;
  user?: User;
}

export interface SessionContact {
  id: string;
  session_id: string;
  contact_id: string;
  assigned_caller_id: string | null;
  call_order: number;
  status: ContactStatus;
  contact?: Contact;
}

export interface Call {
  id: string;
  session_contact_id: string;
  caller_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript_raw: string | null;
  ai_summary: string | null;
  ai_outcome: CallOutcome | null;
  ai_pledge_amount: number | null;
  ai_personal_details: string | null;
  ai_action_items: string | null;
  ai_ask_made: boolean | null;
  ai_ask_amount: number | null;
  follow_up_draft: string | null;
  follow_up_sent: boolean;
  follow_up_sent_at: string | null;
  confirmed: boolean;
  notes: string | null;
  created_at: string;
}

export interface Pledge {
  id: string;
  call_id: string;
  contact_id: string;
  organization_id: string;
  amount: number;
  status: PledgeStatus;
  pledged_at: string;
  fulfilled_at: string | null;
  reminder_count: number;
}

// Utility types for the UI
export interface SessionWithDetails extends Session {
  callers: (SessionCaller & { user: User })[];
  contacts_count: number;
  completed_count: number;
  total_pledged: number;
}

export interface ContactWithCallHistory extends Contact {
  last_call?: Call;
  total_pledged: number;
  total_calls: number;
}

export function getAskAmount(contact: Contact): number | null {
  return contact.manual_ask_override ?? contact.ai_recommended_ask;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
