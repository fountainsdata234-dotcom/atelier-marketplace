import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scissors, ShoppingBag, Shield, MapPin, Phone, Lock, Mail, User as UserIcon, Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff, Chrome } from 'lucide-react';
import { User, UserRole } from '../types';
import { WORLD_COUNTRIES } from '../data/geoData';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';
import { storageService } from '../services/storage';
import { firebaseErrorMessage, loginWithEmail, loginWithGoogle, registerWithEmail, resetPassword, toAppUser, uploadUserImage } from '../services/firebase';
import { api } from '../services/api';
import { SearchableLocationField } from './SearchableLocationField';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: UserRole;
  onSuccess: (user: User) => void;
  isDarkMode: boolean;
  onNavigate?: (view: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultRole = 'buyer',
  onSuccess,
  isDarkMode,
  onNavigate,
}) => {
  const [isRegistering, setIsRegistering] = useState<boolean>(true);
  const [role, setRole] = useState<UserRole>(defaultRole);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [shopName, setShopName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // Location Cascading State
  const [selectedCountryCode, setSelectedCountryCode] = useState('NG');
  const [selectedStateCode, setSelectedStateCode] = useState('');
  const [selectedCityName, setSelectedCityName] = useState('');
  const [countrySearch, setCountrySearch] = useState('Nigeria');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [detectedCountryCode, setDetectedCountryCode] = useState('NG');

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const openLegalPage = (view: 'terms' | 'privacy') => {
    onClose();
    onNavigate?.(view);
  };

  const avatarInitials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AT';
  const fileExtension = (file: File) => file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';

  const handleAvatarUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for your profile picture.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('Profile pictures must be 4 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    setAvatarFile(file);
    reader.onload = () => setAvatarUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  // Sync country data
  const selectedCountry = WORLD_COUNTRIES.find(c => c.code === selectedCountryCode) || WORLD_COUNTRIES[0];
  const states = selectedCountry.states;
  const currentStateObj = states.find(s => s.code === selectedStateCode) || null;
  const cities = currentStateObj ? currentStateObj.cities : [];

  const filteredCountries = WORLD_COUNTRIES.filter((country) => {
    const term = countrySearch.trim().toLowerCase();
    if (!term) return true;
    return country.name.toLowerCase().includes(term)
      || country.code.toLowerCase().includes(term)
      || country.dialCode.toLowerCase().includes(term);
  });

  const filteredStates = states.filter((state) => {
    const term = stateSearch.trim().toLowerCase();
    if (!term) return true;
    return state.name.toLowerCase().includes(term)
      || state.code?.toLowerCase().includes(term);
  });

  const filteredCities = cities.filter((city) => {
    const term = citySearch.trim().toLowerCase();
    if (!term) return true;
    return city.toLowerCase().includes(term);
  });

  const restoreAutoCountry = (overrideCode?: string) => {
    const nextCountryCode = overrideCode || detectedCountryCode || 'NG';
    const fallbackCountry = WORLD_COUNTRIES.find((country) => country.code === nextCountryCode) || WORLD_COUNTRIES[0];
    setSelectedCountryCode(fallbackCountry.code);
    setCountrySearch(fallbackCountry.name);
    const firstState = fallbackCountry.states[0];
    setSelectedStateCode(firstState?.code || '');
    setStateSearch(firstState?.name || '');
    setSelectedCityName(firstState?.cities[0] || '');
    setCitySearch(firstState?.cities[0] || '');
  };

  useEffect(() => {
    if (selectedCountry) {
      setCountrySearch(selectedCountry.name);
      const firstState = selectedCountry.states[0];
      const nextStateCode = firstState?.code || '';
      setSelectedStateCode((prevStateCode) => {
        if (prevStateCode && selectedCountry.states.some(state => state.code === prevStateCode)) {
          return prevStateCode;
        }
        return nextStateCode;
      });
      setSelectedCityName((prevCity) => {
        const firstCity = firstState?.cities[0] || '';
        if (prevCity && firstState?.cities.includes(prevCity)) {
          return prevCity;
        }
        return firstCity;
      });
    }
  }, [selectedCountryCode]);

  useEffect(() => {
    if (currentStateObj) {
      setStateSearch(currentStateObj.name);
      setSelectedCityName((prevCity) => {
        if (prevCity && currentStateObj.cities.includes(prevCity)) {
          return prevCity;
        }
        return currentStateObj.cities[0] || '';
      });
      return;
    }

    setStateSearch('');
    setSelectedCityName('');
  }, [currentStateObj]);

  useEffect(() => {
    setCitySearch(selectedCityName);
  }, [selectedCityName]);

  useEffect(() => {
    setRole(defaultRole);
  }, [defaultRole]);

  useEffect(() => {
    if (!isOpen || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
            {
              headers: {
                'Accept-Language': 'en',
              },
            },
          );

          if (!response.ok) return;
          const payload = await response.json();
          const countryName = String(payload?.address?.country || '').trim();
          const stateName = String(payload?.address?.state || payload?.address?.province || payload?.address?.county || '').trim();
          const cityName = String(payload?.address?.city || payload?.address?.town || payload?.address?.village || payload?.address?.municipality || '').trim();

          if (!countryName && !stateName) return;

          const matchedCountry = WORLD_COUNTRIES.find((country) => country.name.toLowerCase() === countryName.toLowerCase() || country.code.toLowerCase() === countryName.toLowerCase())
            || selectedCountry;

          if (!matchedCountry) return;

          setDetectedCountryCode(matchedCountry.code);
          setSelectedCountryCode(matchedCountry.code);
          setCountrySearch(matchedCountry.name);

          if (stateName) {
            const matchedState = matchedCountry.states.find((state) => state.name.toLowerCase() === stateName.toLowerCase());
            if (matchedState) {
              setSelectedStateCode(matchedState.code || '');
              setStateSearch(matchedState.name);

              if (cityName) {
                const matchedCity = matchedState.cities.find((city) => city.toLowerCase() === cityName.toLowerCase());
                if (matchedCity) {
                  setSelectedCityName(matchedCity);
                  setCitySearch(matchedCity);
                  return;
                }
              }

              setSelectedCityName('');
              setCitySearch('');
              return;
            }

            setSelectedStateCode('');
            setStateSearch(stateName);
            setSelectedCityName('');
            setCitySearch('');
          }
        } catch {
          // Ignore reverse-geocode failures and keep the normal manual selection flow active.
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 },
    );
  }, [isOpen, selectedCountry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
    if (!isRegistering) {
      const firebaseUser = await loginWithEmail(email.trim(), password);
      const user = storageService.upsertUser(await toAppUser(firebaseUser));
      setSuccessMsg(`Welcome back, ${user.name}! Your Fabrilux Atelier studio is ready for your next bespoke discovery.`);
      setTimeout(() => {
        onSuccess(user);
        onClose();
      }, 500);
      return;
    }

    // REGISTRATION FLOW
    if (!acceptedPolicies) {
      setError('Please accept the Terms of Service and Privacy Policy to create an account.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide your full or business name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your active phone number.');
      return;
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/\./.test(password)) {
      setError('Password must be at least 8 characters long and contain a capital letter and a period.');
      return;
    }
    if (!currentStateObj || !selectedCityName || !cities.includes(selectedCityName)) {
      setError('Please select both your state and city so nearby discovery can work correctly.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const parsedPhone = parsePhoneNumberFromString(phone.trim(), selectedCountryCode as CountryCode);
    if (!parsedPhone || !parsedPhone.isValid() || parsedPhone.country !== selectedCountryCode) {
      setError(`Enter a valid ${selectedCountry.name} phone number. Its country code must match ${selectedCountry.dialCode}.`);
      return;
    }

    const parsedWhatsapp = whatsappNumber.trim()
      ? parsePhoneNumberFromString(whatsappNumber.trim(), selectedCountryCode as CountryCode)
      : parsedPhone;
    if (!parsedWhatsapp || !parsedWhatsapp.isValid() || parsedWhatsapp.country !== selectedCountryCode) {
      setError(`Enter a valid ${selectedCountry.name} WhatsApp number with country code ${selectedCountry.dialCode}.`);
      return;
    }

    const userHandle = handle.trim() 
      ? (handle.startsWith('@') ? handle.trim() : `@${handle.trim()}`)
      : `@${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    const firebaseUser = await registerWithEmail(email.trim().toLowerCase(), password, name.trim());
    const storedAvatarUrl = avatarFile
      ? await uploadUserImage(avatarFile, firebaseUser.uid, 'profiles', `avatar-${Date.now()}.${fileExtension(avatarFile)}`)
      : firebaseUser.photoURL || undefined;
    const newUser = storageService.upsertUser({
      ...(await toAppUser(firebaseUser, role)),
      name: name.trim(),
      phone: parsedPhone.formatInternational(),
      countryCode: selectedCountry.dialCode,
      location: { country: selectedCountry.name, countryCode: selectedCountry.code, currency: selectedCountry.currency, state: currentStateObj?.name || '', city: selectedCityName, lat: selectedCountry.lat, lng: selectedCountry.lng },
      whatsappNumber: parsedWhatsapp.formatInternational(),
      shopName: shopName.trim() || undefined,
      handle: userHandle,
      bio: bio.trim() || undefined,
      avatarUrl: storedAvatarUrl || avatarUrl || undefined,
    });
    await api.saveProfile(newUser);

    setSuccessMsg(`Welcome to Fabrilux Atelier. Your premium studio access is ready, and your tailored journey begins now.`);
    setTimeout(() => {
      onSuccess(newUser);
      onClose();
    }, 600);
    } catch (authError) {
      setError(firebaseErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const firebaseUser = await loginWithGoogle();
      const user = storageService.upsertUser(await toAppUser(firebaseUser, defaultRole as UserRole));
      await api.saveProfile(user);
      onSuccess(user);
      onClose();
    } catch (authError) {
      setError(firebaseErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Enter your account email first, then choose reset password.');
      return;
    }
    setIsResettingPassword(true);
    try {
      await resetPassword(email.trim());
      setSuccessMsg('Password reset email sent. Check your inbox and spam folder.');
    } catch (authError) {
      setError(firebaseErrorMessage(authError));
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`relative w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[calc(100vh-2rem)] overflow-y-auto rounded-none sm:rounded-3xl border shadow-2xl p-4 sm:p-6 md:p-8 my-0 sm:my-8 transition-colors ${
          isDarkMode
            ? 'bg-[#121316] border-neutral-800 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-neutral-800/20 text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3">
            {role === 'tailor' && <Scissors className="w-6 h-6" />}
            {role === 'fabric_seller' && <Sparkles className="w-6 h-6" />}
            {role === 'buyer' && <ShoppingBag className="w-6 h-6" />}
            {role === 'admin' && <Shield className="w-6 h-6" />}
          </div>
          <h2 className="text-2xl font-serif font-bold tracking-tight">
            {isRegistering ? 'Join the Fabrilux Atelier Network' : 'Welcome Back to Fabrilux Atelier'}
          </h2>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {isRegistering
              ? 'Choose your membership type to customize your tailored dashboard.'
              : 'Sign in to access your bespoke orders, inventory, or administration.'}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex rounded-xl p-1 mb-6 bg-neutral-800/40 border border-neutral-700/40 text-xs font-medium">
          <button
            type="button"
            onClick={() => { setIsRegistering(true); setError(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              isRegistering
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Create New Account
          </button>
          <button
            type="button"
            onClick={() => { setIsRegistering(false); setError(null); }}
            className={`flex-1 py-2 rounded-lg transition-all ${
              !isRegistering
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Error / Success Notifications */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-red-300 hover:text-white transition-colors"
                aria-label="Close error message"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {successMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-300 hover:text-white transition-colors"
                aria-label="Close success message"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Role Picker (Registration only) */}
          {isRegistering && (
            <div>
              <label className="block text-xs font-medium text-amber-500/90 mb-1.5 uppercase tracking-wider">
                Select Account Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('tailor')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'tailor'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-semibold">Master Tailor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('fabric_seller')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'fabric_seller'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-semibold">Fabric Merchant</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={`p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'buyer'
                      ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span className="text-xs font-semibold">Client / Buyer</span>
                </button>
              </div>
            </div>
          )}

          {isRegistering && (
            <label className="flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/30 p-3 text-[11px] leading-relaxed text-neutral-400">
              <input type="checkbox" checked={acceptedPolicies} onChange={(event) => setAcceptedPolicies(event.target.checked)} className="mt-0.5 accent-amber-500" />
              <span>I agree to the <button type="button" onClick={() => openLegalPage('terms')} className="font-semibold text-amber-400 underline underline-offset-2">Terms of Service</button> and <button type="button" onClick={() => openLegalPage('privacy')} className="font-semibold text-amber-400 underline underline-offset-2">Privacy Policy</button>.</span>
            </label>
          )}

          {/* Registration Fields */}
          {isRegistering && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    {role === 'buyer' ? 'Full Name' : 'Tailor / Atelier Name'} *
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={role === 'tailor' ? 'e.g. Master Adewale' : 'e.g. Elena Rostova'}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Public Handle *
                  </label>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@adewale_atelier"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                {avatarUrl ? <img src={avatarUrl} alt="Profile preview" className="h-14 w-14 rounded-full object-cover ring-2 ring-amber-400/60" /> : <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-lg font-bold text-amber-300 ring-2 ring-amber-500/30">{avatarInitials}</div>}
                <div className="min-w-0 flex-1">
                  <label className="block text-xs font-semibold text-neutral-200">Profile picture</label>
                  <p className="mt-0.5 text-[10px] text-neutral-500">Use a clear photo or your initials will be used.</p>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleAvatarUpload(e.target.files?.[0])} className="mt-2 block w-full text-[10px] text-neutral-400 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-400 file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-neutral-950" />
                </div>
              </div>

              {/* Location Selectors: Country, State, City */}
              <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/40 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Geographic Location & Origin</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <SearchableLocationField
                    label="Country"
                    value={countrySearch}
                    onChange={(nextValue) => {
                      setCountrySearch(nextValue);
                      const match = WORLD_COUNTRIES.find((country) => country.name.toLowerCase() === nextValue.trim().toLowerCase() || country.code.toLowerCase() === nextValue.trim().toLowerCase());
                      if (match) {
                        setSelectedCountryCode(match.code);
                      }
                    }}
                    onClear={() => {
                      setCountrySearch('');
                      restoreAutoCountry();
                    }}
                    options={filteredCountries.map((country) => country.name)}
                    placeholder="Search country"
                    listId="country-search-list"
                  />

                  <SearchableLocationField
                    label="State / Province"
                    value={stateSearch}
                    onChange={(nextValue) => {
                      setStateSearch(nextValue);
                      const match = states.find((state) => state.name.toLowerCase() === nextValue.trim().toLowerCase() || state.code?.toLowerCase() === nextValue.trim().toLowerCase());
                      if (match) {
                        setSelectedStateCode(match.code || '');
                      } else {
                        setSelectedStateCode('');
                      }
                    }}
                    onClear={() => {
                      const fallbackCountry = WORLD_COUNTRIES.find((country) => country.code === selectedCountryCode) || WORLD_COUNTRIES[0];
                      const firstState = fallbackCountry.states[0];
                      setStateSearch(firstState?.name || '');
                      setSelectedStateCode(firstState?.code || '');
                      setSelectedCityName(firstState?.cities[0] || '');
                      setCitySearch(firstState?.cities[0] || '');
                    }}
                    options={filteredStates.map((state) => state.name)}
                    placeholder="Search state"
                    listId="state-search-list"
                    required
                  />

                  <SearchableLocationField
                    label="City / District"
                    value={citySearch}
                    onChange={(nextValue) => {
                      setCitySearch(nextValue);
                      const match = cities.find((city) => city.toLowerCase() === nextValue.trim().toLowerCase());
                      if (match) {
                        setSelectedCityName(match);
                      } else {
                        setSelectedCityName('');
                      }
                    }}
                    onClear={() => {
                      const fallbackCountry = WORLD_COUNTRIES.find((country) => country.code === selectedCountryCode) || WORLD_COUNTRIES[0];
                      const fallbackState = fallbackCountry.states.find((state) => state.code === selectedStateCode) || fallbackCountry.states[0];
                      const fallbackCity = fallbackState?.cities[0] || '';
                      setCitySearch(fallbackCity);
                      setSelectedCityName(fallbackCity);
                    }}
                    options={filteredCities}
                    placeholder="Search city"
                    listId="city-search-list"
                    required
                  />
                </div>
                <p className="text-[10px] text-neutral-500">
                  Local currency: <span className="text-amber-400 font-medium">{selectedCountry.currency}</span>
                </p>
              </div>

              {/* Phone & WhatsApp with Dial Code Tracker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Mobile Number * ({selectedCountry.flag} {selectedCountry.dialCode})
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="801 234 5678"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    WhatsApp (For Direct Orders)
                  </label>
                  <input
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder={`${selectedCountry.dialCode}8012345678`}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Tailor/Seller Additional Info */}
              {(role === 'tailor' || role === 'fabric_seller') && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Specialization & Craft Bio
                  </label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={
                      role === 'tailor'
                        ? 'e.g. Bespoke Italian suits, African traditional agbada & modern kaftans, handcrafted embroidery.'
                        : 'e.g. Premium imported Italian wool, Swiss voile lace, authentic Guinea brocade.'
                    }
                    className="w-full p-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
            </>
          )}

          {/* Email & Password (Common) */}
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Email Address *</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Password {isRegistering && '(8+ characters)'} *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-2.5 text-neutral-500 hover:text-amber-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isRegistering && <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">Use at least 8 characters, including one capital letter and a period. Longer passwords are welcome.</p>}
          </div>

          {isRegistering && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Confirm Password *</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-neutral-500" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShowConfirmPassword(value => !value)} className="absolute right-3 top-2.5 text-neutral-500 hover:text-amber-400" aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}>
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {!isRegistering && (
            <div className="flex justify-end -mt-2">
              <button type="button" onClick={handlePasswordReset} disabled={isResettingPassword} className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50 inline-flex items-center gap-1.5">
                {isResettingPassword && (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300/40 border-t-amber-300" />
                )}
                {isResettingPassword ? 'Sending reset email...' : 'Forgot password? Reset it'}
              </button>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isResettingPassword || isSubmitting}
            className="w-full py-3 rounded-xl font-medium text-xs uppercase tracking-wider text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all duration-200 mt-2 cursor-pointer font-sans disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {isSubmitting && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-900/30 border-t-neutral-900" />}
              {isRegistering ? `Create ${role.replace('_', ' ')} Account` : 'Sign In to Dashboard'}
            </span>
          </button>

          {!isRegistering && (
            <>
              <div className="flex items-center gap-3 py-1 text-[10px] uppercase tracking-widest text-neutral-500">
                <span className="h-px flex-1 bg-neutral-800" />
                <span>or</span>
                <span className="h-px flex-1 bg-neutral-800" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl border border-neutral-700 bg-white text-neutral-900 text-xs font-semibold hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-900/30 border-t-neutral-900" />
                ) : (
                  <Chrome className="w-4 h-4" />
                )}
                Continue with Google
              </button>
            </>
          )}
        </form>

      </motion.div>
    </div>
  );
};
