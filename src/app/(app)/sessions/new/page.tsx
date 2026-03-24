'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { formatCurrency } from '@/lib/types';

export default function NewSessionPage() {
  const router = useRouter();
  const { contacts, createSession } = useData();

  const [sessionName, setSessionName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [addToGoogleCal, setAddToGoogleCal] = useState(false);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState('90');

  function toggleContact(id: string) {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }

  function selectAllContacts() {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map(c => c.id));
    }
  }

  function buildGoogleCalendarUrl(name: string, startDate: string, startTime: string, durationMin: number) {
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const contactNames = contacts
      .filter(c => selectedContacts.includes(c.id))
      .map(c => c.name)
      .slice(0, 10);
    const contactList = contactNames.join(', ') + (selectedContacts.length > 10 ? `, +${selectedContacts.length - 10} more` : '');

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: name || 'Call Time Session',
      dates: `${fmt(start)}/${fmt(end)}`,
      details: `Call Time Session — ${selectedContacts.length} contacts to call (${formatCurrency(totalAsk)} total ask)\n\nContacts: ${contactList}\n\nManage session: ${window.location.origin}/call`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function handleCreate() {
    const name = sessionName || 'Call Time Session';
    const scheduledStart = scheduledDate && scheduledTime
      ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
      : undefined;

    createSession(
      name,
      ['demo'],
      selectedContacts,
      'shared',
      scheduledStart,
    );

    if (addToGoogleCal && scheduledDate && scheduledTime) {
      const calUrl = buildGoogleCalendarUrl(name, scheduledDate, scheduledTime, parseInt(sessionDurationMinutes) || 90);
      window.open(calUrl, '_blank');
    }

    router.push('/sessions');
  }

  const totalAsk = contacts
    .filter(c => selectedContacts.includes(c.id))
    .reduce((sum, c) => sum + (c.manual_ask_override || c.ai_recommended_ask || 0), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">New Session</h1>
      <p className="mt-1 text-sm text-gray-500">Set up a call time session</p>

      <div className="mt-8 space-y-8">
        {/* Session details */}
        <section>
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Details</h2>
          <div className="mt-3 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Session Name</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="e.g. Tuesday Evening Call Time"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date (optional)</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Time (optional)</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Duration</label>
              <select
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
              </select>
            </div>

            {/* Google Calendar */}
            {scheduledDate && scheduledTime && (
              <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={addToGoogleCal}
                  onChange={(e) => setAddToGoogleCal(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="#4285F4" strokeWidth="2"/>
                    <path d="M3 9h18" stroke="#4285F4" strokeWidth="2"/>
                    <path d="M9 4V2M15 4V2" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Add to Google Calendar</p>
                    <p className="text-xs text-gray-500">Opens Google Calendar with the session pre-filled</p>
                  </div>
                </div>
              </label>
            )}
          </div>
        </section>

        {/* Contacts */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Contacts
              <span className="ml-2 text-xs font-normal text-gray-500 normal-case">
                {selectedContacts.length} selected
                {totalAsk > 0 && <> &middot; {formatCurrency(totalAsk)} total ask</>}
              </span>
            </h2>
            <button onClick={selectAllContacts} className="text-xs text-indigo-600 hover:underline">
              {selectedContacts.length === contacts.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {contacts.length === 0 ? (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
              No contacts yet. <a href="/contacts/import" className="text-indigo-600 hover:underline">Import contacts</a> first.
            </div>
          ) : (
            <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white">
              {contacts.map(contact => {
                const ask = contact.manual_ask_override || contact.ai_recommended_ask;
                return (
                  <label
                    key={contact.id}
                    className={`flex items-center justify-between border-b border-gray-100 last:border-0 px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${
                      selectedContacts.includes(contact.id) ? 'bg-indigo-50/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleContact(contact.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        <p className="text-xs text-gray-500">
                          {contact.phone}
                          {contact.occupation && <> &middot; {contact.occupation}</>}
                        </p>
                      </div>
                    </div>
                    {ask && (
                      <span className="text-sm font-medium text-gray-700">{formatCurrency(ask)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </section>

        {/* Create button */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            onClick={handleCreate}
            disabled={selectedContacts.length === 0}
            className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            Create Session ({selectedContacts.length} contacts)
          </button>
          <button
            onClick={() => router.push('/sessions')}
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
