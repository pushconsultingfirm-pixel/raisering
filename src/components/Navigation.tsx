'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

interface NavItem {
  name: string;
  href: string;
  roles: UserRole[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', roles: ['admin', 'director'] },
  { name: 'Call', href: '/call', roles: ['admin', 'caller'] },
  { name: 'Contacts', href: '/contacts', roles: ['admin', 'caller', 'director'] },
  { name: 'Sessions', href: '/sessions', roles: ['admin', 'director'] },
  { name: 'Pledges', href: '/pledges', roles: ['admin', 'director'] },
  { name: 'Analytics', href: '/analytics', roles: ['admin', 'director'] },
];

export default function Navigation({ userRole, userName, orgName }: {
  userRole: UserRole;
  userName: string;
  orgName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const visibleNav = navigation.filter(item => item.roles.includes(userRole));

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-800 bg-gray-900 px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <h1 className="text-xl font-bold text-white">RingRaise</h1>
          </div>
          <div className="text-sm text-gray-400">
            <p className="font-medium text-white">{orgName}</p>
            <p>{userName} &middot; {userRole}</p>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-1">
              {visibleNav.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6 ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto pt-4 border-t border-gray-700">
              <button
                onClick={handleSignOut}
                className="w-full rounded-md p-2 text-left text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-gray-900 px-4 py-4 shadow-sm sm:px-6 lg:hidden">
        <button
          type="button"
          className="-m-2.5 p-2.5 text-gray-300"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span className="sr-only">Open menu</span>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <h1 className="flex-1 text-sm font-semibold text-white">RingRaise</h1>
        <span className="text-xs text-gray-400">{orgName}</span>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-gray-600/75" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-gray-900 px-6 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-white">RingRaise</h1>
              <button
                type="button"
                className="-m-2.5 p-2.5 text-gray-400"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <p className="font-medium text-white">{orgName}</p>
              <p>{userName} &middot; {userRole}</p>
            </div>
            <nav className="mt-6">
              <ul className="flex flex-col gap-y-1">
                {visibleNav.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`block rounded-md p-2 text-sm font-medium ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                        }`}
                      >
                        {item.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
