import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const SECURITY_QUESTIONS = [
  "What is your father's name?",
  "What is your mother's maiden name?",
  "What is your childhood nickname?",
  "What is your pet's name?",
  "What is the name of your hometown?",
  "What is the name of your first school?",
];

export function SetPasswordPage() {
  const { updatePasswordWithSecurity, signOut, userPhone } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [question, setQuestion]       = useState(SECURITY_QUESTIONS[0]);
  const [answer, setAnswer]           = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6)         { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm)        { setError('Passwords do not match'); return; }
    if (!answer.trim())              { setError('Enter your security answer'); return; }

    setSaving(true);
    setError('');
    const { error: err } = await updatePasswordWithSecurity(password, question, answer.trim());
    setSaving(false);

    if (err) { setError(err); return; }
    // On success, navigate back to dashboard with full access
    navigate('/dashboard', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500 rounded-2xl mb-4 shadow-lg">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Secure Your Account</h1>
          <p className="text-slate-400 text-sm mt-1">
            Set a password to get full access to your loans
          </p>
          {userPhone && (
            <p className="text-xs text-slate-400 mt-1">Account: {userPhone}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* New password */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  placeholder="Re-enter your password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {password && confirm && password !== confirm && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {/* Security question */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Security Question</label>
              <select
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>

            {/* Security answer */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Your Answer</label>
              <input
                type="text"
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); setError(''); }}
                placeholder="Your answer (used for password recovery)"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <p className="text-xs text-slate-400 mt-1">Remember this — it's needed to reset your password</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-xs px-3.5 py-2.5 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !password || !confirm || !answer.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Set Password & Continue'}
            </button>

            <div className="flex justify-between text-xs text-slate-400 pt-1">
              <button type="button" onClick={() => navigate('/dashboard')} className="hover:text-slate-600 transition-colors">
                Maybe later
              </button>
              <button type="button" onClick={signOut} className="hover:text-slate-600 transition-colors">
                Sign out
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Without a password you can only view your loans — no edits or additions
        </p>
      </div>
    </div>
  );
}
