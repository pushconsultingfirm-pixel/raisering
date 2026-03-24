'use client';

import { useState } from 'react';
import { useData } from '@/lib/data-context';
import { createClient } from '@/lib/supabase';
import type { Contact, ContactSource } from '@/lib/types';

interface CSVRow {
  [key: string]: string;
}

type FieldMapping = {
  name: string | null;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  employer: string | null;
  notes: string | null;
  ask_amount: string | null;
};

const requiredFields = ['name', 'phone'] as const;
const optionalFields = ['email', 'occupation', 'employer', 'notes', 'ask_amount'] as const;
const allFields = [...requiredFields, ...optionalFields];

const fieldLabels: Record<string, string> = {
  name: 'Full Name',
  phone: 'Phone Number',
  email: 'Email',
  occupation: 'Occupation / Job Title',
  employer: 'Employer / Company',
  notes: 'Notes',
  ask_amount: 'Ask Amount ($)',
};

type ImportStep = 'upload' | 'mapping' | 'review' | 'complete';

export default function ImportContactsPage() {
  const { addContactsBatch } = useData();
  const [step, setStep] = useState<ImportStep>('upload');
  const [importMethod, setImportMethod] = useState<ContactSource>('csv');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({
    name: null, phone: null, email: null,
    occupation: null, employer: null, notes: null, ask_amount: null,
  });
  const [importedContacts, setImportedContacts] = useState<Partial<Contact>[]>([]);

  function parseCSV(text: string): { headers: string[]; rows: CSVRow[] } {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };

    const headers = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      const row: CSVRow = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });

    return { headers, rows };
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;

      if (file.name.endsWith('.vcf')) {
        handleVCardImport(text);
        return;
      }

      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvData(rows);

      // Auto-detect column mappings
      const autoMapping: FieldMapping = {
        name: null, phone: null, email: null,
        occupation: null, employer: null, notes: null, ask_amount: null,
      };

      headers.forEach(h => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, '');
        if (lower.includes('name') && !lower.includes('first') && !lower.includes('last')) autoMapping.name = h;
        if (lower.includes('firstname') || lower === 'first') autoMapping.name = autoMapping.name || `${h}+`; // flag for combining
        if (lower.includes('phone') || lower.includes('mobile') || lower.includes('cell') || lower.includes('tel')) autoMapping.phone = autoMapping.phone || h;
        if (lower.includes('email') || lower.includes('mail')) autoMapping.email = autoMapping.email || h;
        if (lower.includes('occupation') || lower.includes('title') || lower.includes('job')) autoMapping.occupation = autoMapping.occupation || h;
        if (lower.includes('employer') || lower.includes('company') || lower.includes('org')) autoMapping.employer = autoMapping.employer || h;
        if (lower.includes('note') || lower.includes('comment') || lower.includes('memo')) autoMapping.notes = autoMapping.notes || h;
        if (lower.includes('ask') || lower.includes('amount') || lower.includes('goal')) autoMapping.ask_amount = autoMapping.ask_amount || h;
      });

      // Handle "Full Name" or single "Name" column
      if (!autoMapping.name) {
        const nameCol = headers.find(h => h.toLowerCase().includes('name'));
        if (nameCol) autoMapping.name = nameCol;
      }

      setMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  }

  function handleVCardImport(text: string) {
    const contacts: Partial<Contact>[] = [];
    const cards = text.split('BEGIN:VCARD');

    cards.forEach(card => {
      if (!card.includes('END:VCARD')) return;

      const getName = (card: string) => {
        const fn = card.match(/FN[;:](.+)/);
        if (fn) return fn[1].trim();
        const n = card.match(/N[;:]([^;]+);([^;]+)/);
        if (n) return `${n[2].trim()} ${n[1].trim()}`;
        return null;
      };

      const getPhone = (card: string) => {
        const tel = card.match(/TEL[^:]*:(.+)/);
        return tel ? tel[1].trim().replace(/\s/g, '') : null;
      };

      const getEmail = (card: string) => {
        const email = card.match(/EMAIL[^:]*:(.+)/);
        return email ? email[1].trim() : null;
      };

      const getOrg = (card: string) => {
        const org = card.match(/ORG[^:]*:(.+)/);
        return org ? org[1].trim().replace(/;/g, ', ') : null;
      };

      const getTitle = (card: string) => {
        const title = card.match(/TITLE[^:]*:(.+)/);
        return title ? title[1].trim() : null;
      };

      const name = getName(card);
      const phone = getPhone(card);

      if (name && phone) {
        contacts.push({
          name,
          phone,
          email: getEmail(card) || undefined,
          employer: getOrg(card) || undefined,
          occupation: getTitle(card) || undefined,
          source: 'vcard',
        });
      }
    });

    setImportedContacts(contacts);
    setStep('review');
  }

  function handleMappingComplete() {
    const contacts: Partial<Contact>[] = [];
    for (const row of csvData) {
      const name = mapping.name ? row[mapping.name] : '';
      const phone = mapping.phone ? row[mapping.phone] : '';
      if (!name || !phone) continue;
      contacts.push({
        name: name.trim(),
        phone: phone.trim(),
        email: mapping.email ? row[mapping.email]?.trim() || undefined : undefined,
        occupation: mapping.occupation ? row[mapping.occupation]?.trim() || undefined : undefined,
        employer: mapping.employer ? row[mapping.employer]?.trim() || undefined : undefined,
        notes: mapping.notes ? row[mapping.notes]?.trim() || undefined : undefined,
        manual_ask_override: mapping.ask_amount ? parseFloat(row[mapping.ask_amount]) || undefined : undefined,
        source: 'csv' as ContactSource,
      });
    }

    setImportedContacts(contacts);
    setStep('review');
  }

  async function handleImport() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const useDb = supabaseUrl && supabaseUrl !== 'your-supabase-url' && supabaseUrl.startsWith('http');

    const mapped = importedContacts.map(c => ({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || null,
      occupation: c.occupation || null,
      employer: c.employer || null,
      notes: c.notes || null,
      estimated_wealth_tier: null,
      ai_recommended_ask: null,
      manual_ask_override: (c as { manual_ask_override?: number }).manual_ask_override
        ? Number((c as { manual_ask_override?: number }).manual_ask_override)
        : null,
      source: (c.source || 'csv') as ContactSource,
    }));

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
        if (!profile) throw new Error('No profile');

        const rows = mapped.map(c => ({
          ...c,
          organization_id: profile.organization_id,
          uploaded_by: user.id,
        }));

        const { error } = await supabase.from('contacts').insert(rows);
        if (error) throw error;
      } catch (err) {
        console.error('Import failed:', err);
        // Fall back to local
        addContactsBatch(mapped);
      }
    } else {
      addContactsBatch(mapped);
    }

    setStep('complete');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Import Contacts</h1>
      <p className="mt-1 text-sm text-gray-500">
        Upload your contacts from a file or connect an account
      </p>

      {/* Step indicator */}
      <div className="mt-6 flex items-center gap-2 text-sm">
        {(['upload', 'mapping', 'review', 'complete'] as ImportStep[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-gray-300" />}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              step === s
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="mt-8">
          {/* Import method selector */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ImportMethodCard
              title="CSV / Spreadsheet"
              description="Upload a .csv file exported from Excel, Google Sheets, or any CRM"
              selected={importMethod === 'csv'}
              onClick={() => setImportMethod('csv')}
            />
            <ImportMethodCard
              title="vCard (.vcf)"
              description="Import contacts exported from your phone or email client"
              selected={importMethod === 'vcard'}
              onClick={() => setImportMethod('vcard')}
            />
            <ImportMethodCard
              title="LinkedIn Export"
              description="Upload the CSV from LinkedIn's data export (Settings > Data Privacy)"
              selected={importMethod === 'linkedin'}
              onClick={() => setImportMethod('linkedin')}
            />
            <ImportMethodCard
              title="Google Contacts"
              description="Connect your Google account to import contacts directly"
              selected={importMethod === 'google_contacts'}
              onClick={() => setImportMethod('google_contacts')}
              comingSoon
            />
          </div>

          {/* File upload area */}
          {importMethod !== 'google_contacts' && (
            <div className="mt-6">
              <label className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition">
                <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-2 text-sm font-medium text-gray-700">
                  Click to upload or drag and drop
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {importMethod === 'csv' || importMethod === 'linkedin' ? '.csv files' : '.vcf files'}
                </p>
                <input
                  type="file"
                  className="hidden"
                  accept={importMethod === 'vcard' ? '.vcf,text/vcard,text/x-vcard' : '.csv,text/csv,text/plain'}
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          )}

          {importMethod === 'google_contacts' && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center">
              <p className="text-sm text-gray-500">
                Google Contacts integration coming soon. For now, export your contacts from Google as a CSV and upload above.
              </p>
              <a
                href="https://contacts.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
              >
                Open Google Contacts to export
              </a>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && (
        <div className="mt-8">
          <p className="text-sm text-gray-600 mb-4">
            We found <strong>{csvData.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns.
            Map your columns to the right fields:
          </p>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="space-y-4">
              {allFields.map((field) => (
                <div key={field} className="flex items-center gap-4">
                  <label className="w-40 text-sm font-medium text-gray-700 flex items-center gap-1">
                    {fieldLabels[field]}
                    {requiredFields.includes(field as typeof requiredFields[number]) && (
                      <span className="text-red-500">*</span>
                    )}
                  </label>
                  <select
                    value={mapping[field as keyof FieldMapping] || ''}
                    onChange={(e) => setMapping(prev => ({
                      ...prev,
                      [field]: e.target.value || null,
                    }))}
                    className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— Skip —</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {csvData.length > 0 && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Preview (first 3 rows)</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr>
                        {allFields.filter(f => mapping[f as keyof FieldMapping]).map(f => (
                          <th key={f} className="px-2 py-1 text-left font-medium text-gray-500">{fieldLabels[f]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {allFields.filter(f => mapping[f as keyof FieldMapping]).map(f => (
                            <td key={f} className="px-2 py-1 text-gray-700">
                              {row[mapping[f as keyof FieldMapping]!] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleMappingComplete}
                disabled={!mapping.name || !mapping.phone}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Continue to Review
              </button>
              <button
                onClick={() => { setStep('upload'); setCsvData([]); setCsvHeaders([]); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="mt-8">
          <p className="text-sm text-gray-600 mb-4">
            Ready to import <strong>{importedContacts.length}</strong> contacts.
          </p>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Email</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Occupation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {importedContacts.map((c, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2 text-gray-700">{c.phone}</td>
                    <td className="px-4 py-2 text-gray-700">{c.email || '—'}</td>
                    <td className="px-4 py-2 text-gray-700">{c.occupation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleImport}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Import {importedContacts.length} Contacts
            </button>
            <button
              onClick={() => setStep(csvData.length > 0 ? 'mapping' : 'upload')}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-green-900">
            {importedContacts.length} contacts imported!
          </h2>
          <p className="mt-1 text-sm text-green-700">
            Your contacts are ready. AI will recommend ask amounts based on the information provided.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/contacts"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              View Contacts
            </a>
            <a
              href="/call"
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Start Calling
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportMethodCard({ title, description, selected, onClick, comingSoon }: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  comingSoon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-lg border-2 p-4 text-left transition ${
        selected
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {comingSoon && (
        <span className="absolute top-2 right-2 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
          Coming soon
        </span>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </button>
  );
}
