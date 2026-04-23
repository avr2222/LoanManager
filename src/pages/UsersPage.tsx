import { useEffect, useState } from 'react';
import { Users, ShieldOff, ShieldCheck, Phone, RefreshCw } from 'lucide-react';
import { profilesService, type Profile } from '@/services/profilesService';
import { useAuth } from '@/context/AuthContext';

export function UsersPage() {
  const { displayName } = useAuth();
  const [users, setUsers]       = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [toggling, setToggling] = useState<string | null>(null); // userId being toggled
  const [error, setError]       = useState<string | null>(null);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    const data = await profilesService.listAll();
    setUsers(data);
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleToggle(user: Profile) {
    setToggling(user.id);
    setError(null);
    const newActive = !user.isActive;
    const { error: err } = await profilesService.setActive(
      user.id,
      newActive,
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

  const activeCount   = users.filter((u) => u.isActive).length;
  const disabledCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Users</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {users.length} registered · {activeCount} active · {disabledCount} disabled
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-16 flex flex-col items-center gap-3 text-slate-400">
          <Users size={32} className="text-slate-300" />
          <p className="text-sm">No phone users registered yet.</p>
          <p className="text-xs text-slate-300">Users are created automatically when loans are imported.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Disabled By</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className={`transition-colors ${!u.isActive ? 'bg-red-50/30' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                        <Phone size={12} className="text-indigo-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-800 font-mono">{u.phone || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        Disabled users can still log in but cannot view any loan or payment data.
      </p>
    </div>
  );
}
