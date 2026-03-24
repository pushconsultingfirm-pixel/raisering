'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'account' | 'org'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState('campaign');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (step === 'account') {
      if (!email || !password || !name) {
        setError('All fields are required');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      setError('');
      setStep('org');
      return;
    }

    // Step 2: Create everything
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Signup failed');

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: orgName || `${name}'s Organization`, type: orgType })
        .select()
        .single();
      if (orgError) throw orgError;

      // Create user profile
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          name,
          organization_id: org.id,
          role: 'admin',
        });
      if (profileError) throw profileError;

      router.push('/onboarding');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold text-gray-900">RingRaise</h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Set up your call time tools
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {step === 'account' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-400">At least 6 characters</p>
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition"
              >
                Continue
              </button>
            </>
          )}

          {step === 'org' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Smith for Congress, Community Food Bank"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {[
                    { value: 'campaign', label: 'Campaign', desc: 'Political campaign' },
                    { value: 'nonprofit', label: 'Non-Profit', desc: 'Non-profit org' },
                    { value: 'committee', label: 'Committee', desc: 'Party / PAC' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOrgType(opt.value)}
                      className={`rounded-md border p-3 text-center text-sm transition ${
                        orgType === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-xs text-gray-400">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('account')}
                  className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-300 transition"
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </>
          )}
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
