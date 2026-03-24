'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { formatCurrency } from '@/lib/types';

interface PledgeWithContact {
  id: string;
  amount: number;
  status: string;
  pledged_at: string;
  fulfilled_at: string | null;
  contact_id: string;
  contacts: { name: string; phone: string } | null;
}

export default function PledgesPage() {
  const [pledges, setPledges] = useState<PledgeWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from('users').select('organization_id').eq('id', user.id).single();
        if (!profile) { setLoading(false); return; }

        const { data } = await supabase
          .from('pledges')
          .select('*, contacts(name, phone)')
          .eq('organization_id', profile.organization_id)
          .order('pledged_at', { ascending: false });

        setPledges((data as PledgeWithContact[]) || []);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleStatusChange(id: string, status: string) {
    const supabase = createClient();
    const updates: Record<string, unknown> = { status };
    if (status === 'fulfilled') updates.fulfilled_at = new Date().toISOString();

    await supabase.from('pledges').update(updates).eq('id', id);
    setPledges(prev => prev.map(p =>
      p.id === id ? { ...p, status, fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : p.fulfilled_at } : p
    ));
  }

  const outstanding = pledges.filter(p => p.status === 'outstanding');
  const fulfilled = pledges.filter(p => p.status === 'fulfilled');
  const overdue = pledges.filter(p => p.status === 'overdue');
  const totalOutstanding = outstanding.reduce((sum, p) => sum + p.amount, 0);
  const totalFulfilled = fulfilled.reduce((sum, p) => sum + p.amount, 0);
  const totalOverdue = overdue.reduce((sum, p) => sum + p.amount, 0);

  if (loading) return <div className="flex items-center justify-center py-20"><p className="text-sm text-gray-500">Loading...</p></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Pledges</h1>
      <p className="mt-1 text-sm text-gray-500">Track outstanding and fulfilled pledges</p>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-gray-400">{outstanding.length} pledges</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Fulfilled</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatCurrency(totalFulfilled)}</p>
          <p className="text-xs text-gray-400">{fulfilled.length} pledges</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase">Overdue</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
          <p className="text-xs text-gray-400">{overdue.length} pledges</p>
        </div>
      </div>

      {pledges.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No pledges recorded yet. Pledges appear here after calls where donors commit to giving.
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="hidden min-w-full divide-y divide-gray-200 sm:table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Donor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pledges.map(pledge => (
                <tr key={pledge.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{pledge.contacts?.name || 'Unknown'}</p>
                    {pledge.contacts?.phone && (
                      <a href={`tel:${pledge.contacts.phone}`} className="text-xs text-indigo-600">{pledge.contacts.phone}</a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(pledge.amount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(pledge.pledged_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      pledge.status === 'fulfilled' ? 'bg-green-100 text-green-800' :
                      pledge.status === 'overdue' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>{pledge.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pledge.status === 'outstanding' && (
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => handleStatusChange(pledge.id, 'fulfilled')}
                          className="text-xs text-green-600 hover:text-green-800 font-medium">Mark Fulfilled</button>
                        <button onClick={() => handleStatusChange(pledge.id, 'overdue')}
                          className="text-xs text-red-500 hover:text-red-700">Mark Overdue</button>
                      </div>
                    )}
                    {pledge.status === 'overdue' && (
                      <button onClick={() => handleStatusChange(pledge.id, 'fulfilled')}
                        className="text-xs text-green-600 hover:text-green-800 font-medium">Mark Fulfilled</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile */}
          <div className="divide-y divide-gray-200 sm:hidden">
            {pledges.map(pledge => (
              <div key={pledge.id} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{pledge.contacts?.name || 'Unknown'}</p>
                  <p className="font-medium text-gray-900">{formatCurrency(pledge.amount)}</p>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    pledge.status === 'fulfilled' ? 'bg-green-100 text-green-800' :
                    pledge.status === 'overdue' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>{pledge.status}</span>
                  {pledge.status === 'outstanding' && (
                    <button onClick={() => handleStatusChange(pledge.id, 'fulfilled')}
                      className="text-xs text-green-600 font-medium">Fulfilled</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
