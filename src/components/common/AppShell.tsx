import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/loans':     'Loans',
  '/payments':  'Payments',
  '/mediators': 'Mediators',
  '/import':    'Import / Export',
};

export function AppShell() {
  const { loading, autoImporting } = useApp();
  const { needsFirstTimeSetup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const title = pageTitles[location.pathname] ?? 'Loan Book';
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const showBanner = needsFirstTimeSetup && !bannerDismissed && location.pathname !== '/set-password';

  if (loading || autoImporting) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">
            {autoImporting ? 'Importing loan data…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={title} />
        {showBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert size={15} className="text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800 truncate">
                You're in <strong>view-only mode</strong>. Set a password to add loans and mark payments.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/set-password')}
                className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1 rounded-lg transition-colors"
              >
                Set Password
              </button>
              <button onClick={() => setBannerDismissed(true)} className="text-amber-500 hover:text-amber-700">
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
