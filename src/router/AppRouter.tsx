import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/common/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { MediatorDashboardPage } from '@/pages/MediatorDashboardPage';
import { AddLoanPage } from '@/pages/AddLoanPage';
import { LoansPage } from '@/pages/LoansPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ImportPage } from '@/pages/ImportPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { useAuth } from '@/context/AuthContext';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, needsPasswordReset } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsPasswordReset) return <ResetPasswordPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  const { isMediator, isBorrower } = useAuth();

  function DashboardView() {
    if (isMediator || isBorrower) return <MediatorDashboardPage />;
    return <DashboardPage />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardView />} />
          <Route path="add-loan"  element={<AddLoanPage />} />
          <Route path="loans"    element={<AdminOnly><LoansPage /></AdminOnly>} />
          <Route path="payments" element={<AdminOnly><PaymentsPage /></AdminOnly>} />
          <Route path="import"   element={<AdminOnly><ImportPage /></AdminOnly>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
