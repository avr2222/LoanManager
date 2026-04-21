import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins, LogIn, Eye, EyeOff, Mail, Phone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function detectType(value: string): 'email' | 'phone' | null {
  const v = value.trim();
  if (!v) return null;
  if (v.includes('@')) return 'email';
  if (/^[\d\s\-+()]{7,}$/.test(v)) return 'phone';
  return null;
}

export function LoginPage() {
  const { signIn, signInWithPhone, user } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const inputType = detectType(identifier);
  // Only show password field for admin (email) logins
  const showPasswordField = inputType === 'email';
  // Button is enabled: phone (no password needed) OR email with password filled
  const canSubmit = inputType === 'phone' || (inputType === 'email' && password.length > 0);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // Auto-focus password when email login detected
  useEffect(() => {
    if (showPasswordField) {
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }, [showPasswordField]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) { setError('Enter your email or phone number'); return; }
    if (!inputType) { setError('Enter a valid email or phone number'); return; }
    if (inputType === 'email' && !password) { setError('Enter your password'); return; }

    setError('');
    setLoading(true);

    let authError: string | null = null;

    if (inputType === 'email') {
      const result = await signIn(identifier.trim(), password);
      authError = result.error;
    } else {
      // Phone users — password is the phone number itself (transparent to user)
      const cleaned = identifier.replace(/\D/g, '').slice(-10);
      const result = await signInWithPhone(cleaned, cleaned);
      authError = result.error;
    }

    if (authError) setError(authError);
    else navigate('/dashboard', { replace: true });

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-500 rounded-2xl mb-4 shadow-lg">
            <HandCoins size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Loan Book</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Single smart input */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Email or Phone number
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  placeholder="email@example.com or 9876543210"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {inputType === 'email' && <Mail  size={15} className="text-indigo-400" />}
                  {inputType === 'phone' && <Phone size={15} className="text-emerald-500" />}
                  {inputType === null && identifier && <span className="w-2 h-2 rounded-full bg-amber-400 block" />}
                </div>
              </div>
              {inputType === 'email' && (
                <p className="text-xs text-indigo-500 mt-1.5 flex items-center gap-1">
                  <Mail size={11} /> Admin login
                </p>
              )}
              {inputType === 'phone' && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <Phone size={11} /> Borrower / Mediator — no password needed
                </p>
              )}
            </div>

            {/* Password — only for admin (email) logins */}
            {showPasswordField && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-3.5 py-2.5 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <span className="animate-pulse">Signing in…</span>
                : <><LogIn size={15} /> Sign In</>
              }
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
