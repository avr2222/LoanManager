import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, X, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';

export function AppShell() {
  const { t } = useTranslation();
  const { loading, autoImporting } = useApp();
  const { needsFirstTimeSetup, isDisabled, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const pageTitles: Record<string, string> = {
    '/dashboard': t('nav.dashboard'),
    '/loans':     t('nav.loans'),
    '/payments':  t('nav.payments'),
    '/mediators': 'Mediators',
    '/users':     t('nav.users'),
    '/import':    t('nav.import'),
  };

  const title = pageTitles[location.pathname] ?? t('nav.loanBook');
  const showBanner = needsFirstTimeSetup && !bannerDismissed && location.pathname !== '/set-password';

  if (loading || autoImporting) {
    return (
      <div className="flex h-screen items-center justify-center"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.06) 0%, transparent 70%), #f8fafc' }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            {autoImporting ? t('app.importing') : t('app.loading')}
          </p>
        </div>
      </div>
    );
  }

  if (isDisabled) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md shadow-red-500/20"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <Ban size={24} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight mb-2">{t('app.accountDisabled')}</h1>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">{t('app.disabledMessage')}</p>
          <button
            onClick={signOut}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl shadow-sm transition-colors"
          >
            {t('app.signOut')}
          </button>
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
                {t('app.viewOnlyBanner')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/set-password')}
                className="text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 px-3 py-1 rounded-lg transition-colors"
              >
                {t('app.setPassword')}
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
