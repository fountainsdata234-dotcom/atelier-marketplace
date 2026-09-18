import React, { useState } from 'react';
import { AlertTriangle, Bookmark, Camera, LogOut, Save, Trash2, UserRound } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/api';
import { storageService } from '../services/storage';
import { firebaseAuth, uploadUserImage } from '../services/firebase';
import { getProfileInitials, getRoleLabel } from '../utils/profile';

interface ProfilePageProps {
  currentUser: User;
  isDarkMode: boolean;
  onNavigate: (view: string) => void;
  onLogout: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ currentUser, isDarkMode, onNavigate, onLogout }) => {
  const [form, setForm] = useState({
    name: currentUser.name,
    handle: currentUser.handle,
    phone: currentUser.phone,
    bio: currentUser.bio || '',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !firebaseAuth.currentUser) return;
    setIsUploadingAvatar(true);
    setStatus(null);
    try {
      const uploadedUrl = await uploadUserImage(file, firebaseAuth.currentUser.uid, 'profiles', `avatar-${Date.now()}.jpg`);
      setAvatarUrl(uploadedUrl);
      setStatus('Profile picture ready. Save your profile to publish it.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Profile picture upload failed.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const acknowledgeWarning = async () => {
    const cleared = storageService.updateUser(currentUser.id, { isWarned: false, warningNote: '' });
    if (cleared) window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: cleared }));
    try {
      await api.saveProfile({ isWarned: false, warningNote: '' });
    } catch {
      setStatus('Notice cleared on this device.');
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const updates = { ...form, avatarUrl, name: form.name.trim(), handle: form.handle.trim(), phone: form.phone.trim(), bio: form.bio.trim() };
    if (!updates.name || !updates.handle) {
      setStatus('Name and handle are required.');
      return;
    }
    const cached = storageService.updateUser(currentUser.id, updates);
    if (cached) window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: cached }));
    try {
      const saved = await api.saveProfile(updates);
      const synced = storageService.updateUser(currentUser.id, { ...updates, ...(saved || {}) });
      if (synced) window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: synced }));
      setStatus('Profile saved successfully.');
    } catch {
      setStatus('Saved on this device. It will sync when you reconnect.');
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your account, profile, posts, messages, collections, and Firebase login? This cannot be undone.')) return;
    setIsDeletingAccount(true);
    setStatus(null);
    try {
      await api.deleteMyAccount();
      storageService.deleteUser(currentUser.id);
      storageService.setCurrentUser(null);
      onLogout();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Your account could not be deleted. Please try again.');
      setIsDeletingAccount(false);
    }
  };

  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className={`rounded-3xl border p-5 sm:p-8 ${surface}`}>
        <div className="flex flex-col gap-5 border-b border-neutral-800/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? <img src={avatarUrl} alt="Profile" className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-xl font-black text-neutral-950">{getProfileInitials(form.name || currentUser.name)}</div>}
              <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-amber-300 bg-amber-400 text-neutral-950 shadow-lg" title="Change profile picture">
                <Camera className="h-4 w-4" />
                <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={isUploadingAvatar} className="hidden" />
              </label>
            </div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Your profile</p><h1 className="mt-1 text-2xl font-serif font-bold sm:text-3xl">{form.name || currentUser.name}</h1><p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-500">{getRoleLabel(currentUser.role)}</p><p className="text-xs text-neutral-400">{currentUser.email}</p></div>
          </div>
          <button type="button" onClick={onLogout} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"><LogOut className="h-4 w-4" /> Log out</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onNavigate('collections')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-amber-500/50 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}><Bookmark className="h-5 w-5 text-amber-400" /><span><strong className="block text-sm">Saved collection</strong><small className="text-xs text-neutral-400">View your saved designs and inspiration.</small></span></button>
          <button type="button" onClick={() => onNavigate('marketplace')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-amber-500/50 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'}`}><UserRound className="h-5 w-5 text-amber-400" /><span><strong className="block text-sm">Continue exploring</strong><small className="text-xs text-neutral-400">Discover tailors and fabric sellers.</small></span></button>
        </div>

        {currentUser.isWarned && currentUser.warningNote && (
          <section className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4" aria-labelledby="account-alert-title">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div>
                <h2 id="account-alert-title" className="text-sm font-bold text-red-200">Urgent account alert</h2>
                <p className="mt-2 text-sm leading-relaxed text-red-100/90">{currentUser.warningNote}</p>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300/70">Please review this notice before publishing or accepting new requests.</p>
                <button type="button" onClick={() => void acknowledgeWarning()} className="mt-4 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-400">OK, I have read this</button>
              </div>
            </div>
          </section>
        )}

        <form onSubmit={saveProfile} className="mt-8 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">Full name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Handle<input value={form.handle} onChange={event => setForm({ ...form, handle: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Phone<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold sm:col-span-2">Bio<textarea rows={4} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1.5 w-full resize-y rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={isUploadingAvatar} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-300 disabled:opacity-60"><Save className="h-4 w-4" /> Save profile</button>{status && <span className="text-xs text-emerald-400">{status}</span>}</div>
        </form>

        <section className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/5 p-4" aria-labelledby="delete-account-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="delete-account-title" className="text-sm font-bold text-red-200">Delete account</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">Permanently removes your profile, posts, messages, collections, and Firebase login. This action cannot be reversed.</p>
            </div>
            <button type="button" onClick={() => void deleteAccount()} disabled={isDeletingAccount} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" /> {isDeletingAccount ? 'Deleting...' : 'Delete my account'}</button>
          </div>
        </section>
      </div>
    </div>
  );
};