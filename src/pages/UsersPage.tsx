import { useEffect, useState, useMemo } from 'react';
import {
  Users, ShieldOff, ShieldCheck, RefreshCw,
  UserPlus, Link2, Copy, Check, Trash2, Clock, X, Bell,
} from 'lucide-react';
import { profilesService, type Profile } from '@/services/profilesService';
import { invitationsService, type Invitation } from '@/services/invitationsService';
import { useAuth } from '@/context/AuthContext';
import { useLoans } from '@/context/LoanContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/common/Toast';

type LoanRole = 'borrower' | 'mediator' | 'both';

function norm(phone?: string) {
  return phone?.replace(/\D/g, '').slice(-10) ?? '';
}

function RoleBadge({ role }: { role: LoanRole | undefined }) {
  if (!role) return <span className="text-xs text-slate-300">—</span>;
  const styles: Record<LoanRole, string> = {
    borrower: 'bg-amber-50 text-amber-700',
    mediator: 'bg-blue-50 text-blue-700',
    both:     'bg-purple-50 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[role]}`}>
      {role}
    </span>
  );
}

function InviteStatusBadge({ status }: { status: 'active' | 'used' | 'expired' }) {
  const styles = {
    active:  'bg-emerald-50 text-emerald-700',
    used:    'bg-slate-100 text-slate-500',
    expired: 'bg-red-50 text-red-500',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

// ── Invite Modal ──────────────────────────────────────────────
function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invitation) => void }) {
  const [phone, setPhone]     = useState('');
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [link, setLink]       = useState('');
  const [copied, setCopied]   = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError('');
    const { data, error: err } = await invitationsService.create(phone, note);
    if (err || !data) { setError(err ?? 'Failed to create invitation'); setLoading(false); return; }
    setLink(invitationsService.buildLink(data.token));
    onCreated(data);
    setLoading(false);
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm z-10">

          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-800">Invite User</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
              <X size={18} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {!link ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Phone Number <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="9876543210 — locks registration to this number"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    autoFocus
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    If set, only this phone number can use the invite.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Note <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Suresh — borrower for L001"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  />
                </div>

                {error && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                  >
                    {loading ? <span className="animate-pulse">Creating…</span> : <><Link2 size={14} /> Generate Link</>}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-center">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Link2 size={20} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-medium text-slate-800">Invitation link ready</p>
                  <p className="text-xs text-slate-400 mt-0.5">Valid for 7 days. Share via WhatsApp or SMS.</p>
                </div>

                <div className="bg-slate-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-slate-500 break-all leading-relaxed">{link}</p>
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 transition-colors"
                >
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
                </button>

                <button
                  onClick={onClose}
                  className="w-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export function UsersPage() {
  const { displayName, isSuperAdmin } = useAuth();
  const { showSuccess, showError } = useToast();
  const { loans } = useLoans();

  const [users, setUsers]             = useState<Profile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toggling, setToggling]       = useState<string | null>(null);
  const [revoking, setRevoking]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [tab, setTab]                 = useState<'users' | 'invites'>('users');
  const [testingPush, setTestingPush] = useState<string | null>(null);

  const { phoneToName, phoneToRole } = useMemo(() => {
    const nameMap = new Map<string, string>();
    const roleMap = new Map<string, LoanRole>();

    for (const loan of loans) {
      const bp = norm(loan.borrowerPhone);
      if (bp) {
        if (!nameMap.has(bp) && loan.borrowerName) nameMap.set(bp, loan.borrowerName);
        const cur = roleMap.get(bp);
        roleMap.set(bp, cur === 'mediator' ? 'both' : 'borrower');
      }
      if (loan.loanType === 'Through Mediator' && loan.mediatorPhone) {
        const mp = norm(loan.mediatorPhone);
        if (mp) {
          if (!nameMap.has(mp) && loan.mediatorName) nameMap.set(mp, loan.mediatorName);
          const cur = roleMap.get(mp);
          roleMap.set(mp, cur === 'borrower' ? 'both' : 'mediator');
        }
      }
    }
    return { phoneToName: nameMap, phoneToRole: roleMap };
  }, [loans]);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    const [userData, inviteData] = await Promise.all([
      profilesService.listAll(),
      invitationsService.listMine(),
    ]);
    setUsers(userData);
    setInvitations(inviteData);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  async function handleToggle(user: Profile) {
    setToggling(user.id);
    setError(null);
    const newActive = !user.isActive;
    const { error: err } = await profilesService.setActive(
      user.id, newActive,
      newActive ? undefined : displayName,
    );
    if (err) {
      setError(err);
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, isActive: newActive, disabledAt: newActive ? null : new Date().toISOString(), disabledBy: newActive ? null : displayName }
            : u
        )
      );
    }
    setToggling(null);
  }

  async function handleTestPush(userId: string, userName: string) {
    setTestingPush(userId);
    try {
      const { data, error } = await supabase.functions.invoke('send-test-notification', {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.sent) {
        showSuccess(`Test notification sent to ${userName}`);
      } else {
        showError(`${userName} has no push subscription`);
      }
    } catch {
      showError('Failed to send test notification');
    } finally {
      setTestingPush(null);
    }
  }

  async function handleRevoke(inv: Invitation) {
    setRevoking(inv.id);
    const { error: err } = await invitationsService.revoke(inv.id);
    if (err) setError(err);
    else setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    setRevoking(null);
  }

  async function handleCopyLink(inv: Invitation) {
    const link = invitationsService.buildLink(inv.token);
    await navigator.clipboard.writeText(link);
    setCopiedToken(inv.id);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const activeCount   = users.filter((u) => u.isActive).length;
  const disabledCount = users.filter((u) => !u.isActive).length;
  const activeInvites = invitations.filter((i) => invitationsService.status(i) === 'active').length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Users</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {users.length} registered · {activeCount} active · {disabledCount} disabled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
          >
            <UserPlus size={14} />
            Invite User
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            tab === 'users' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Registered Users
        </button>
        <button
          onClick={() => setTab('invites')}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            tab === 'invites' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Invitations
          {activeInvites > 0 && (
            <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-xs">
              {activeInvites}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'users' ? (

        /* ── Users Table ── */
        users.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-16 flex flex-col items-center gap-3 text-slate-400">
            <Users size={32} className="text-slate-300" />
            <p className="text-sm">No users registered yet.</p>
            <p className="text-xs text-slate-300">Invite someone using the button above.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Name / Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Disabled By</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => {
                  const name     = u.fullName || u.displayName || phoneToName.get(u.phone);
                  const loanRole = phoneToRole.get(u.phone);
                  const initials = name
                    ? name.split(' ').map((w) => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
                    : u.phone.slice(-2);

                  return (
                    <tr key={u.id} className={`transition-colors ${!u.isActive ? 'bg-red-50/30' : 'hover:bg-slate-50/60'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 text-xs font-bold text-indigo-500">
                            {initials}
                          </div>
                          <div>
                            {name ? (
                              <>
                                <p className="text-sm font-medium text-slate-800">{name}</p>
                                <p className="text-xs text-slate-400 font-mono">{u.phone}</p>
                              </>
                            ) : (
                              <p className="text-sm font-medium text-slate-800 font-mono">{u.phone || '—'}</p>
                            )}
                            {u.email && (
                              <p className="text-xs text-slate-300">{u.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={loanRole} />
                      </td>
                      <td className="px-4 py-3">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {!u.isActive && u.disabledBy ? (
                          <span className="text-xs text-slate-400">{u.disabledBy}</span>
                        ) : (
                          <span className="text-xs text-slate-200">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isSuperAdmin && (
                            <button
                              onClick={() => handleTestPush(u.id, u.fullName || u.phone)}
                              disabled={testingPush === u.id}
                              title="Send test push notification"
                              className="inline-flex items-center gap-1 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 px-2 py-1.5 rounded-lg transition-all disabled:opacity-50"
                            >
                              {testingPush === u.id
                                ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                : <Bell size={12} />
                              }
                              Test
                            </button>
                          )}
                          {u.isSuperAdmin ? (
                            <span className="text-xs text-indigo-500 font-semibold px-3 py-1.5">Admin</span>
                          ) : (
                            <button
                              onClick={() => handleToggle(u)}
                              disabled={toggling === u.id}
                              title={u.isActive ? 'Disable user' : 'Enable user'}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${
                                u.isActive
                                  ? 'text-red-600 bg-red-50 hover:bg-red-100'
                                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              {toggling === u.id ? (
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : u.isActive ? (
                                <ShieldOff size={13} />
                              ) : (
                                <ShieldCheck size={13} />
                              )}
                              {u.isActive ? 'Disable' : 'Enable'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )

      ) : (

        /* ── Invitations Tab ── */
        invitations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-16 flex flex-col items-center gap-3 text-slate-400">
            <Link2 size={32} className="text-slate-300" />
            <p className="text-sm">No invitations yet.</p>
            <p className="text-xs text-slate-300">Click "Invite User" to generate a registration link.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone / Note</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Expires</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invitations.map((inv) => {
                  const status = invitationsService.status(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-700 font-mono">
                          {inv.phone || <span className="font-sans text-slate-400 font-normal">Any phone</span>}
                        </p>
                        {inv.note && (
                          <p className="text-xs text-slate-400 mt-0.5">{inv.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <InviteStatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(inv.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {status === 'active' && (
                            <button
                              onClick={() => handleCopyLink(inv)}
                              title="Copy invite link"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            >
                              {copiedToken === inv.id ? <Check size={12} /> : <Copy size={12} />}
                              {copiedToken === inv.id ? 'Copied' : 'Copy'}
                            </button>
                          )}
                          {status !== 'used' && (
                            <button
                              onClick={() => handleRevoke(inv)}
                              disabled={revoking === inv.id}
                              title="Revoke invitation"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                            >
                              {revoking === inv.id
                                ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                : <Trash2 size={12} />
                              }
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="text-xs text-slate-400 text-center">
        Disabled users can still log in but cannot view any loan or payment data.
      </p>

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onCreated={(inv) => {
            setInvitations((prev) => [inv, ...prev]);
            setTab('invites');
          }}
        />
      )}
    </div>
  );
}
