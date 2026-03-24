'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/types';
import { useData } from '@/lib/data-context';
import { createClient } from '@/lib/supabase';
import type { Contact } from '@/lib/types';

export default function ContactsPage() {
  const { contacts: localContacts, deleteContact: localDelete } = useData();
  const [dbContacts, setDbContacts] = useState<Contact[]>([]);
  const [useDb, setUseDb] = useState(false);
  const [search, setSearch] = useState('');

  // Try to load from Supabase, fall back to local
  useEffect(() => {
    async function loadContacts() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || supabaseUrl === 'your-supabase-url' || !supabaseUrl.startsWith('http')) return;

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        if (!profile) return;

        const { data: contacts } = await supabase
          .from('contacts')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('name');

        if (contacts) {
          setDbContacts(contacts);
          setUseDb(true);
        }
      } catch {
        // Fall back to local
      }
    }
    loadContacts();
  }, []);

  const contacts = useDb ? dbContacts : localContacts;

  async function handleDelete(id: string) {
    if (useDb) {
      const supabase = createClient();
      await supabase.from('contacts').delete().eq('id', id);
      setDbContacts(prev => prev.filter(c => c.id !== id));
    } else {
      localDelete(id);
    }
  }

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.occupation?.toLowerCase().includes(search.toLowerCase()) ||
    c.employer?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const totalAsk = contacts.reduce((sum, c) =>
    sum + (c.manual_ask_override || c.ai_recommended_ask || 0), 0
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {contacts.length} contacts{totalAsk > 0 && <> &middot; {formatCurrency(totalAsk)} total ask potential</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/contacts/import"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Import Contacts
          </Link>
          <Link
            href="/contacts/new"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Add Contact
          </Link>
        </div>
      </div>

      <div className="mt-6">
        <input
          type="text"
          placeholder="Search by name, occupation, employer, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="hidden min-w-full divide-y divide-gray-200 sm:table">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Occupation</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ask Amount</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{contact.name}</div>
                  {contact.email && <div className="text-xs text-gray-500">{contact.email}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  <a href={`tel:${contact.phone}`} className="text-indigo-600 hover:underline">{contact.phone}</a>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {contact.occupation}
                  {contact.employer && <span className="text-gray-500"> at {contact.employer}</span>}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {(contact.manual_ask_override || contact.ai_recommended_ask)
                    ? formatCurrency(contact.manual_ask_override || contact.ai_recommended_ask!)
                    : '—'}
                  {contact.ai_recommended_ask && !contact.manual_ask_override && (
                    <span className="ml-1 text-xs text-indigo-500">AI</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {contact.source.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(contact.id)} className="text-xs text-red-500 hover:text-red-700">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="divide-y divide-gray-200 sm:hidden">
          {filtered.map((contact) => (
            <div key={contact.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900">{contact.name}</div>
                <div className="text-sm font-medium text-gray-900">
                  {(contact.manual_ask_override || contact.ai_recommended_ask)
                    ? formatCurrency(contact.manual_ask_override || contact.ai_recommended_ask!)
                    : '—'}
                </div>
              </div>
              <div className="mt-1 text-sm text-gray-500">
                {contact.occupation}{contact.employer && ` at ${contact.employer}`}
              </div>
              <div className="mt-1 flex items-center justify-between">
                <a href={`tel:${contact.phone}`} className="text-sm text-indigo-600">{contact.phone}</a>
                <button onClick={() => handleDelete(contact.id)} className="text-xs text-red-500">Delete</button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500">
            {search ? 'No contacts match your search.' : 'No contacts yet. Import or add contacts to get started.'}
          </div>
        )}
      </div>
    </div>
  );
}
