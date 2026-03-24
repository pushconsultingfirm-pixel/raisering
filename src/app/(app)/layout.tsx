'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';
import { DataProvider } from '@/lib/data-context';
import { createClient } from '@/lib/supabase';
import type { User, Organization } from '@/lib/types';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      // Skip Supabase if not configured — use demo mode
      if (!supabaseUrl || supabaseUrl === 'your-supabase-url' || !supabaseUrl.startsWith('http')) {
        setUser({
          id: 'demo', email: 'demo@example.com', name: 'Demo User',
          organization_id: 'demo', role: 'admin', created_at: new Date().toISOString(),
        });
        setOrg({
          id: 'demo', name: 'Demo Campaign', type: 'campaign',
          created_at: new Date().toISOString(),
        });
        setLoading(false);
        return;
      }

      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (!authUser) {
          setUser({
            id: 'demo', email: 'demo@example.com', name: 'Demo User',
            organization_id: 'demo', role: 'admin', created_at: new Date().toISOString(),
          });
          setOrg({
            id: 'demo', name: 'Demo Campaign', type: 'campaign',
            created_at: new Date().toISOString(),
          });
          setLoading(false);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          console.error('Layout profile query failed:', profileError);
        }

        if (profile) {
          setUser(profile);
          const { data: organization } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', profile.organization_id)
            .single();
          setOrg(organization);
        }
      } catch {
        // Supabase not available — fall back to demo mode
        setUser({
          id: 'demo', email: 'demo@example.com', name: 'Demo User',
          organization_id: 'demo', role: 'admin', created_at: new Date().toISOString(),
        });
        setOrg({
          id: 'demo', name: 'Demo Campaign', type: 'campaign',
          created_at: new Date().toISOString(),
        });
      }

      setLoading(false);
    }

    loadUser();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <DataProvider>
      <div className="min-h-full">
        <Navigation
          userRole={user?.role || 'admin'}
          userName={user?.name || 'User'}
          orgName={org?.name || 'Organization'}
        />
        <main className="lg:pl-64">
          <div className="px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </DataProvider>
  );
}
