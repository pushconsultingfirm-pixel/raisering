'use client';

import Link from 'next/link';
import { useData } from '@/lib/data-context';

export default function SessionsPage() {
  const { sessions, getSessionQueue, startSession } = useData();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="mt-1 text-sm text-gray-500">Manage your call time sessions</p>
        </div>
        <Link
          href="/sessions/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Session
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          No sessions yet. Create one to start making calls.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {sessions.map(session => {
            const queue = getSessionQueue(session.id);
            const completed = queue.filter(q => q.status === 'completed').length;
            const total = queue.length;

            return (
              <div key={session.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{session.name}</p>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      session.status === 'active' ? 'bg-green-100 text-green-800' :
                      session.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {session.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    {completed}/{total} contacts called
                    {session.scheduled_start && (
                      <> &middot; {new Date(session.scheduled_start).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {session.status === 'scheduled' && (
                    <button
                      onClick={() => startSession(session.id)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Start
                    </button>
                  )}
                  {session.status === 'active' && (
                    <Link
                      href="/call"
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Join
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
