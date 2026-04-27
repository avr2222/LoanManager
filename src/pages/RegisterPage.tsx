import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { HandCoins, UserPlus, Eye, EyeOff, CheckCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function RegisterPage() {
  const { signUp, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const inviteToken = searchParams.get('invite') ?? '';

  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [done, setDone]               = useState(false);

  const [invitePhone, setInvitePhone] = useState('');
  const phoneLocked = !!invitePhone;

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!inviteToken) return;
    async function checkInvite() {
      const { data, error } = await import('@/lib/supabase').then(m =>
        m.supabase.rpc('validate_invitation', { p_token: inviteToken })
      );
      if (error || !data?.length) return;
      const invite = data[0] as { phone: string; is_valid: boolean };
      if (!invite.is_valid) {
        setError('This invitation link has expired or already been used.');
        return;
      }
      if (invite.phone) {
        setPhone(invite.phone);
        setInvitePhone(invite.phone);
      }
    }
    checkInvite();
  }, [inviteToken]);

  function validate(): string | null {
    if (!inviteToken)                      return 'An invitation link is required to register.';
    if (!name.trim())                      return 'Enter your full name';
    if (!email.trim() || !email.includes('@')) return 'Enter a valid email address';
    if (phone.replace(/\D/g, '').length < 10) return 'Enter a valid 10-digit phone number';
    if (password.length < 8)               return 'Password must be at least 8 characters';
    if (password !== confirmPassword)      return 'Passwords do not match';
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setError('');
    setLoading(true);

    const { error: err } = await signUp(
      name.trim(),
      email.trim(),
      phone,
      password,
      inviteToken || undefined,
    );

    if (err) {
      setError(err);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%), #f8fafc' }}>
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 shadow-xl shadow-emerald-500/20"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <CheckCircle size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">Account Created!</h1>
          <p className="text-sm text-slate-400 mb-7">
            Your account is ready. Sign in to get started.
          </p>
          <Link
            to={`/login?email=${encodeURIComponent(email)}`}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
          >
            Sign In <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = "w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.08) 0%, transparent 70%), #f8fafc' }}>

      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 shadow-xl shadow-indigo-500/20"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
            <HandCoins size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Account</h1>
          <p className="text-slate-400 text-sm mt-1.5">
            {inviteToken ? 'You have been invited to Loan Book' : 'Register to get started'}
          </p>
        </div>

        {!inviteToken && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
            <span className="mt-0.5 shrink-0">⚠</span>
            Registration requires an invitation link. Contact the person who invited you.
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xl shadow-slate-200/40 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Full Name</label>
              <input
                type="text"
                autoComplete="name"
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(''); }}
                placeholder="Ramesh Kumar"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Mobile Number</label>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => { if (!phoneLocked) { setPhone(e.target.value); setError(''); } }}
                readOnly={phoneLocked}
                placeholder="9876543210"
                className={`${inputClass} ${phoneLocked ? 'cursor-not-allowed text-slate-400' : ''}`}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                {phoneLocked ? 'Phone number is set by your invitation' : 'Used to link you to loans you are part of'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="At least 8 characters"
                  className={`${inputClass} pr-10`}
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

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-3.5 py-2.5 rounded-xl flex items-start gap-2">
                <span className="mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !inviteToken}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md shadow-indigo-500/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0 transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : (
                <><UserPlus size={14} /> Create Account</>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400 mt-5">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-indigo-500 hover:text-indigo-700 font-semibold transition-colors"
          >
            Sign in
          </Link>
        </p>

      </div>
    </div>
  );
}
