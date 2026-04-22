import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  phone: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'phone' | 'question' | 'newpassword';

const SECURITY_QUESTIONS = [
  "What is your father's name?",
  "What is your mother's maiden name?",
  "What is your childhood nickname?",
  "What is your pet's name?",
  "What is the name of your hometown?",
  "What is the name of your first school?",
];

export function ForgotPasswordModal({ phone: initialPhone, onClose, onSuccess }: Props) {
  const [step, setStep]               = useState<Step>(initialPhone.length === 10 ? 'question' : 'phone');
  const [phone, setPhone]             = useState(initialPhone);
  const [question, setQuestion]       = useState('');
  const [answer, setAnswer]           = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  async function handlePhoneSubmit() {
    const cleaned = phone.replace(/\D/g, '').slice(-10);
    if (cleaned.length < 10) { setError('Enter a valid 10-digit phone number'); return; }
    setError('');
    setLoading(true);

    const { data } = await supabase.rpc('get_security_question', { p_phone: cleaned });
    setLoading(false);

    if (!data) {
      setError('Phone number not found or no security question set.');
      return;
    }
    setQuestion(data as string);
    setPhone(cleaned);
    setStep('question');
  }

  async function handleAnswerSubmit() {
    if (!answer.trim()) { setError('Enter your answer'); return; }
    setError('');
    setStep('newpassword');
  }

  async function handlePasswordReset() {
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);

    const { data } = await supabase.rpc('phone_forgot_password', {
      p_phone:        phone,
      p_answer:       answer.trim(),
      p_new_password: newPassword,
    });

    setLoading(false);

    if (data === 'ok') {
      setSuccess('Password reset successfully! You can now sign in.');
      setTimeout(onSuccess, 2000);
    } else if (data === 'wrong_answer') {
      setError('Incorrect answer. Please try again.');
      setStep('question');
      setAnswer('');
    } else if (data === 'not_found') {
      setError('Phone number not found.');
      setStep('phone');
    } else if (data === 'no_security_question') {
      setError('No security question set for this account. Contact the admin.');
    } else {
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm z-10">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Forgot Password</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {(['phone', 'question', 'newpassword'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s ? 'bg-indigo-500 text-white' :
                    (['phone', 'question', 'newpassword'].indexOf(step) > i) ? 'bg-emerald-500 text-white' :
                    'bg-slate-100 text-slate-400'
                  }`}>{i + 1}</div>
                  {i < 2 && <div className={`h-0.5 w-8 rounded ${['phone', 'question', 'newpassword'].indexOf(step) > i ? 'bg-emerald-400' : 'bg-slate-100'}`} />}
                </div>
              ))}
              <span className="text-xs text-slate-400 ml-1">
                {step === 'phone' ? 'Verify phone' : step === 'question' ? 'Security question' : 'New password'}
              </span>
            </div>

            {/* Step 1: Phone */}
            {step === 'phone' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Enter your phone number to find your account.</p>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(''); }}
                  placeholder="10-digit phone number"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button
                  onClick={handlePhoneSubmit}
                  disabled={loading}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Looking up…' : 'Continue'}
                </button>
              </div>
            )}

            {/* Step 2: Security question */}
            {step === 'question' && (
              <div className="space-y-3">
                <div className="bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-xs font-medium text-slate-400 mb-1">Security Question</p>
                  <p className="text-sm font-medium text-slate-700">{question || SECURITY_QUESTIONS[0]}</p>
                </div>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => { setAnswer(e.target.value); setError(''); }}
                  placeholder="Your answer"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAnswerSubmit()}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button
                  onClick={handleAnswerSubmit}
                  disabled={!answer.trim()}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                >
                  Verify Answer
                </button>
              </div>
            )}

            {/* Step 3: New password */}
            {step === 'newpassword' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">Choose a new password for your account.</p>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                    placeholder="New password (min 6 chars)"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Confirm new password"
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordReset()}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                {success && <p className="text-xs text-emerald-600 font-medium">{success}</p>}
                <button
                  onClick={handlePasswordReset}
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Resetting…' : 'Reset Password'}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
