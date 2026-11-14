import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bookmark, Camera, LogOut, Save, Trash2, UserRound } from 'lucide-react';
import { RecommendationPreferences, User } from '../types';
import { api } from '../services/api';
import { storageService } from '../services/storage';
import { uploadUserImage } from '../services/mediaUpload';
import { getAuthUserId, signOutAuth } from '../services/auth';
import { getProfileInitials, getRoleLabel, validatePublicIdentity } from '../utils/profile';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

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
    businessAddress: currentUser.location.businessAddress || '',
  });
  const [status, setStatus] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [avatarImageFailed, setAvatarImageFailed] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isAcknowledgingWarning, setIsAcknowledgingWarning] = useState(false);
  const [warningAckStatus, setWarningAckStatus] = useState('');
  const recommendationScope = storageService.getRecommendationScope(currentUser.id);
  const [recommendationPreferences, setRecommendationPreferences] = useState<RecommendationPreferences>(
    () => storageService.getRecommendationPreferences(recommendationScope),
  );
  const [recommendationStatus, setRecommendationStatus] = useState<string | null>(null);
  const [categoryPreferenceInput, setCategoryPreferenceInput] = useState('');
  const [stylePreferenceInput, setStylePreferenceInput] = useState('');
  const [minimumPriceInput, setMinimumPriceInput] = useState('');
  const [maximumPriceInput, setMaximumPriceInput] = useState('');
  const [currencyPreferenceInput, setCurrencyPreferenceInput] = useState('');
  const [countryPreferenceInput, setCountryPreferenceInput] = useState('');
  const [statePreferenceInput, setStatePreferenceInput] = useState('');

  const loadRecommendationSettings = (preferences: RecommendationPreferences) => {
    setRecommendationPreferences(preferences);
    setCategoryPreferenceInput(preferences.categories.join(', '));
    setStylePreferenceInput(preferences.styles.join(', '));
    setMinimumPriceInput(preferences.minimumPrice === null ? '' : String(preferences.minimumPrice));
    setMaximumPriceInput(preferences.maximumPrice === null ? '' : String(preferences.maximumPrice));
    setCurrencyPreferenceInput(preferences.currency);
    setCountryPreferenceInput(preferences.country);
    setStatePreferenceInput(preferences.state);
  };

  useEffect(() => {
    loadRecommendationSettings(storageService.getRecommendationPreferences(recommendationScope));
    let cancelled = false;
    void api.getRecommendationPreferences().then(({ preferences }) => {
      if (cancelled || !preferences) return;
      storageService.saveRecommendationPreferences(recommendationScope, preferences);
      loadRecommendationSettings(preferences);
    }).catch(error => {
      if (!cancelled) {
        console.warn('Account recommendation preferences could not be loaded.', error);
        setRecommendationStatus('Account settings are temporarily unavailable; this device’s saved settings are still in use.');
      }
    });
    return () => { cancelled = true; };
  }, [recommendationScope]);

  const saveRecommendationSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    const minimum = minimumPriceInput.trim() ? Number(minimumPriceInput) : null;
    const maximum = maximumPriceInput.trim() ? Number(maximumPriceInput) : null;
    if ((minimum !== null && (!Number.isFinite(minimum) || minimum < 0))
      || (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))
      || (minimum !== null && maximum !== null && minimum > maximum)
      || ((minimum !== null || maximum !== null) && !currencyPreferenceInput.trim())) {
      setRecommendationStatus('Enter a valid price range and its currency, with the minimum no greater than the maximum.');
      return;
    }
    const splitList = (value: string) => Array.from(new Set(value.split(',').map(item => item.trim()).filter(Boolean))).slice(0, 20);
    const next: RecommendationPreferences = {
      ...recommendationPreferences,
      categories: splitList(categoryPreferenceInput),
      styles: splitList(stylePreferenceInput),
      minimumPrice: minimum,
      maximumPrice: maximum,
      currency: currencyPreferenceInput.trim().toUpperCase().slice(0, 3),
      country: countryPreferenceInput.trim().slice(0, 80),
      state: statePreferenceInput.trim().slice(0, 80),
    };
    storageService.saveRecommendationPreferences(recommendationScope, next);
    setRecommendationPreferences(next);
    try {
      await api.saveRecommendationPreferences(next);
      setRecommendationStatus('Your discovery settings are saved to your account.');
    } catch (error) {
      setRecommendationStatus(`Saved on this device, but account sync could not be completed: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
    }
  };

  const resetRecommendationSettings = async () => {
    storageService.resetRecommendationData(recommendationScope);
    const defaults = storageService.getRecommendationPreferences(recommendationScope);
    loadRecommendationSettings(defaults);
    setRecommendationStatus('Discovery settings and this device’s activity history were reset.');
    try {
      await api.resetRecommendationPreferences();
    } catch (error) {
      setRecommendationStatus(`Reset on this device, but account settings could not be cleared: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
    }
  };

  const setRecommendationEnabled = async (enabled: boolean) => {
    const next = { ...recommendationPreferences, enabled };
    storageService.saveRecommendationPreferences(recommendationScope, next);
    setRecommendationPreferences(next);
    setRecommendationStatus(enabled
      ? 'Activity-based recommendations are on.'
      : 'Activity-based recommendations are off and local activity history was cleared.');
    try {
      await api.saveRecommendationPreferences(next);
    } catch (error) {
      setRecommendationStatus(`Your choice is saved on this device, but account sync could not be completed: ${safeCustomerErrorMessage(error, 'please try again later.')}`);
    }
  };

  const uploadAvatar = async (file: File | undefined) => {
    const userId = await getAuthUserId();
    if (!file || !userId) return;
    setIsUploadingAvatar(true);
    setAvatarUploadProgress(0);
    setStatus(null);
    try {
      const uploadedUrl = await uploadUserImage(file, userId, 'profiles', `avatar-${Date.now()}.jpg`, false, setAvatarUploadProgress);
      setAvatarUrl(uploadedUrl);
      setAvatarImageFailed(false);
      setStatus('Profile picture ready. Save your profile to publish it.');
    } catch (error) {
      setStatus(safeCustomerErrorMessage(error, "We couldn't upload your profile picture. Please try again."));
    } finally {
      setIsUploadingAvatar(false);
    }
  };
  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void uploadAvatar(event.target.files?.[0]);
    event.target.value = '';
  };

  const acknowledgeWarning = async () => {
    setIsAcknowledgingWarning(true);
    setWarningAckStatus('');
    try {
      await api.acknowledgeWarning();
      const cleared = storageService.updateUser(currentUser.id, { isWarned: false }) || { ...currentUser, isWarned: false };
      window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: cleared }));
    } catch (error) {
      setWarningAckStatus(safeCustomerErrorMessage(error, "The warning couldn't be marked as read. Please try again."));
    } finally {
      setIsAcknowledgingWarning(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const updates = {
      ...form,
      avatarUrl,
      name: form.name.trim(),
      handle: form.handle.trim(),
      phone: form.phone.trim(),
      bio: form.bio.trim(),
      location: { ...currentUser.location, businessAddress: form.businessAddress.trim() },
    };
    if (!updates.name || !updates.handle) {
      setStatus('Name and handle are required.');
      return;
    }
    const identityError = validatePublicIdentity(updates.name, updates.handle);
    if (identityError) {
      setStatus(identityError);
      return;
    }
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
    const confirmation = window.prompt('This permanently deletes your account and all of its data. Type DELETE to continue.');
    if (confirmation?.trim().toUpperCase() !== 'DELETE') {
      if (confirmation !== null) setStatus('Account deletion cancelled. The confirmation text did not match.');
      return;
    }
    setIsDeletingAccount(true);
    setStatus(null);
    try {
      await api.deleteMyAccount();
      storageService.deleteUser(currentUser.id);
      storageService.setCurrentUser(null);
      await signOutAuth();
      onLogout();
    } catch (error) {
      setStatus(safeCustomerErrorMessage(error, "Your account couldn't be deleted. Please try again."));
      setIsDeletingAccount(false);
    }
  };

  const surface = isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm';

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className={`rounded-3xl border p-5 sm:p-8 ${surface}`}>
        <div className="flex flex-col gap-5 border-b border-neutral-800/60 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl && !avatarImageFailed ? <img src={avatarUrl} alt="Profile" onError={() => setAvatarImageFailed(true)} className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-xl font-black text-neutral-950">{getProfileInitials(form.name || currentUser.name)}</div>}
              <label
                className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-amber-300 bg-amber-400 text-neutral-950 shadow-lg"
                title="Change profile picture"
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); void uploadAvatar(event.dataTransfer.files?.[0]); }}
              >
                <Camera className="h-4 w-4" />
                <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={isUploadingAvatar} className="hidden" />
              </label>
            </div>
            {isUploadingAvatar && <div className="mt-2 text-[10px] text-amber-400">{avatarUploadProgress}% uploaded</div>}
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
                {warningAckStatus && <p role="status" className="mt-3 text-xs text-red-200">{warningAckStatus}</p>}
                <button type="button" onClick={() => void acknowledgeWarning()} disabled={isAcknowledgingWarning} className="mt-4 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-400 disabled:cursor-wait disabled:opacity-60">{isAcknowledgingWarning ? 'Saving…' : 'OK, I have read this'}</button>
              </div>
            </div>
          </section>
        )}

        <form onSubmit={saveProfile} className="mt-8 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">Full name<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Handle<input value={form.handle} onChange={event => setForm({ ...form, handle: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold">Phone<input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          <label className="text-xs font-semibold sm:col-span-2">Bio<textarea rows={4} value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} className="mt-1.5 w-full resize-y rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" /></label>
          {(currentUser.role === 'tailor' || currentUser.role === 'fabric_seller') && (
            <label className="text-xs font-semibold sm:col-span-2">
              Business address
              <input
                type="text"
                value={form.businessAddress}
                onChange={event => setForm({ ...form, businessAddress: event.target.value })}
                placeholder="Street address, shop name, landmark"
                maxLength={240}
                className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm"
              />
              <span className="mt-1 block text-[10px] font-normal text-neutral-500">This address is shown on your seller profile. Your country, state, and city remain linked to your original registration location.</span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button type="submit" disabled={isUploadingAvatar} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-300 disabled:opacity-60"><Save className="h-4 w-4" /> Save profile</button>{status && <span className="text-xs text-emerald-400">{status}</span>}</div>
        </form>

        <section className={`mt-8 rounded-2xl border p-4 sm:p-5 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/30' : 'border-neutral-200 bg-neutral-50'}`} aria-labelledby="discovery-settings-title">
          <div className="mb-4">
            <h2 id="discovery-settings-title" className="text-base font-bold">Discovery settings</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">Recommendations learn from your searches, listing views, likes, saves, enquiries, and the sellers you follow. Activity is kept on this device for up to 180 days; no sensitive traits are inferred.</p>
          </div>
          <form onSubmit={saveRecommendationSettings} className="space-y-4">
            <label className="flex items-start gap-3 text-xs">
              <input
                type="checkbox"
                checked={recommendationPreferences.enabled}
                onChange={event => void setRecommendationEnabled(event.target.checked)}
                className="mt-0.5 accent-amber-400"
              />
              <span><strong>Use my activity to personalize recommendations</strong><span className="mt-1 block text-neutral-500">When turned off, locally stored activity is cleared. Your marketplace searches and filters continue to work normally.</span></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Preferred categories (optional)
                <input value={categoryPreferenceInput} onChange={event => setCategoryPreferenceInput(event.target.value)} placeholder="Clothing, Fabric" className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Styles or materials (optional)
                <input value={stylePreferenceInput} onChange={event => setStylePreferenceInput(event.target.value)} placeholder="Senator, linen, Ankara" className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Minimum price
                <input type="number" min="0" step="any" value={minimumPriceInput} onChange={event => setMinimumPriceInput(event.target.value)} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Maximum price
                <input type="number" min="0" step="any" value={maximumPriceInput} onChange={event => setMaximumPriceInput(event.target.value)} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Price currency (required with a price range)
                <input value={currencyPreferenceInput} onChange={event => setCurrencyPreferenceInput(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3))} maxLength={3} placeholder="USD" className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Preferred country
                <input value={countryPreferenceInput} onChange={event => setCountryPreferenceInput(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
              <label className="text-xs font-semibold">Preferred state or region
                <input value={statePreferenceInput} onChange={event => setStatePreferenceInput(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-xl border border-neutral-700 bg-neutral-900/40 px-3 py-2.5 text-sm" />
              </label>
            </div>
            <p className="text-[11px] text-neutral-500">These optional settings influence ranking but do not hide listings. Use marketplace filters when you need to restrict results.</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-bold text-neutral-950 hover:bg-amber-300"><Save className="h-4 w-4" /> Save discovery settings</button>
              <button type="button" onClick={() => void resetRecommendationSettings()} className="rounded-xl border border-neutral-700 px-4 py-2.5 text-xs font-semibold hover:border-amber-400">Reset settings and activity</button>
              {recommendationStatus && <span role="status" className="text-xs text-neutral-500">{recommendationStatus}</span>}
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-2xl border border-red-500/25 bg-red-500/5 p-4" aria-labelledby="delete-account-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="delete-account-title" className="text-sm font-bold text-red-200">Delete account</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-neutral-400">Permanently removes your profile, posts, messages, collections, and sign-in account. This action cannot be reversed.</p>
            </div>
            <button type="button" onClick={() => void deleteAccount()} disabled={isDeletingAccount} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"><Trash2 className="h-4 w-4" /> {isDeletingAccount ? 'Deleting...' : 'Delete my account'}</button>
          </div>
        </section>
      </div>
    </div>
  );
};