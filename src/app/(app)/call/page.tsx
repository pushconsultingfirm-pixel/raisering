'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency, formatDuration } from '@/lib/types';
import { createClient } from '@/lib/supabase';
import CallScript from '@/components/CallScript';
import { useTranscription } from '@/hooks/useTranscription';
import type { Contact, CallOutcome } from '@/lib/types';

type CallState = 'loading' | 'no_session' | 'idle' | 'on_call' | 'post_call' | 'session_complete';

const outcomeOptions: { value: CallOutcome; label: string; color: string }[] = [
  { value: 'pledged', label: 'Pledged', color: 'bg-green-100 text-green-800' },
  { value: 'declined', label: 'Declined', color: 'bg-red-100 text-red-800' },
  { value: 'callback', label: 'Callback', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'voicemail', label: 'Voicemail', color: 'bg-gray-100 text-gray-800' },
  { value: 'no_answer', label: 'No Answer', color: 'bg-gray-100 text-gray-800' },
  { value: 'wrong_number', label: 'Wrong #', color: 'bg-red-100 text-red-800' },
  { value: 'event_rsvp', label: 'Event RSVP', color: 'bg-blue-100 text-blue-800' },
];

interface QueueItem {
  id: string;
  contact: Contact;
  status: string;
}

export default function CallPage() {
  const {
    isListening, transcript, interimText, error: transcriptionError,
    startListening, stopListening, clearTranscript,
  } = useTranscription();

  const [callState, setCallState] = useState<CallState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userName, setUserName] = useState('Caller');
  const [orgName, setOrgName] = useState('Campaign');
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callStartTime, setCallStartTime] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [sessionStats, setSessionStats] = useState({
    callsMade: 0,
    totalTalkSeconds: 0,
    totalIdleSeconds: 0,
    totalPledged: 0,
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load user + contacts from Supabase
  useEffect(() => {
    async function load() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || !supabaseUrl.startsWith('http') || supabaseUrl === 'your-supabase-url') {
        setCallState('no_session');
        return;
      }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCallState('no_session'); return; }

        setUserId(user.id);

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('organization_id, name')
          .eq('id', user.id)
          .single();
        if (profileError) {
          console.error('Profile query error:', profileError);
        }
        if (!profile) { setCallState('no_session'); return; }

        setOrgId(profile.organization_id);
        setUserName(profile.name);

        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', profile.organization_id)
          .single();
        if (org) setOrgName(org.name);

        const { data: contacts } = await supabase
          .from('contacts')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('name');

        setAllContacts(contacts || []);
        setCallState('no_session');
      } catch {
        setCallState('no_session');
      }
    }
    load();
  }, []);

  // Timer — tracks both call time and idle time between calls
  useEffect(() => {
    if (callState === 'on_call') {
      timerRef.current = setInterval(() => setCallSeconds(s => s + 1), 1000);
    } else if (callState === 'idle') {
      // Always track idle time when in the queue, even before the first call
      timerRef.current = setInterval(() => setIdleSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  const currentItem = queue[currentIndex];
  const currentContact = currentItem?.contact;
  const askAmount = currentContact?.manual_ask_override ?? currentContact?.ai_recommended_ask;
  const remainingCount = queue.filter(q => q.status === 'queued').length;

  function handleQuickStart() {
    if (allContacts.length === 0) return;
    setQueue(allContacts.map(c => ({
      id: `q-${c.id}`,
      contact: c,
      status: 'queued',
    })));
    setCallState('idle');
  }

  function handleStartCall() {
    if (!currentItem) return;
    // Capture idle time before starting the call
    if (idleSeconds > 0) {
      setSessionStats(prev => ({
        ...prev,
        totalIdleSeconds: prev.totalIdleSeconds + idleSeconds,
      }));
    }
    setCallState('on_call');
    setCallSeconds(0);
    setIdleSeconds(0);
    setCallStartTime(new Date().toISOString());
    clearTranscript();
    startListening();
  }

  function handleEndCall() {
    setCallState('post_call');
    if (timerRef.current) clearInterval(timerRef.current);
    stopListening();

    if (currentContact) {
      setFollowUpDraft(
        `Hi ${currentContact.name.split(' ')[0]}, great speaking with you today! ` +
        `Thank you for your time and your interest in our work. ` +
        (askAmount ? `As we discussed, your support of ${formatCurrency(askAmount)} would make a real difference. ` : '') +
        `Please don't hesitate to reach out if you have any questions.`
      );
    }
  }

  async function handleConfirmAndNext() {
    // Save call to Supabase
    if (userId && orgId && currentContact) {
      try {
        const supabase = createClient();

        // We need a session_contact record — create a quick one if needed
        // For quick-start mode, we create ad-hoc session records
        let sessionId: string;

        // Check if we have a quick session already
        const { data: existingSession } = await supabase
          .from('sessions')
          .select('id')
          .eq('organization_id', orgId)
          .eq('name', 'Quick Call Session')
          .eq('status', 'active')
          .limit(1)
          .single();

        if (existingSession) {
          sessionId = existingSession.id;
        } else {
          // Create one
          const { data: newSession, error: sessErr } = await supabase
            .from('sessions')
            .insert({
              organization_id: orgId,
              created_by: userId,
              name: 'Quick Call Session',
              status: 'active',
            })
            .select()
            .single();
          if (sessErr) throw sessErr;
          sessionId = newSession.id;

          // Add caller
          await supabase.from('session_callers').insert({
            session_id: sessionId,
            user_id: userId,
          });
        }

        // Create or get session_contact
        const { data: existingSc } = await supabase
          .from('session_contacts')
          .select('id')
          .eq('session_id', sessionId)
          .eq('contact_id', currentContact.id)
          .limit(1)
          .single();

        let sessionContactId: string;
        if (existingSc) {
          sessionContactId = existingSc.id;
        } else {
          const { data: newSc, error: scErr } = await supabase
            .from('session_contacts')
            .insert({
              session_id: sessionId,
              contact_id: currentContact.id,
              assigned_caller_id: userId,
              call_order: sessionStats.callsMade,
              status: 'completed',
            })
            .select()
            .single();
          if (scErr) throw scErr;
          sessionContactId = newSc.id;
        }

        // Save the call
        const { data: savedCall, error: callErr } = await supabase
          .from('calls')
          .insert({
            session_contact_id: sessionContactId,
            caller_id: userId,
            started_at: callStartTime,
            ended_at: new Date().toISOString(),
            duration_seconds: callSeconds,
            transcript_raw: transcript || null,
            ai_outcome: selectedOutcome,
            ai_pledge_amount: selectedOutcome === 'pledged' ? parseFloat(pledgeAmount) || 0 : null,
            notes: callNotes || null,
            follow_up_draft: followUpDraft || null,
            confirmed: true,
          })
          .select()
          .single();
        if (callErr) throw callErr;

        // Save pledge if pledged
        if (selectedOutcome === 'pledged' && parseFloat(pledgeAmount) > 0 && savedCall) {
          await supabase.from('pledges').insert({
            call_id: savedCall.id,
            contact_id: currentContact.id,
            organization_id: orgId,
            amount: parseFloat(pledgeAmount),
            status: 'outstanding',
          });
        }

        // Update contact notes with call info
        if (callNotes) {
          const existingNotes = currentContact.notes || '';
          const dateStr = new Date().toLocaleDateString();
          const newNotes = existingNotes
            ? `${existingNotes}\n\n[${dateStr}] ${selectedOutcome}: ${callNotes}`
            : `[${dateStr}] ${selectedOutcome}: ${callNotes}`;
          await supabase.from('contacts').update({ notes: newNotes }).eq('id', currentContact.id);
        }
      } catch (err) {
        console.error('Failed to save call:', err);
        // Continue anyway — don't block the caller
      }
    }

    // Update stats
    const pledged = selectedOutcome === 'pledged' ? (parseFloat(pledgeAmount) || 0) : 0;
    setSessionStats(prev => ({
      callsMade: prev.callsMade + 1,
      totalTalkSeconds: prev.totalTalkSeconds + callSeconds,
      totalIdleSeconds: prev.totalIdleSeconds,
      totalPledged: prev.totalPledged + pledged,
    }));

    // Reset
    setCallSeconds(0);
    setIdleSeconds(0);
    setCallStartTime(null);
    setSelectedOutcome(null);
    setPledgeAmount('');
    setCallNotes('');
    setFollowUpDraft('');

    // Advance to next contact or finish
    if (currentIndex + 1 >= queue.length) {
      setCallState('session_complete');
    } else {
      setCurrentIndex(prev => prev + 1);
      setCallState('idle');
    }
  }

  function handleSkip() {
    if (currentIndex + 1 >= queue.length) {
      setCallState('session_complete');
    } else {
      setCurrentIndex(prev => prev + 1);
      setCallState('idle');
    }
    setSelectedOutcome(null);
    setPledgeAmount('');
    setCallNotes('');
    setFollowUpDraft('');
  }

  function handleSendFollowUp(method: 'sms' | 'email') {
    if (!currentContact) return;
    const encoded = encodeURIComponent(followUpDraft);
    if (method === 'sms') {
      window.open(`sms:${currentContact.phone}?body=${encoded}`);
    } else if (currentContact.email) {
      window.open(`mailto:${currentContact.email}?subject=Following%20up&body=${encoded}`);
    }
  }

  // ---- LOADING ----
  if (callState === 'loading') {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-500">Loading contacts...</p></div>;
  }

  // ---- NO SESSION ----
  if (callState === 'no_session') {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">Call Time</h1>
        <p className="mt-1 text-sm text-gray-500">Start making fundraising calls</p>

        <div className="mt-6">
          <button onClick={handleQuickStart} disabled={allContacts.length === 0}
            className="w-full rounded-lg bg-indigo-600 py-4 text-lg font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition">
            {allContacts.length > 0 ? `Start Calling — ${allContacts.length} Contacts` : 'No Contacts Yet'}
          </button>
          {allContacts.length === 0 && (
            <p className="mt-3 text-center text-sm text-gray-500">
              <a href="/onboarding" className="text-indigo-600 hover:underline">Import contacts</a> to get started.
            </p>
          )}
        </div>
        {allContacts.length > 0 && (
          <p className="mt-4 text-center text-xs text-gray-500">
            Or <a href="/sessions/new" className="text-indigo-600 hover:underline">create a session</a> to select specific contacts
          </p>
        )}
      </div>
    );
  }

  // ---- SESSION COMPLETE ----
  if (callState === 'session_complete') {
    const totalSessionSeconds = sessionStats.totalTalkSeconds + sessionStats.totalIdleSeconds;
    const dollarsPerHour = sessionStats.totalTalkSeconds > 0
      ? (sessionStats.totalPledged / (sessionStats.totalTalkSeconds / 3600)) : 0;
    const efficiency = totalSessionSeconds > 0
      ? Math.round((sessionStats.totalTalkSeconds / totalSessionSeconds) * 100) : 0;

    return (
      <div className="mx-auto max-w-lg text-center py-12">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Session Complete!</h2>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase">Calls Made</p>
            <p className="text-3xl font-bold text-gray-900">{sessionStats.callsMade}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase">Talk Time</p>
            <p className="text-3xl font-bold text-gray-900">{formatDuration(sessionStats.totalTalkSeconds)}</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="text-xs text-green-700 uppercase">Total Pledged</p>
            <p className="text-3xl font-bold text-green-700">{formatCurrency(sessionStats.totalPledged)}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase">$/Hour</p>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(Math.round(dollarsPerHour))}</p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase">Idle Time</p>
            <p className={`text-3xl font-bold ${sessionStats.totalIdleSeconds > sessionStats.totalTalkSeconds ? 'text-red-600' : 'text-amber-600'}`}>
              {formatDuration(sessionStats.totalIdleSeconds)}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-gray-200 p-4">
            <p className="text-xs text-gray-500 uppercase">Efficiency</p>
            <p className={`text-3xl font-bold ${efficiency >= 70 ? 'text-green-600' : efficiency >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {efficiency}%
            </p>
          </div>
        </div>
        <div className="mt-8 flex justify-center gap-3">
          <a href="/dashboard" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Dashboard</a>
          <a href="/pledges" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Pledges</a>
        </div>
      </div>
    );
  }

  // ---- NO CONTACTS LEFT ----
  if (!currentContact) {
    return (
      <div className="mx-auto max-w-lg text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">No more contacts</h2>
        <button onClick={() => setCallState('session_complete')}
          className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          View Session Summary
        </button>
      </div>
    );
  }

  // ---- ACTIVE CALLING ----
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm">
        <span className="text-gray-500">{queue.length - currentIndex} remaining</span>
        <div className="flex gap-4">
          <span>{sessionStats.callsMade} calls</span>
          <span>{formatDuration(sessionStats.totalTalkSeconds)} talk</span>
          {sessionStats.totalIdleSeconds > 0 && (
            <span className="text-amber-600">{formatDuration(sessionStats.totalIdleSeconds)} idle</span>
          )}
          <span className="font-medium text-green-600">{formatCurrency(sessionStats.totalPledged)} pledged</span>
        </div>
      </div>

      {/* Briefing card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{currentContact.name}</h2>
            <p className="text-sm text-gray-500">
              {currentContact.occupation}{currentContact.employer && ` at ${currentContact.employer}`}
            </p>
          </div>
          {askAmount && (
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500 uppercase">Ask Amount</p>
              <p className="text-2xl font-bold text-indigo-600">{formatCurrency(askAmount)}</p>
              {currentContact.ai_recommended_ask && !currentContact.manual_ask_override && (
                <p className="text-xs text-indigo-400">AI recommended</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <a href={`tel:${currentContact.phone}`}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            {currentContact.phone}
          </a>
          {currentContact.email && (
            <a href={`mailto:${currentContact.email}`}
              className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
              {currentContact.email}
            </a>
          )}
        </div>

        {currentContact.notes && (
          <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-medium text-amber-800 uppercase">Notes</p>
            <p className="mt-1 text-sm text-amber-900 whitespace-pre-wrap">{currentContact.notes}</p>
          </div>
        )}

        <CallScript contact={currentContact} callerName={userName} campaignName={orgName} />
      </div>

      {/* Call controls */}
      <div className="mt-4">
        {callState === 'idle' && (
          <button onClick={handleStartCall}
            className="w-full rounded-lg bg-green-600 py-4 text-lg font-semibold text-white hover:bg-green-700 transition">
            Start Call
            {idleSeconds > 0 && <span className="ml-2 text-sm opacity-75">(idle {formatDuration(idleSeconds)})</span>}
          </button>
        )}

        {callState === 'on_call' && (
          <div>
            <div className="flex items-center justify-between rounded-t-lg bg-green-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-400"></span>
                <span className="font-medium">On Call with {currentContact.name}</span>
              </div>
              <span className="text-lg font-mono">{formatDuration(callSeconds)}</span>
            </div>
            <div className="border-x border-gray-200 bg-white p-4 min-h-[200px]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase">Live Transcript</p>
                {isListening && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-600">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500"></span>
                    Listening
                  </span>
                )}
              </div>
              {transcriptionError && (
                <p className="text-sm text-red-500 mb-2">{transcriptionError}</p>
              )}
              {transcript || interimText ? (
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {transcript}
                  {interimText && (
                    <span className="text-gray-400 italic">{transcript ? '\n' : ''}{interimText}</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  {isListening
                    ? 'Listening... start speaking and the transcript will appear here.'
                    : 'Put your phone on speaker and the AI will transcribe the conversation.'}
                </p>
              )}
            </div>
            <button onClick={handleEndCall}
              className="w-full rounded-b-lg bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 transition">
              End Call
            </button>
          </div>
        )}

        {callState === 'post_call' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="text-lg font-semibold text-gray-900">Call Summary</h3>
            <p className="text-sm text-gray-500">{currentContact.name} &middot; {formatDuration(callSeconds)}</p>

            {/* Transcript review */}
            {transcript && (
              <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Transcript</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{transcript}</p>
              </div>
            )}

            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Outcome</p>
              <div className="flex flex-wrap gap-2">
                {outcomeOptions.map(opt => (
                  <button key={opt.value} onClick={() => setSelectedOutcome(opt.value)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                      selectedOutcome === opt.value
                        ? opt.color + ' ring-2 ring-offset-1 ring-indigo-500'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedOutcome === 'pledged' && (
              <div className="mt-4">
                <label className="text-sm font-medium text-gray-700">Pledge Amount</label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-gray-500">$</span>
                  <input type="number" value={pledgeAmount} onChange={e => setPledgeAmount(e.target.value)}
                    placeholder={askAmount?.toString() || '0'}
                    className="w-32 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Notes</label>
              <textarea value={callNotes} onChange={e => setCallNotes(e.target.value)} rows={2}
                placeholder="Any notes from the call..."
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            </div>

            {/* Confirm & Next — always visible and prominent */}
            <div className="mt-6 flex gap-3">
              <button onClick={handleConfirmAndNext} disabled={!selectedOutcome}
                className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition">
                {currentIndex + 1 < queue.length ? 'Confirm & Next Call' : 'Confirm & Finish'}
              </button>
              <button onClick={handleSkip}
                className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                Skip
              </button>
            </div>

            {/* Follow-up — optional, below confirm */}
            {followUpDraft && (
              <details className="mt-4 rounded-md border border-gray-200 bg-gray-50">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700 hover:text-indigo-600">
                  Send Follow-Up Message (optional)
                </summary>
                <div className="px-3 pb-3">
                  <textarea value={followUpDraft} onChange={e => setFollowUpDraft(e.target.value)} rows={3}
                    className="mt-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => handleSendFollowUp('sms')}
                      className="rounded-md bg-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-200">
                      Send as Text
                    </button>
                    {currentContact.email && (
                      <button onClick={() => handleSendFollowUp('email')}
                        className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">
                        Send as Email
                      </button>
                    )}
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
