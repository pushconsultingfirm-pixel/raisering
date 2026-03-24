'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type {
  Contact, Session, SessionContact, Call, Pledge,
  CallOutcome, ContactSource, SessionStatus, WealthTier,
} from './types';

// Generate simple unique IDs for local state
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface DataState {
  // Contacts
  contacts: Contact[];
  addContact: (contact: Omit<Contact, 'id' | 'organization_id' | 'uploaded_by' | 'created_at' | 'updated_at'>) => Contact;
  addContactsBatch: (contacts: Omit<Contact, 'id' | 'organization_id' | 'uploaded_by' | 'created_at' | 'updated_at'>[]) => Contact[];
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  // Sessions
  sessions: Session[];
  createSession: (name: string, callerIds: string[], contactIds: string[], assignment: 'shared' | 'divided', scheduledStart?: string) => Session;
  getActiveSession: () => Session | null;
  startSession: (id: string) => void;
  completeSession: (id: string) => void;

  // Session contacts (call queue)
  sessionContacts: (SessionContact & { contact: Contact })[];
  getSessionQueue: (sessionId: string) => (SessionContact & { contact: Contact })[];
  updateSessionContactStatus: (id: string, status: string) => void;

  // Calls
  calls: Call[];
  createCall: (sessionContactId: string) => Call;
  updateCall: (id: string, updates: Partial<Call>) => void;

  // Pledges
  pledges: (Pledge & { contact?: Contact })[];
  createPledge: (callId: string, contactId: string, amount: number) => Pledge;
  updatePledgeStatus: (id: string, status: string) => void;
}

const DataContext = createContext<DataState | null>(null);

// Seed data for demo
const seedContacts: Contact[] = [
  {
    id: 'c1', organization_id: 'demo', uploaded_by: 'demo', name: 'Jane Smith',
    phone: '+14045551234', email: 'jane@example.com', occupation: 'Attorney',
    employer: 'Smith & Associates', notes: 'Met at fundraiser last month. Interested in education policy.',
    estimated_wealth_tier: 'high', ai_recommended_ask: 1000, manual_ask_override: null,
    source: 'csv', created_at: '2026-03-20T00:00:00Z', updated_at: '2026-03-20T00:00:00Z',
  },
  {
    id: 'c2', organization_id: 'demo', uploaded_by: 'demo', name: 'Robert Johnson',
    phone: '+14045555678', email: 'robert@example.com', occupation: 'Business Owner',
    employer: 'Johnson Enterprises', notes: 'Friend of the candidate. Gave $500 last cycle. Wife is Sarah.',
    estimated_wealth_tier: 'very_high', ai_recommended_ask: 2800, manual_ask_override: null,
    source: 'manual', created_at: '2026-03-20T00:00:00Z', updated_at: '2026-03-20T00:00:00Z',
  },
  {
    id: 'c3', organization_id: 'demo', uploaded_by: 'demo', name: 'Maria Garcia',
    phone: '+14045559012', email: 'maria@school.edu', occupation: 'Teacher',
    employer: 'Fulton County Schools', notes: 'Active in local PTA. Passionate about school funding.',
    estimated_wealth_tier: 'mid', ai_recommended_ask: 250, manual_ask_override: null,
    source: 'google_contacts', created_at: '2026-03-21T00:00:00Z', updated_at: '2026-03-21T00:00:00Z',
  },
  {
    id: 'c4', organization_id: 'demo', uploaded_by: 'demo', name: 'David Williams',
    phone: '+14045553456', email: 'david@techcorp.com', occupation: 'VP of Engineering',
    employer: 'TechCorp Inc', notes: 'College roommate. Recently promoted.',
    estimated_wealth_tier: 'high', ai_recommended_ask: 1500, manual_ask_override: null,
    source: 'manual', created_at: '2026-03-21T00:00:00Z', updated_at: '2026-03-21T00:00:00Z',
  },
  {
    id: 'c5', organization_id: 'demo', uploaded_by: 'demo', name: 'Sarah Chen',
    phone: '+14045557890', email: 'sarah.chen@gmail.com', occupation: 'Physician',
    employer: 'Emory Healthcare', notes: 'Met through mutual friend. Cares about healthcare access.',
    estimated_wealth_tier: 'very_high', ai_recommended_ask: 2500, manual_ask_override: null,
    source: 'csv', created_at: '2026-03-22T00:00:00Z', updated_at: '2026-03-22T00:00:00Z',
  },
];

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [contacts, setContacts] = useState<Contact[]>(seedContacts);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionContacts, setSessionContacts] = useState<(SessionContact & { contact: Contact })[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [pledges, setPledges] = useState<(Pledge & { contact?: Contact })[]>([]);

  // ---- Contacts ----
  const addContact = useCallback((contact: Omit<Contact, 'id' | 'organization_id' | 'uploaded_by' | 'created_at' | 'updated_at'>) => {
    const now = new Date().toISOString();
    const newContact: Contact = {
      ...contact,
      id: uid(),
      organization_id: 'demo',
      uploaded_by: 'demo',
      created_at: now,
      updated_at: now,
    };
    setContacts(prev => [...prev, newContact]);
    return newContact;
  }, []);

  const addContactsBatch = useCallback((batch: Omit<Contact, 'id' | 'organization_id' | 'uploaded_by' | 'created_at' | 'updated_at'>[]) => {
    const now = new Date().toISOString();
    const newContacts = batch.map(c => ({
      ...c,
      id: uid(),
      organization_id: 'demo',
      uploaded_by: 'demo',
      created_at: now,
      updated_at: now,
    }));
    setContacts(prev => [...prev, ...newContacts]);
    return newContacts;
  }, []);

  const updateContact = useCallback((id: string, updates: Partial<Contact>) => {
    setContacts(prev => prev.map(c =>
      c.id === id ? { ...c, ...updates, updated_at: new Date().toISOString() } : c
    ));
  }, []);

  const deleteContact = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  // ---- Sessions ----
  const createSession = useCallback((
    name: string, callerIds: string[], contactIds: string[],
    assignment: 'shared' | 'divided', scheduledStart?: string
  ) => {
    const sessionId = uid();
    const newSession: Session = {
      id: sessionId,
      organization_id: 'demo',
      created_by: 'demo',
      name,
      scheduled_start: scheduledStart || null,
      scheduled_end: null,
      status: 'scheduled',
      created_at: new Date().toISOString(),
    };
    setSessions(prev => [newSession, ...prev]);

    // Create session contacts
    const newSessionContacts = contactIds.map((contactId, index) => {
      const contact = contacts.find(c => c.id === contactId);
      let assignedCallerId = null;
      if (assignment === 'divided' && callerIds.length > 0) {
        assignedCallerId = callerIds[index % callerIds.length];
      }
      return {
        id: uid(),
        session_id: sessionId,
        contact_id: contactId,
        assigned_caller_id: assignedCallerId,
        call_order: index,
        status: 'queued' as const,
        contact: contact!,
      };
    });
    setSessionContacts(prev => [...prev, ...newSessionContacts]);

    return newSession;
  }, [contacts]);

  const getActiveSession = useCallback(() => {
    return sessions.find(s => s.status === 'active') || null;
  }, [sessions]);

  const startSession = useCallback((id: string) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'active' as SessionStatus } : s
    ));
  }, []);

  const completeSession = useCallback((id: string) => {
    setSessions(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'completed' as SessionStatus } : s
    ));
  }, []);

  // ---- Session Queue ----
  const getSessionQueue = useCallback((sessionId: string) => {
    return sessionContacts.filter(sc => sc.session_id === sessionId);
  }, [sessionContacts]);

  const updateSessionContactStatus = useCallback((id: string, status: string) => {
    setSessionContacts(prev => prev.map(sc =>
      sc.id === id ? { ...sc, status: status as SessionContact['status'] } : sc
    ));
  }, []);

  // ---- Calls ----
  const createCall = useCallback((sessionContactId: string) => {
    const newCall: Call = {
      id: uid(),
      session_contact_id: sessionContactId,
      caller_id: 'demo',
      started_at: new Date().toISOString(),
      ended_at: null,
      duration_seconds: null,
      transcript_raw: null,
      ai_summary: null,
      ai_outcome: null,
      ai_pledge_amount: null,
      ai_personal_details: null,
      ai_action_items: null,
      ai_ask_made: null,
      ai_ask_amount: null,
      follow_up_draft: null,
      follow_up_sent: false,
      follow_up_sent_at: null,
      confirmed: false,
      notes: null,
      created_at: new Date().toISOString(),
    };
    setCalls(prev => [...prev, newCall]);
    return newCall;
  }, []);

  const updateCall = useCallback((id: string, updates: Partial<Call>) => {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  // ---- Pledges ----
  const createPledge = useCallback((callId: string, contactId: string, amount: number) => {
    const contact = contacts.find(c => c.id === contactId);
    const newPledge: Pledge & { contact?: Contact } = {
      id: uid(),
      call_id: callId,
      contact_id: contactId,
      organization_id: 'demo',
      amount,
      status: 'outstanding',
      pledged_at: new Date().toISOString(),
      fulfilled_at: null,
      reminder_count: 0,
      contact,
    };
    setPledges(prev => [newPledge, ...prev]);
    return newPledge;
  }, [contacts]);

  const updatePledgeStatus = useCallback((id: string, status: string) => {
    setPledges(prev => prev.map(p =>
      p.id === id ? {
        ...p,
        status: status as Pledge['status'],
        fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : p.fulfilled_at,
      } : p
    ));
  }, []);

  return (
    <DataContext.Provider value={{
      contacts, addContact, addContactsBatch, updateContact, deleteContact,
      sessions, createSession, getActiveSession, startSession, completeSession,
      sessionContacts, getSessionQueue, updateSessionContactStatus,
      calls, createCall, updateCall,
      pledges, createPledge, updatePledgeStatus,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
}
