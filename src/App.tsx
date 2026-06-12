import { AuthProvider } from '@/context/AuthContext';
import { LoanProvider } from '@/context/LoanContext';
import { PaymentProvider } from '@/context/PaymentContext';
import { AppProvider } from '@/context/AppContext';
import { ToastProvider } from '@/components/common/Toast';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppRouter } from '@/router/AppRouter';

export default function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <LoanProvider>
          <PaymentProvider>
            <AppProvider>
              <AppRouter />
            </AppProvider>
          </PaymentProvider>
        </LoanProvider>
      </AuthProvider>
    </ToastProvider>
    </ErrorBoundary>
  );
}
