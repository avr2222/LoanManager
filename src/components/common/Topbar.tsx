import { useState } from 'react';
import { Download, Upload, LogOut, User, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { loansService } from '@/services/supabaseService';
import { profilesService } from '@/services/profilesService';
import { useToast } from './Toast';
import { useRef } from 'react';

interface TopbarProps { title: string; }

export function Topbar({ title }: TopbarProps) {
  const { importFile, exportData } = useApp();
  const { user, signOut, isAdmin, displayName, adminPhone, updateProfile, profile } = useAuth();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [nameInput, setNameInput]     = useState('');
  const [phoneInput, setPhoneInput]   = useState('');
  const [upiInput, setUpiInput]       = useState('');
  const [saving, setSaving]           = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importFile(file);
      showSuccess('Imported successfully');
    } catch (err) {
      showError('Import failed — check file format');
      console.error(err);
    }
    e.target.value = '';
  }

  function openProfile() {
    setNameInput((user?.user_metadata?.full_name as string | undefined) ?? '');
    setPhoneInput(adminPhone);
    setUpiInput(profile?.upiId ?? '');
    setShowProfile(true);
  }

  async function handleSaveProfile() {
    if (!nameInput.trim()) return;
    setSaving(true);
    const { error } = await updateProfile(nameInput.trim(), isAdmin ? phoneInput : undefined);
    if (error) { setSaving(false); showError(error); return; }
    if (isAdmin) {
      loansService.fillBlankLenderName(nameInput.trim()).catch(console.warn);
      loansService.fillBlankLenderPhone(phoneInput.trim()).catch(console.warn);
    } else if (user) {
      profilesService.updateDisplayName(user.id, nameInput.trim()).catch(console.warn);
    }
    if (user) {
      profilesService.updateProfile(user.id, { upiId: upiInput.trim() }).catch(console.warn);
    }
    setSaving(false);
    showSuccess('Profile updated');
    setShowProfile(false);
  }

  const initials = displayName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <>
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <h1 className="text-[15px] font-semibold text-slate-800 tracking-tight">{title}</h1>

        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

          {isAdmin && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
              >
                <Upload size={13} />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={() => { exportData(); showSuccess('Exported!'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
                style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
              >
                <Download size={13} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </>
          )}

          <button
            onClick={openProfile}
            title="Edit profile"
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold hover:ring-2 hover:ring-indigo-300 hover:ring-offset-1 transition-all ml-1 shadow-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}
          >
            {initials || <User size={13} />}
          </button>

          <button
            onClick={signOut}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Profile modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowProfile(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl shadow-black/10 w-full max-w-sm z-10 border border-slate-100">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800 tracking-tight">Edit Profile</h2>
                <button onClick={() => setShowProfile(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shadow-md"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
                    {(nameInput || displayName).split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || <User size={24} />}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveProfile()}
                    placeholder="Your full name"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all"
                    autoFocus
                  />
                  {!isAdmin && (
                    <p className="text-xs text-slate-400 mt-1">Shown to admin in the Users list</p>
                  )}
                </div>

                {isAdmin && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="10-digit mobile number"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all"
                    />
                    <p className="text-xs text-slate-400 mt-1">Used to match loans where you are the lender</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">UPI ID</label>
                  <input
                    type="text"
                    value={upiInput}
                    onChange={(e) => setUpiInput(e.target.value)}
                    placeholder="yourname@upi"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300 transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1">Borrowers can pay you directly via any UPI app</p>
                </div>

                <div className="bg-slate-50 rounded-xl px-3.5 py-2.5">
                  <p className="text-[11px] font-medium text-slate-400 mb-0.5">Account</p>
                  <p className="text-sm text-slate-700 font-medium">{user?.email}</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowProfile(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving || !nameInput.trim()}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none transition-all"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
