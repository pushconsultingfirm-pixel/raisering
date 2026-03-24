'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { createClient } from '@/lib/supabase';
import type { WealthTier } from '@/lib/types';

export default function NewContactPage() {
  const router = useRouter();
  const { addContact } = useData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [occupation, setOccupation] = useState('');
  const [employer, setEmployer] = useState('');
  const [notes, setNotes] = useState('');
  const [askAmount, setAskAmount] = useState('');
  const [wealthTier, setWealthTier] = useState<WealthTier | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const useDb = supabaseUrl && supabaseUrl !== 'your-supabase-url' && supabaseUrl.startsWith('http');

    if (useDb) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not logged in');

        const { data: profile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        if (!profile) throw new Error('No profile found');

        const { error: insertError } = await supabase.from('contacts').insert({
          organization_id: profile.organization_id,
          uploaded_by: user.id,
          name,
          phone,
          email: email || null,
          occupation: occupation || null,
          employer: employer || null,
          notes: notes || null,
          estimated_wealth_tier: wealthTier || null,
          ai_recommended_ask: null,
          manual_ask_override: askAmount ? parseFloat(askAmount) : null,
          source: 'manual',
        });

        if (insertError) throw insertError;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to save');
        setSaving(false);
        return;
      }
    } else {
      addContact({
        name,
        phone,
        email: email || null,
        occupation: occupation || null,
        employer: employer || null,
        notes: notes || null,
        estimated_wealth_tier: (wealthTier as WealthTier) || null,
        ai_recommended_ask: null,
        manual_ask_override: askAmount ? parseFloat(askAmount) : null,
        source: 'manual',
      });
    }

    router.push('/contacts');
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Add Contact</h1>
      <p className="mt-1 text-sm text-gray-500">Add a new contact to your organization</p>

      <div className="mt-8 space-y-5">
        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (404) 555-1234"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Occupation / Title</label>
            <input type="text" value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="Attorney, Doctor, etc."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Employer / Company</label>
            <input type="text" value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Smith & Associates"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Ask Amount <span className="ml-1 text-xs font-normal text-gray-400">(leave blank for AI recommendation)</span>
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-gray-500">$</span>
            <input type="number" value={askAmount} onChange={(e) => setAskAmount(e.target.value)} placeholder="AI will recommend"
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Estimated Giving Capacity <span className="ml-1 text-xs font-normal text-gray-400">(helps AI calibrate the ask)</span>
          </label>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {([
              { value: 'low', label: 'Low', desc: 'Under $250' },
              { value: 'mid', label: 'Mid', desc: '$250–$1,000' },
              { value: 'high', label: 'High', desc: '$1,000–$5,000' },
              { value: 'very_high', label: 'Very High', desc: '$5,000+' },
            ] as const).map(tier => (
              <button key={tier.value} type="button" onClick={() => setWealthTier(tier.value)}
                className={`rounded-md border p-2 text-center text-xs transition ${
                  wealthTier === tier.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}>
                <p className="font-medium">{tier.label}</p>
                <p className="text-gray-400">{tier.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="How do you know this person? Any context for the call? Past giving history?"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          <p className="mt-1 text-xs text-gray-400">The more context you provide, the better the AI can personalize the script and ask amount.</p>
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button onClick={handleSave} disabled={!name || !phone || saving}
            className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition">
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
          <button onClick={() => router.push('/contacts')}
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
