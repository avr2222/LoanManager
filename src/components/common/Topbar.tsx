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
  const { user, signOut, isAdmin, displayName, adminPhone, updateProfile } = useAuth();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showProfile, setShowProfile] = useState(false);
  const [nameInput, setNameInput]     = useState('');
  const [phoneInput, setPhoneInput]   = useState('');
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
    setShowProfile(true);
  }

  async function handleSaveProfile() {
    if (!nameInput.trim()) return;
    setSaving(true);
    const { error } = await updateProfile(nameInput.trim(), isAdmin ? phoneInput : undefined);
    if (error) { setSaving(false); showError(error); return; }
    if (isAdmin) {
      // Update any loans that still show blank/old lender name or phone
      loansService.fillBlankLenderName(nameInput.trim()).catch(console.warn);
      loansService.fillBlankLenderPhone(phoneInput.trim()).catch(console.warn);
    } else if (user) {
      // Phone user: save display name to profiles table so admin can see it in Users page
      profilesService.updateDisplayName(user.id, nameInput.trim()).catch(console.warn);
    }
    setSaving(false);
    showSuccess('Profile updated');
    setShowProfile(false);
  }

  // Avatar initials from display name
  const initials = displayName
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <>
      <header className="bg-white border-b border-slate-100 px-4 md:px-6 py-3 flex items-center justify-between">
        <h1 className="text-base font-semibold text-slate-800">{title}</h1>

        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />

          {isAdmin && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Upload size={13} />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={() => { exportData(); showSuccess('Exported!'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Export</span>
              </button>
            </>
          )}

          {/* Profile avatar button */}
          <button
            onClick={openProfile}
            title="Edit profile"
            className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold hover:bg-indigo-200 transition-colors ml-1"
          >
            {initials || <User size={14} />}
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
            <div className="fixed inset-0 bg-black/40" onClick={() => setShowProfile(false)} />
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm z-10">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">Edit Profile</h2>
                <button onClick={() => setShowProfile(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Avatar preview */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold">
                    {(nameInput || displayName).split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('') || <User size={28} />}
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <p className="text-xs text-slate-400 mt-1">Used to match loans where you are the lender</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Account</label>
                  <p className="text-sm text-slate-600">{user?.email}</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowProfile(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving || !nameInput.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
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
