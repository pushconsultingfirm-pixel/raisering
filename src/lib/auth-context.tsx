'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from './supabase';
import type { User, Organization } from './types';
import type { User as AuthUser } from '@supabase/supabase-js';

interface AuthState {
  authUser: AuthUser | null;
  user: User | null;
  organization: Organization | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, orgName: string, orgType: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchUserProfile = useCallback(async (authUserId: string) => {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUserId)
      .single();

    if (profile) {
      setUser(profile);
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single();
      setOrganization(org);
    }
  }, [supabase]);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
        fetchUserProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setAuthUser(session.user);
          await fetchUserProfile(session.user.id);
        } else {
          setAuthUser(null);
          setUser(null);
          setOrganization(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase, fetchUserProfile]);

  async function signUp(email: string, password: string, name: string, orgName: string, orgType: string) {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (authError) throw authError;
    if (!authData.user) throw new Error('No user returned from signup');

    // 2. Create organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: orgName, type: orgType })
      .select()
      .single();
    if (orgError) throw orgError;

    // 3. Create user profile (admin role for the founder)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        name,
        organization_id: org.id,
        role: 'admin',
      })
      .select()
      .single();
    if (profileError) throw profileError;

    setUser(profile);
    setOrganization(org);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthUser(null);
    setUser(null);
    setOrganization(null);
  }

  async function refreshUser() {
    if (authUser) {
      await fetchUserProfile(authUser.id);
    }
  }

  return (
    <AuthContext.Provider value={{
      authUser, user, organization, loading,
      signUp, signIn, signOut, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
