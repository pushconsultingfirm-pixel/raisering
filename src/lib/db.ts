import { createClient } from './supabase';
import type {
  Organization, User, Contact, Session, SessionCaller,
  SessionContact, Call, Pledge, ContactSource, WealthTier,
  CallOutcome, SessionStatus,
} from './types';

// Helper to get the Supabase client
function db() {
  return createClient();
}

// ============ USER & ORG ============

export async function getCurrentUser(): Promise<User | null> {
  const supabase = db();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  return data;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const { data } = await db()
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  return data;
}

export async function createOrganization(name: string, type: string): Promise<Organization> {
  const { data, error } = await db()
    .from('organizations')
    .insert({ name, type })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createUserProfile(
  userId: string, email: string, name: string,
  organizationId: string, role: string
): Promise<User> {
  const { data, error } = await db()
    .from('users')
    .insert({ id: userId, email, name, organization_id: organizationId, role })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOrgMembers(orgId: string): Promise<User[]> {
  const { data } = await db()
    .from('users')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');
  return data || [];
}

// ============ CONTACTS ============

export async function getContacts(orgId: string): Promise<Contact[]> {
  const { data } = await db()
    .from('contacts')
    .select('*')
    .eq('organization_id', orgId)
    .order('name');
  return data || [];
}

export async function getContact(id: string): Promise<Contact | null> {
  const { data } = await db()
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

export async function createContact(contact: {
  organization_id: string;
  uploaded_by: string;
  name: string;
  phone: string;
  email?: string;
  occupation?: string;
  employer?: string;
  notes?: string;
  estimated_wealth_tier?: WealthTier;
  ai_recommended_ask?: number;
  manual_ask_override?: number;
  source: ContactSource;
}): Promise<Contact> {
  const { data, error } = await db()
    .from('contacts')
    .insert(contact)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createContactsBatch(contacts: {
  organization_id: string;
  uploaded_by: string;
  name: string;
  phone: string;
  email?: string;
  occupation?: string;
  employer?: string;
  notes?: string;
  manual_ask_override?: number;
  source: ContactSource;
}[]): Promise<Contact[]> {
  const { data, error } = await db()
    .from('contacts')
    .insert(contacts)
    .select();
  if (error) throw error;
  return data || [];
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
  const { data, error } = await db()
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await db()
    .from('contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============ SESSIONS ============

export async function getSessions(orgId: string): Promise<Session[]> {
  const { data } = await db()
    .from('sessions')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getSession(id: string): Promise<Session | null> {
  const { data } = await db()
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

export async function getActiveSession(orgId: string, userId: string): Promise<Session | null> {
  // Find an active session where this user is a caller
  const { data } = await db()
    .from('sessions')
    .select(`
      *,
      session_callers!inner(user_id)
    `)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .eq('session_callers.user_id', userId)
    .limit(1)
    .single();
  return data;
}

export async function createSession(session: {
  organization_id: string;
  created_by: string;
  name: string;
  scheduled_start?: string;
  scheduled_end?: string;
  caller_ids: string[];
  contact_ids: string[];
  assignment: 'shared' | 'divided';
}): Promise<Session> {
  const supabase = db();

  // Create the session
  const { data: newSession, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      organization_id: session.organization_id,
      created_by: session.created_by,
      name: session.name,
      scheduled_start: session.scheduled_start || null,
      scheduled_end: session.scheduled_end || null,
      status: 'scheduled',
    })
    .select()
    .single();

  if (sessionError) throw sessionError;

  // Add callers
  const callerRows = session.caller_ids.map(userId => ({
    session_id: newSession.id,
    user_id: userId,
  }));
  const { error: callerError } = await supabase
    .from('session_callers')
    .insert(callerRows);
  if (callerError) throw callerError;

  // Add contacts with optional caller assignment
  const contactRows = session.contact_ids.map((contactId, index) => {
    let assignedCallerId = null;
    if (session.assignment === 'divided' && session.caller_ids.length > 0) {
      assignedCallerId = session.caller_ids[index % session.caller_ids.length];
    }
    return {
      session_id: newSession.id,
      contact_id: contactId,
      assigned_caller_id: assignedCallerId,
      call_order: index,
      status: 'queued',
    };
  });
  const { error: contactError } = await supabase
    .from('session_contacts')
    .insert(contactRows);
  if (contactError) throw contactError;

  return newSession;
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  const { error } = await db()
    .from('sessions')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ============ SESSION CONTACTS (CALL QUEUE) ============

export async function getSessionQueue(sessionId: string, callerId?: string): Promise<(SessionContact & { contact: Contact })[]> {
  let query = db()
    .from('session_contacts')
    .select('*, contact:contacts(*)')
    .eq('session_id', sessionId)
    .order('call_order');

  if (callerId) {
    // Show contacts assigned to this caller, or unassigned (shared queue)
    query = query.or(`assigned_caller_id.eq.${callerId},assigned_caller_id.is.null`);
  }

  const { data } = await query;
  return (data || []) as (SessionContact & { contact: Contact })[];
}

export async function updateSessionContactStatus(id: string, status: string): Promise<void> {
  const { error } = await db()
    .from('session_contacts')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ============ CALLS ============

export async function createCall(call: {
  session_contact_id: string;
  caller_id: string;
}): Promise<Call> {
  const { data, error } = await db()
    .from('calls')
    .insert({
      session_contact_id: call.session_contact_id,
      caller_id: call.caller_id,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCall(id: string, updates: Partial<Call>): Promise<Call> {
  const { data, error } = await db()
    .from('calls')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getCallsForSession(sessionId: string): Promise<Call[]> {
  const { data } = await db()
    .from('calls')
    .select(`
      *,
      session_contact:session_contacts(
        contact:contacts(name, phone)
      )
    `)
    .in('session_contact_id',
      db().from('session_contacts').select('id').eq('session_id', sessionId)
    )
    .order('started_at', { ascending: false });
  return data || [];
}

export async function getCallsForContact(contactId: string): Promise<Call[]> {
  const { data } = await db()
    .from('calls')
    .select('*')
    .in('session_contact_id',
      db().from('session_contacts').select('id').eq('contact_id', contactId)
    )
    .order('started_at', { ascending: false });
  return data || [];
}

// ============ PLEDGES ============

export async function getPledges(orgId: string, status?: string): Promise<(Pledge & { contact: Contact })[]> {
  let query = db()
    .from('pledges')
    .select('*, contact:contacts(*)')
    .eq('organization_id', orgId)
    .order('pledged_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data } = await query;
  return (data || []) as (Pledge & { contact: Contact })[];
}

export async function createPledge(pledge: {
  call_id: string;
  contact_id: string;
  organization_id: string;
  amount: number;
}): Promise<Pledge> {
  const { data, error } = await db()
    .from('pledges')
    .insert(pledge)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePledgeStatus(id: string, status: string, fulfilledAt?: string): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (fulfilledAt) updates.fulfilled_at = fulfilledAt;
  if (status === 'outstanding') updates.fulfilled_at = null;

  const { error } = await db()
    .from('pledges')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

// ============ DASHBOARD STATS ============

export async function getDashboardStats(orgId: string) {
  const supabase = db();
  const today = new Date().toISOString().split('T')[0];

  const [sessionsRes, callsRes, pledgesRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, status')
      .eq('organization_id', orgId)
      .eq('status', 'active'),
    supabase
      .from('calls')
      .select('id, duration_seconds, ai_pledge_amount, started_at')
      .gte('started_at', today),
    supabase
      .from('pledges')
      .select('amount, status')
      .eq('organization_id', orgId),
  ]);

  const activeSessions = sessionsRes.data?.length || 0;
  const todayCalls = callsRes.data || [];
  const allPledges = pledgesRes.data || [];

  return {
    activeSessions,
    callsToday: todayCalls.length,
    pledgedToday: todayCalls.reduce((sum, c) => sum + (c.ai_pledge_amount || 0), 0),
    outstandingPledges: allPledges
      .filter(p => p.status === 'outstanding')
      .reduce((sum, p) => sum + p.amount, 0),
    hoursThisWeek: todayCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / 3600,
  };
}
