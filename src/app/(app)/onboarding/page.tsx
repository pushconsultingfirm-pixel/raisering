'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import type { ContactSource } from '@/lib/types';

type OnboardingStep = 'welcome' | 'import_method' | 'google' | 'mac' | 'manual' | 'upload' | 'processing' | 'done';

interface ParsedContact {
  name: string;
  phone: string;
  email?: string;
  occupation?: string;
  employer?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [importedContacts, setImportedContacts] = useState<ParsedContact[]>([]);
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);

  // Manual entry
  const [manualContacts, setManualContacts] = useState<{ name: string; phone: string; email: string }[]>([
    { name: '', phone: '', email: '' },
  ]);

  function addManualRow() {
    setManualContacts(prev => [...prev, { name: '', phone: '', email: '' }]);
  }

  function updateManualRow(index: number, field: string, value: string) {
    setManualContacts(prev => prev.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    ));
  }

  function removeManualRow(index: number) {
    setManualContacts(prev => prev.filter((_, i) => i !== index));
  }

  function parseVCard(text: string): ParsedContact[] {
    const contacts: ParsedContact[] = [];

    // Normalize line endings and unfold folded lines (RFC 2425)
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n[ \t]/g, '');

    const cards = normalized.split('BEGIN:VCARD');

    for (const card of cards) {
      if (!card.includes('END:VCARD')) continue;

      const lines = card.split('\n');

      let name = '';
      let phone = '';
      let email: string | undefined;
      let employer: string | undefined;
      let occupation: string | undefined;

      for (const line of lines) {
        const trimmed = line.trim();

        // Full name (FN)
        if (trimmed.match(/^FN[;:]/i)) {
          const val = trimmed.replace(/^FN[^:]*:/i, '').trim();
          if (val) name = val;
        }

        // Structured name (N) — fallback if no FN
        if (!name && trimmed.match(/^N[;:]/i)) {
          const val = trimmed.replace(/^N[^:]*:/i, '').trim();
          const parts = val.split(';');
          if (parts.length >= 2) {
            const firstName = (parts[1] || '').trim();
            const lastName = (parts[0] || '').trim();
            if (firstName || lastName) name = `${firstName} ${lastName}`.trim();
          }
        }

        // Phone — take first one found
        if (!phone && trimmed.match(/^TEL[;:]/i)) {
          const val = trimmed.replace(/^TEL[^:]*:/i, '').trim();
          const cleaned = val.replace(/[\s\-().]/g, '');
          if (cleaned.length >= 7) phone = cleaned;
        }

        // Email — take first one found
        if (!email && trimmed.match(/^EMAIL[;:]/i)) {
          const val = trimmed.replace(/^EMAIL[^:]*:/i, '').trim();
          if (val.includes('@')) email = val;
        }

        // Organization
        if (!employer && trimmed.match(/^ORG[;:]/i)) {
          const val = trimmed.replace(/^ORG[^:]*:/i, '').trim();
          if (val) employer = val.replace(/;+/g, ', ').replace(/, *$/, '');
        }

        // Title
        if (!occupation && trimmed.match(/^TITLE[;:]/i)) {
          const val = trimmed.replace(/^TITLE[^:]*:/i, '').trim();
          if (val) occupation = val;
        }
      }

      // Only add if we have at least a name and phone
      if (name && phone) {
        contacts.push({ name, phone, email, employer, occupation });
      }
    }

    return contacts;
  }

  function parseCSV(text: string): ParsedContact[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const nameIdx = headers.findIndex(h => h.includes('name'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('tel'));
    const emailIdx = headers.findIndex(h => h.includes('email'));

    if (nameIdx === -1) return [];

    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      return {
        name: vals[nameIdx] || '',
        phone: vals[phoneIdx] || '',
        email: emailIdx >= 0 ? vals[emailIdx] : undefined,
      };
    }).filter(c => c.name && c.phone);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      let contacts: ParsedContact[];

      if (file.name.endsWith('.vcf') || file.type.includes('vcard') || text.includes('BEGIN:VCARD')) {
        contacts = parseVCard(text);
      } else {
        contacts = parseCSV(text);
      }

      if (contacts.length === 0) {
        alert(`No contacts with phone numbers found in this file. Make sure the file contains contact data with phone numbers.`);
        return;
      }

      setImportedContacts(contacts);
      setStep('processing');
    };
    reader.readAsText(file);
  }

  async function saveContacts(contacts: ParsedContact[], source: ContactSource) {
    setImporting(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single();
      if (profileError) {
        console.error('Profile query error:', profileError);
        throw new Error(`Profile lookup failed: ${profileError.message}`);
      }
      if (!profile) throw new Error('No profile found for user ' + user.id);

      const rows = contacts
        .filter(c => c.name && c.phone)
        .map(c => ({
          organization_id: profile.organization_id,
          uploaded_by: user.id,
          name: c.name,
          phone: c.phone,
          email: c.email || null,
          occupation: c.occupation || null,
          employer: c.employer || null,
          source,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('contacts').insert(rows);
        if (error) throw error;
      }

      setImportCount(rows.length);
      setStep('done');
    } catch (err: unknown) {
      console.error('Save failed:', err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      alert(`Failed to save contacts: ${message}`);
    } finally {
      setImporting(false);
    }
  }

  // ---- WELCOME ----
  if (step === 'welcome') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to RaiseRing</h1>
          <p className="mt-3 text-lg text-gray-600">
            Let&apos;s set up your call time program. First, we need your contacts — the people you&apos;ll be calling to raise money.
          </p>
        </div>

        <div className="mt-8 rounded-lg bg-indigo-50 border border-indigo-200 p-5">
          <h2 className="font-semibold text-indigo-900">Why import contacts?</h2>
          <p className="mt-2 text-sm text-indigo-800">
            The foundation of any fundraising program is your personal network. Your phone contacts, email contacts, and professional connections are your first and best source of donors. We&apos;ll help you organize them, recommend ask amounts, and build your call list.
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={() => setStep('import_method')}
            className="w-full rounded-lg bg-indigo-600 py-4 text-lg font-semibold text-white hover:bg-indigo-700 transition"
          >
            Let&apos;s Get Started
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-3 w-full rounded-lg border border-gray-300 py-3 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ---- IMPORT METHOD ----
  if (step === 'import_method') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <h1 className="text-2xl font-bold text-gray-900">Import Your Contacts</h1>
        <p className="mt-2 text-sm text-gray-600">
          Choose how you&apos;d like to bring in your contacts. You can use multiple methods.
        </p>

        <div className="mt-6 space-y-3">
          {/* Google Contacts */}
          <button
            onClick={() => setStep('google')}
            className="flex w-full items-center gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
              <svg className="h-7 w-7" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Google Contacts</p>
              <p className="text-sm text-gray-500">Connect your Google account to import all your contacts automatically</p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Mac Contacts */}
          <button
            onClick={() => setStep('mac')}
            className="flex w-full items-center gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <svg className="h-7 w-7 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">iPhone / Mac Contacts</p>
              <p className="text-sm text-gray-500">Export from your Mac or iPhone Contacts app and upload here</p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Email contacts */}
          <button
            disabled
            className="flex w-full items-center gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 text-left opacity-60 cursor-not-allowed"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
              <svg className="h-7 w-7 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Email Contacts</p>
              <p className="text-sm text-gray-500">Import contacts from your email — coming soon</p>
            </div>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">Soon</span>
          </button>

          {/* Spreadsheet */}
          <button
            onClick={() => setStep('upload')}
            className="flex w-full items-center gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50">
              <svg className="h-7 w-7 text-green-700" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Upload a Spreadsheet</p>
              <p className="text-sm text-gray-500">CSV file from Excel, Google Sheets, or any CRM</p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Manual entry */}
          <button
            onClick={() => setStep('manual')}
            className="flex w-full items-center gap-4 rounded-lg border-2 border-gray-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
              <svg className="h-7 w-7 text-purple-700" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Type Them In</p>
              <p className="text-sm text-gray-500">Manually enter contacts one by one</p>
            </div>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          I&apos;ll do this later
        </button>
      </div>
    );
  }

  // ---- GOOGLE CONTACTS ----
  if (step === 'google') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <button onClick={() => setStep('import_method')} className="text-sm text-indigo-600 hover:underline mb-4">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900">Connect Google Contacts</h1>
        <p className="mt-2 text-sm text-gray-600">
          We&apos;ll request read-only access to your Google Contacts. We never modify or delete anything.
        </p>

        <div className="mt-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <h3 className="font-medium text-blue-900">What we access:</h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-800">
            <li>Contact names and phone numbers</li>
            <li>Email addresses</li>
            <li>Job titles and companies</li>
          </ul>
          <h3 className="mt-3 font-medium text-blue-900">What we don&apos;t access:</h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-800">
            <li>Your emails or calendar</li>
            <li>Your Google Drive or photos</li>
            <li>Anything else in your Google account</li>
          </ul>
        </div>

        <button
          disabled
          className="mt-6 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white opacity-60 cursor-not-allowed"
        >
          Connect Google Account — Coming Soon
        </button>
        <p className="mt-3 text-center text-xs text-gray-500">
          For now, you can export your Google Contacts as a CSV: open{' '}
          <a href="https://contacts.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
            contacts.google.com
          </a>
          , select all, click Export, choose CSV, then{' '}
          <button onClick={() => setStep('upload')} className="text-indigo-600 hover:underline">upload it here</button>.
        </p>
      </div>
    );
  }

  // ---- MAC / IPHONE CONTACTS ----
  if (step === 'mac') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <button onClick={() => setStep('import_method')} className="text-sm text-indigo-600 hover:underline mb-4">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900">Export from Mac or iPhone</h1>
        <p className="mt-2 text-sm text-gray-600">
          Follow these steps to export your contacts, then upload the file here.
        </p>

        {/* Mac instructions */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900">From Mac:</h3>
          <ol className="mt-3 space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">1</span>
              <span>Open the <strong>Contacts</strong> app on your Mac</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">2</span>
              <span>Press <strong>Cmd + A</strong> to select all contacts</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">3</span>
              <span>Go to <strong>File &rarr; Export &rarr; Export vCard...</strong></span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">4</span>
              <span>Save the file, then upload it below</span>
            </li>
          </ol>
        </div>

        {/* iPhone instructions */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900">From iPhone:</h3>
          <ol className="mt-3 space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">1</span>
              <span>Open <strong>Settings &rarr; Contacts</strong> (or <strong>Settings &rarr; Apps &rarr; Contacts</strong>)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">2</span>
              <span>Tap <strong>Export All Contacts</strong></span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">3</span>
              <span>Share or save the .vcf file</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">4</span>
              <span>Upload it below</span>
            </li>
          </ol>
        </div>

        {/* Upload area */}
        <div className="mt-6">
          <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-700">Upload your .vcf file</p>
            <p className="mt-1 text-xs text-gray-500">Tap to select the file from your device</p>
            <input type="file" className="hidden" accept="*/*,.vcf,.csv" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  // ---- MANUAL ENTRY ----
  if (step === 'manual') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <button onClick={() => setStep('import_method')} className="text-sm text-indigo-600 hover:underline mb-4">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900">Add Contacts Manually</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter the people you want to call. You can always add more later.
        </p>

        <div className="mt-6 space-y-3">
          {manualContacts.map((row, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">Contact {i + 1}</span>
                {manualContacts.length > 1 && (
                  <button onClick={() => removeManualRow(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
              </div>
              <div className="space-y-2">
                <input type="text" placeholder="Full Name" value={row.name}
                  onChange={e => updateManualRow(i, 'name', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="tel" placeholder="Phone Number" value={row.phone}
                    onChange={e => updateManualRow(i, 'phone', e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  <input type="email" placeholder="Email (optional)" value={row.email}
                    onChange={e => updateManualRow(i, 'email', e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
          ))}

          <button onClick={addManualRow}
            className="w-full rounded-md border-2 border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition">
            + Add Another Contact
          </button>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => {
              const valid: ParsedContact[] = manualContacts
                .filter(c => c.name.trim() && c.phone.trim())
                .map(c => ({
                  name: c.name.trim(),
                  phone: c.phone.trim(),
                  email: c.email.trim() || undefined,
                }));
              if (valid.length === 0) {
                alert('Please enter at least one contact with a name and phone number.');
                return;
              }
              saveContacts(valid, 'manual');
            }}
            disabled={importing || manualContacts.every(c => !c.name.trim() || !c.phone.trim())}
            className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition">
            {importing ? 'Saving...' : `Save ${manualContacts.filter(c => c.name.trim() && c.phone.trim()).length} Contacts`}
          </button>
        </div>
      </div>
    );
  }

  // ---- CSV UPLOAD ----
  if (step === 'upload') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <button onClick={() => setStep('import_method')} className="text-sm text-indigo-600 hover:underline mb-4">&larr; Back</button>
        <h1 className="text-2xl font-bold text-gray-900">Upload a Spreadsheet</h1>
        <p className="mt-2 text-sm text-gray-600">
          Upload a CSV file with columns for name, phone number, and optionally email.
        </p>

        <div className="mt-6">
          <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition">
            <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-700">Click to upload or drag and drop</p>
            <p className="mt-1 text-xs text-gray-500">.csv or .vcf files</p>
            <input type="file" className="hidden" accept="*/*,.csv,.vcf" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">Expected format:</p>
          <p className="mt-1 text-xs text-gray-600 font-mono">Name, Phone, Email</p>
          <p className="text-xs text-gray-600 font-mono">Jane Smith, 404-555-1234, jane@email.com</p>
        </div>
      </div>
    );
  }

  // ---- PROCESSING / REVIEW ----
  if (step === 'processing') {
    return (
      <div className="mx-auto max-w-lg py-8">
        <h1 className="text-2xl font-bold text-gray-900">Review Contacts</h1>
        <p className="mt-2 text-sm text-gray-600">
          We found <strong>{importedContacts.length}</strong> contacts with phone numbers. Ready to import?
        </p>

        <div className="mt-6 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          {importedContacts.slice(0, 50).map((c, i) => (
            <div key={i} className="px-4 py-2">
              <p className="text-sm font-medium text-gray-900">{c.name}</p>
              <p className="text-xs text-gray-500">{c.phone}{c.email && ` · ${c.email}`}</p>
            </div>
          ))}
          {importedContacts.length > 50 && (
            <div className="px-4 py-2 text-center text-xs text-gray-500">
              ...and {importedContacts.length - 50} more
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => saveContacts(importedContacts, 'csv')}
            disabled={importing}
            className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 transition">
            {importing ? 'Importing...' : `Import ${importedContacts.length} Contacts`}
          </button>
          <button onClick={() => { setImportedContacts([]); setStep('import_method'); }}
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---- DONE ----
  if (step === 'done') {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">{importCount} Contacts Imported!</h2>
        <p className="mt-2 text-gray-600">Your call list is ready. You can always import more later.</p>

        <div className="mt-8 space-y-3">
          <button onClick={() => { setStep('import_method'); setImportedContacts([]); }}
            className="w-full rounded-md border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Import More Contacts
          </button>
          <a href="/call"
            className="block w-full rounded-md bg-green-600 py-3 text-center text-sm font-semibold text-white hover:bg-green-700 transition">
            Start Calling
          </a>
          <a href="/dashboard"
            className="block w-full text-center text-sm text-gray-500 hover:text-gray-700">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return null;
}
