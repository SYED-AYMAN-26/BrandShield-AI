import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/content', label: 'Content' },
  { to: '/insights', label: 'Insights' },
  { to: '/brand', label: 'Brand rules' },
  { to: '/audit', label: 'Activity log' },
  { to: '/help', label: 'Help' },
];

const ROLE_HELP = {
  creator: 'You write content and send it for review.',
  reviewer: 'You check findings and request changes.',
  approver: 'You give the final approval.',
  brand_manager: 'You manage brand rules and can do everything.',
};

export default function Shell() {
  const { user, org, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const signOut = async () => { await logout(); navigate('/'); };

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:shadow">Skip to main content</a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">🛡️</span>
            <span className="text-base font-bold text-slate-900">BrandShield AI</span>
          </NavLink>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
              <p className="text-xs capitalize text-slate-500">{user?.role?.replace('_', ' ')} · {org?.name}</p>
            </div>
            <button type="button" onClick={signOut} className="btn-secondary hidden sm:inline-flex">Sign out</button>
            <button type="button" className="btn-ghost md:hidden" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((v) => !v)}>
              <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
              <span aria-hidden="true" className="text-lg">{open ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
            <ul className="flex flex-col">
              {NAV.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} onClick={() => setOpen(false)}
                    className={({ isActive }) => `block rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
              <li className="mt-2 border-t border-slate-200 pt-2">
                <button type="button" onClick={signOut} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">Sign out</button>
              </li>
            </ul>
          </nav>
        )}
      </header>

      {org?.isDemo && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl px-4 py-2 text-xs text-amber-900">
            <strong>Demo workspace.</strong> Inkloom AI is a fictional brand. Every fact, guideline and submission here is sample data for exploring the product — it is not real customer activity.
          </div>
        </div>
      )}

      <main id="main" className="mx-auto max-w-7xl px-4 py-6">
        <p className="mb-4 hidden text-xs text-slate-500 lg:block">{ROLE_HELP[user?.role]}</p>
        <Outlet />
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-500">
          <p>BrandShield AI checks content against your approved brand facts and guidelines. It can miss issues — a human reviewer must still approve content.</p>
        </div>
      </footer>
    </div>
  );
}
