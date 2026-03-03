import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft, Users, Plus, X, Loader2, Shield, ShieldCheck, UserCog, User,
  Check, Ban, Trash2, Send,
} from 'lucide-react';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthContext';
import { HUB_TILE_OPTIONS } from '../App';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserDoc {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'manager' | 'user';
  apps: string[];
  franchise_id: string;
  hub_tiles?: string[];
  disabled?: boolean;
  last_login_at?: Timestamp;
  created_at?: Timestamp;
}

const ROLES = ['owner', 'admin', 'manager', 'user'] as const;
const APPS = ['hub', 'sdr', 'vault'] as const;

const ROLE_META: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  owner:   { label: 'Owner',   color: 'bg-amber-100 text-amber-700',   icon: ShieldCheck },
  admin:   { label: 'Admin',   color: 'bg-purple-100 text-purple-700', icon: Shield },
  manager: { label: 'Manager', color: 'bg-blue-100 text-blue-700',     icon: UserCog },
  user:    { label: 'User',    color: 'bg-gray-100 text-gray-600',     icon: User },
};

const APP_COLORS: Record<string, string> = {
  hub:   'bg-navy text-white',
  sdr:   'bg-emerald-500 text-white',
  vault: 'bg-violet-500 text-white',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts?: Timestamp): string {
  if (!ts?.toDate) return 'Never';
  return ts.toDate().toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UserManagement() {
  const { isOwner, isAdmin } = useAuth();

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [editing, setEditing] = useState<UserDoc | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form fields
  const [inviting, setInviting] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  const [fEmail, setFEmail] = useState('');
  const [fName, setFName] = useState('');
  const [fRole, setFRole] = useState<UserDoc['role']>('user');
  const [fApps, setFApps] = useState<string[]>(['hub']);
  const [fFranchise, setFFranchise] = useState('east-valley');
  const [fHubTiles, setFHubTiles] = useState<string[]>([]);
  const [fDisabled, setFDisabled] = useState(false);

  // Gate: only owner/admin
  if (!isOwner && !isAdmin) return <Navigate to="/" replace />;

  // Load users
  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'authorized_users'));
      const list: UserDoc[] = [];
      snap.forEach((d) => {
        list.push({ email: d.id, ...d.data() } as UserDoc);
      });
      list.sort((a, b) => {
        const roleOrder = ROLES.indexOf(a.role) - ROLES.indexOf(b.role);
        if (roleOrder !== 0) return roleOrder;
        return a.name.localeCompare(b.name);
      });
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Failed to load users. Check Firestore rules.');
    }
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  // Open modal
  const openAdd = () => {
    setIsNew(true);
    setFEmail('');
    setFName('');
    setFRole('user');
    setFApps(['hub']);
    setFFranchise('east-valley');
    setFHubTiles([]);
    setFDisabled(false);
    setEditing({} as UserDoc);
  };

  const openEdit = (u: UserDoc) => {
    setIsNew(false);
    setFEmail(u.email);
    setFName(u.name);
    setFRole(u.role);
    setFApps([...u.apps]);
    setFFranchise(u.franchise_id);
    setFHubTiles([...(u.hub_tiles || [])]);
    setFDisabled(u.disabled ?? false);
    setEditing(u);
  };

  const closeModal = () => {
    setEditing(null);
    setIsNew(false);
  };

  // Save
  const handleSave = async () => {
    const email = fEmail.trim().toLowerCase();
    if (!email || !fName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, unknown> = {
        name: fName.trim(),
        role: fRole,
        apps: fApps,
        franchise_id: fFranchise.trim() || 'east-valley',
        hub_tiles: fHubTiles,
        disabled: fDisabled,
      };
      if (isNew) {
        data.email = email;
        data.created_at = serverTimestamp();
        await setDoc(doc(db, 'authorized_users', email), data);
      } else {
        data.updated_at = serverTimestamp();
        await updateDoc(doc(db, 'authorized_users', email), data);
      }
      closeModal();
      await loadUsers();
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save user.');
    }
    setSaving(false);
  };

  // Toggle disabled
  const toggleDisabled = async (u: UserDoc) => {
    try {
      await updateDoc(doc(db, 'authorized_users', u.email), {
        disabled: !u.disabled,
        updated_at: serverTimestamp(),
      });
      await loadUsers();
    } catch (err) {
      console.error('Toggle disabled failed:', err);
      setError('Failed to update user.');
    }
  };

  // Delete
  const handleDelete = async (email: string) => {
    try {
      await deleteDoc(doc(db, 'authorized_users', email));
      setConfirmDelete(null);
      await loadUsers();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Failed to delete user.');
    }
  };

  // Send invite email via auth service
  const AUTH_API = import.meta.env.VITE_AUTH_API || 'https://auth-service-326811155221.us-central1.run.app';
  const handleSendInvite = async (email: string) => {
    setInviting(email);
    setInvited(null);
    setError(null);
    try {
      const res = await fetch(`${AUTH_API}/send-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invite');
      }
      setInvited(email);
      setTimeout(() => setInvited(null), 3000);
    } catch (err: unknown) {
      console.error('Send invite failed:', err);
      setError(`Failed to send invite to ${email}.`);
    }
    setInviting(null);
  };

  // Toggle app in form
  const toggleApp = (app: string) => {
    setFApps((prev) =>
      prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]
    );
  };

  // Toggle hub tile in form
  const toggleHubTile = (tileId: string) => {
    setFHubTiles((prev) =>
      prev.includes(tileId) ? prev.filter((t) => t !== tileId) : [...prev, tileId]
    );
  };

  // Group tile options by section
  const tilesBySection = HUB_TILE_OPTIONS.reduce<Record<string, { id: string; label: string }[]>>(
    (acc, t) => { (acc[t.section] ??= []).push(t); return acc; }, {}
  );

  return (
    <div className="min-h-screen bg-warm">
      {/* Header */}
      <header className="bg-navy text-white">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white mb-2 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Hub
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" />
              <h1 className="text-lg font-bold">Team Management</h1>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gold text-navy rounded-lg hover:bg-gold/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add User
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-navy/40" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">No users found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map((u) => {
              const meta = ROLE_META[u.role] || ROLE_META.user;
              const RoleIcon = meta.icon;
              return (
                <div
                  key={u.email}
                  className={`bg-white rounded-xl border border-gray-200 p-4 relative ${u.disabled ? 'opacity-60' : ''}`}
                >
                  {/* Disabled banner */}
                  {u.disabled && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full uppercase">
                      <Ban className="w-3 h-3" /> Disabled
                    </div>
                  )}

                  {/* Name & email */}
                  <h3 className="text-sm font-bold text-gray-800">{u.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>

                  {/* Role badge */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full ${meta.color}`}>
                      <RoleIcon className="w-3 h-3" /> {meta.label}
                    </span>
                  </div>

                  {/* App badges */}
                  <div className="flex items-center gap-1.5 mt-2">
                    {u.apps.map((app) => (
                      <span
                        key={app}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded ${APP_COLORS[app] || 'bg-gray-200 text-gray-600'}`}
                      >
                        {app}
                      </span>
                    ))}
                  </div>

                  {/* Last login */}
                  <p className="text-[10px] text-gray-300 mt-2">
                    Last login: {formatTimestamp(u.last_login_at)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-navy hover:text-navy/70 font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleSendInvite(u.email)}
                      disabled={inviting === u.email || u.disabled}
                      className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-500 font-medium transition-colors disabled:opacity-40"
                    >
                      {inviting === u.email ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : invited === u.email ? (
                        <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Sent!</span></>
                      ) : (
                        <><Send className="w-3 h-3" /> Invite</>
                      )}
                    </button>
                    <button
                      onClick={() => toggleDisabled(u)}
                      className={`text-xs font-medium transition-colors ${u.disabled ? 'text-emerald-600 hover:text-emerald-500' : 'text-orange-500 hover:text-orange-400'}`}
                    >
                      {u.disabled ? 'Enable' : 'Disable'}
                    </button>
                    {u.role !== 'owner' && (
                      <>
                        {confirmDelete === u.email ? (
                          <span className="flex items-center gap-1 ml-auto">
                            <span className="text-[10px] text-red-500">Delete?</span>
                            <button
                              onClick={() => handleDelete(u.email)}
                              className="text-xs text-red-600 font-bold hover:text-red-500"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-400 font-medium hover:text-gray-600"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(u.email)}
                            className="text-xs text-red-400 hover:text-red-500 ml-auto transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800">
                {isNew ? 'Add User' : 'Edit User'}
              </h2>
              <button onClick={closeModal} className="text-gray-300 hover:text-gray-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="px-5 py-4 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value.toLowerCase())}
                  disabled={!isNew}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-navy disabled:bg-gray-50 disabled:text-gray-400"
                  placeholder="name@1800packouts.com"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-navy"
                  placeholder="Full name"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Role
                </label>
                <select
                  value={fRole}
                  onChange={(e) => setFRole(e.target.value as UserDoc['role'])}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-navy bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_META[r].label}</option>
                  ))}
                </select>
              </div>

              {/* Apps */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  App Access
                </label>
                <div className="flex items-center gap-3">
                  {APPS.map((app) => (
                    <label key={app} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fApps.includes(app)}
                        onChange={() => toggleApp(app)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-navy focus:ring-navy"
                      />
                      <span className="text-xs text-gray-600 capitalize">{app}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Hub Tiles */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Hub Tiles
                </label>
                <p className="text-[10px] text-gray-400 mb-2">
                  {fRole === 'owner' || fRole === 'admin'
                    ? 'Owner/Admin always sees all tiles.'
                    : fHubTiles.length === 0
                      ? 'No tiles selected — user sees all tiles by default.'
                      : `${fHubTiles.length} tile${fHubTiles.length !== 1 ? 's' : ''} selected.`}
                </p>
                {fRole !== 'owner' && fRole !== 'admin' && (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-3">
                    {Object.entries(tilesBySection).map(([section, tiles]) => (
                      <div key={section}>
                        <span className="text-[9px] font-bold text-gray-300 uppercase tracking-wider">{section}</span>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                          {tiles.map((tile) => (
                            <label key={tile.id} className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fHubTiles.includes(tile.id)}
                                onChange={() => toggleHubTile(tile.id)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-navy focus:ring-navy"
                              />
                              <span className="text-xs text-gray-600">{tile.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Franchise */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Franchise
                </label>
                <input
                  type="text"
                  value={fFranchise}
                  onChange={(e) => setFFranchise(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-navy"
                  placeholder="east-valley"
                />
              </div>

              {/* Disabled toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${fDisabled ? 'bg-red-400' : 'bg-gray-200'}`}
                  onClick={() => setFDisabled(!fDisabled)}
                >
                  <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${fDisabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-gray-600">Account disabled</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !fEmail.trim() || !fName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-navy text-white rounded-lg hover:bg-navy/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {isNew ? 'Add User' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
