import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { HandCoins, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ForgotPasswordModal } from '@/components/auth/ForgotPasswordModal';

export function LoginPage() {
  const { signIn, signInWithPhone, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [showForgot, setShowForgot]     = useState(false);

  useEffect(() => {
    const pre = searchParams.get('email');
    if (pre) setEmail(pre);
  }, [searchParams]);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim())    { setError('Enter your email or mobile number'); return; }
    if (!password.trim()) { setError('Enter your password');               return; }

    setError('');
    setLoading(true);

    // If input looks like a phone number, use phone login (creates @user.local email internally)
    const cleaned = email.replace(/\D/g, '');
    const isPhone = cleaned.length === 10;
    const { error: err } = isPhone
      ? await signInWithPhone(cleaned, password)
      : await signIn(email.trim(), password);

    if (err && err !== 'password_required') setError(err);
    setLoading(false);
  }

  return (
    <>
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%), #f8fafc' }}>

      {/* Decorative blobs */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #4f46e5, transparent)' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 shadow-xl shadow-indigo-500/20"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            <HandCoins size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h1>
          <p className="text-slate-400 text-sm mt-1.5">Sign in to your Loan Book</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xl shadow-slate-200/40 p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email or Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Email or Mobile Number
              </label>
              <input
                type="text"
                inputMode="text"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com or 9876543210"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                <span className="mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <>Sign In <ArrowRight size={14} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400 mt-5">
          Have an invitation?{' '}
          <Link
            to="/register"
            className="text-indigo-500 hover:text-indigo-700 font-semibold transition-colors"
          >
            Create account
          </Link>
        </p>

      </div>
    </div>

    {showForgot && (
      <ForgotPasswordModal
        phone={(() => { const c = email.replace(/\D/g, ''); return c.length === 10 ? c : ''; })()}
        onClose={() => setShowForgot(false)}
        onSuccess={() => setShowForgot(false)}
      />
    )}
    </>
  );
}
