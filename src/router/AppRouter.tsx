import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/common/AppShell';
import { MediatorDashboardPage } from '@/pages/MediatorDashboardPage';
import { LoanDetailPage } from '@/pages/LoanDetailPage';
import { AddLoanPage } from '@/pages/AddLoanPage';
import { LoansPage } from '@/pages/LoansPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { ImportPage } from '@/pages/ImportPage';
import { UsersPage } from '@/pages/UsersPage';
import { LoginPage } from '@/pages/LoginPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { SetPasswordPage } from '@/pages/SetPasswordPage';
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

  if (needsPasswordReset)   return <ResetPasswordPage />;
  if (!user)                return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin } = useAuth();
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function FullAccessOnly({ children }: { children: React.ReactNode }) {
  const { hasFullAccess } = useAuth();
  if (!hasFullAccess) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<MediatorDashboardPage />} />
          <Route path="set-password" element={<SetPasswordPage />} />
          <Route path="add-loan"     element={<FullAccessOnly><AddLoanPage /></FullAccessOnly>} />
          <Route path="loans"        element={<LoansPage />} />
          <Route path="loans/:id"    element={<LoanDetailPage />} />
          <Route path="payments"     element={<PaymentsPage />} />
          <Route path="users"        element={<AdminOnly><UsersPage /></AdminOnly>} />
          <Route path="import"       element={<AdminOnly><ImportPage /></AdminOnly>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
