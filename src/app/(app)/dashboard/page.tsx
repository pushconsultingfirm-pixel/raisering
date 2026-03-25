'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { formatCurrency, formatDuration } from '@/lib/types';
import type { Pledge } from '@/lib/types';

interface CallWithContact {
  id: string;
  started_at: string;
  duration_seconds: number | null;
  ai_outcome: string | null;
  ai_pledge_amount: number | null;
  session_contacts: { contact: { name: string; phone: string } | null } | null;
}

export default function DashboardPage() {
  const [contactCount, setContactCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [calls, setCalls] = useState<CallWithContact[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || !supabaseUrl.startsWith('http') || supabaseUrl === 'your-supabase-url') {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single();
        if (!profile) { setLoading(false); return; }

        const orgId = profile.organization_id;

        const [contactsRes, sessionsRes, callsRes, pledgesRes] = await Promise.all([
          supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
          supabase.from('calls').select('*, session_contacts(contact:contacts(name, phone))').eq('caller_id', user.id).order('started_at', { ascending: false }).limit(20),
          supabase.from('pledges').select('*').eq('organization_id', orgId),
        ]);

        setContactCount(contactsRes.count || 0);
        setSessionCount(sessionsRes.count || 0);
        setCalls(callsRes.data || []);
        setPledges(pledgesRes.data || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const totalCalls = calls.length;
  const totalTalkSeconds = calls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
  const totalPledged = pledges.reduce((sum, p) => sum + p.amount, 0);
  const outstandingPledges = pledges.filter(p => p.status === 'outstanding').reduce((sum, p) => sum + p.amount, 0);
  const fulfilledPledges = pledges.filter(p => p.status === 'fulfilled').reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-500">Loading...</p></div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your call time program</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Contacts" value={contactCount.toString()} />
        <StatCard label="Sessions" value={sessionCount.toString()} />
        <StatCard label="Total Calls" value={totalCalls.toString()} />
        <StatCard label="Talk Time" value={totalTalkSeconds > 0 ? formatDuration(totalTalkSeconds) : '0:00'} />
        <StatCard label="Total Pledged" value={formatCurrency(totalPledged)} highlight />
        <StatCard label="Outstanding" value={formatCurrency(outstandingPledges)} />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickAction title="Start Calling" description={`${contactCount} contacts ready`} href="/call" color="indigo" />
        <QuickAction title="Import Contacts" description="Build your call list" href="/onboarding" color="green" />
        <QuickAction title="New Session" description="Schedule call time" href="/sessions/new" color="blue" />
      </div>

      {/* Recent calls */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
        {calls.length === 0 ? (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No calls yet. Import contacts and start calling to see your activity here.
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Donor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outcome</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pledged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.slice(0, 10).map(call => {
                  const donorName = call.session_contacts?.contact?.name || 'Unknown';
                  return (
                  <tr key={call.id}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{donorName}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {new Date(call.started_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {call.duration_seconds ? formatDuration(call.duration_seconds) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {call.ai_outcome && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          call.ai_outcome === 'pledged' ? 'bg-green-100 text-green-800' :
                          call.ai_outcome === 'declined' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {call.ai_outcome}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-green-600">
                      {call.ai_pledge_amount ? formatCurrency(call.ai_pledge_amount) : ''}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pledges.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pledge Pipeline</h2>
            <Link href="/pledges" className="text-sm text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <p className="text-xs text-yellow-700 uppercase font-medium">Outstanding</p>
              <p className="mt-1 text-xl font-bold text-yellow-700">{formatCurrency(outstandingPledges)}</p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-xs text-green-700 uppercase font-medium">Fulfilled</p>
              <p className="mt-1 text-xl font-bold text-green-700">{formatCurrency(fulfilledPledges)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase font-medium">Total</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{formatCurrency(totalPledged)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? 'text-green-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function QuickAction({ title, description, href, color }: { title: string; description: string; href: string; color: string }) {
  const colorMap: Record<string, string> = { indigo: 'bg-indigo-600 hover:bg-indigo-700', green: 'bg-green-600 hover:bg-green-700', blue: 'bg-blue-600 hover:bg-blue-700' };
  return (
    <Link href={href} className={`flex flex-col rounded-lg p-6 text-white transition ${colorMap[color]}`}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm opacity-90">{description}</p>
    </Link>
  );
}
