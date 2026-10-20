import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Scissors, ShoppingBag, Shield, MapPin, Phone, Lock, Mail, User as UserIcon, Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff, Chrome } from 'lucide-react';
import { User, UserRole, LocationCity, LocationCountry, LocationCurrency, LocationRegion } from '../types';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js';
import { storageService } from '../services/storage';
import { uploadUserImage } from '../services/firebase';
import { getAuthErrorMessage, resetAuthPassword, signInWithEmail, signInWithGoogle, signOutAuth, signUpWithEmail } from '../services/auth';
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
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [selectedStateCode, setSelectedStateCode] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [worldCountries, setWorldCountries] = useState<LocationCountry[]>([]);
  const [worldCurrencies, setWorldCurrencies] = useState<LocationCurrency[]>([]);
  const [states, setStates] = useState<LocationRegion[]>([]);
  const [cityOptions, setCityOptions] = useState<LocationCity[]>([]);
  const [locationDataLoaded, setLocationDataLoaded] = useState(false);
  const [locationDataError, setLocationDataError] = useState<string | null>(null);
  const [countrySearch, setCountrySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationDetectionMessage, setLocationDetectionMessage] = useState<string | null>(null);

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
  const selectedCountry = worldCountries.find(c => c.code === selectedCountryCode) || null;
  const currentStateObj = states.find(s => s.code === selectedStateCode) || null;

  useEffect(() => {
    setStates([]);
    setCityOptions([]);
    setSelectedStateCode('');
    setStateSearch('');
    setCitySearch('');
    setSelectedCurrency(selectedCountry?.currency || '');
    if (!selectedCountry) return;

    let isActive = true;
    void api.getLocationRegions(selectedCountry.code).then((regions: LocationRegion[]) => {
      if (isActive) setStates(regions);
    }).catch((loadError: unknown) => {
      if (!isActive) return;
      console.error('Unable to load regions for the selected country.', loadError);
      setLocationDetectionMessage('Region suggestions are temporarily unavailable. You can still enter your location manually.');
    });
    return () => { isActive = false; };
  }, [selectedCountryCode]);

  const filteredCountries = worldCountries.filter((country) => {
    const term = countrySearch.trim().toLowerCase();
    if (!term) return true;
    return country.name.toLowerCase().includes(term)
      || country.code.toLowerCase().includes(term)
      || country.dialCode.toLowerCase().includes(term);
  }).slice(0, 100);

  useEffect(() => {
    if (!isOpen || !isRegistering || locationDataLoaded) return;
    let isActive = true;
    void Promise.all([api.getLocationCountries(), api.getLocationCurrencies()]).then(([countries, currencies]) => {
      if (!isActive) return;
      setWorldCountries(countries);
      setWorldCurrencies(currencies);
      setLocationDataLoaded(true);
      setLocationDataError(null);
    }).catch((loadError: unknown) => {
      if (!isActive) return;
      console.error('Unable to load country and currency reference data.', loadError);
      setLocationDataError('Country suggestions could not be loaded. Please try again.');
    });
    return () => { isActive = false; };
  }, [isOpen, isRegistering, locationDataLoaded]);

  const filteredStates = states.filter((state) => {
    const term = stateSearch.trim().toLowerCase();
    if (!term) return true;
    return state.name.toLowerCase().includes(term)
      || state.code?.toLowerCase().includes(term);
  }).slice(0, 100);
  const filteredCities = cityOptions.map(city => city.name);

  const clearSelectedLocation = () => {
    setSelectedCountryCode('');
    setCountrySearch('');
    setSelectedStateCode('');
    setStateSearch('');
    setCitySearch('');
  };

  useEffect(() => {
    if (!selectedCountryCode || !selectedStateCode) {
      setCityOptions([]);
      return;
    }
    let isActive = true;
    const timeout = window.setTimeout(() => {
      void api.searchLocationCities(selectedCountryCode, selectedStateCode, citySearch.trim()).then((cities: LocationCity[]) => {
        if (isActive) setCityOptions(cities);
      }).catch((loadError: unknown) => {
        if (!isActive) return;
        console.error('Unable to search cities for the selected region.', loadError);
        setCityOptions([]);
        setLocationDetectionMessage('City suggestions are temporarily unavailable. You can enter your city manually.');
      });
    }, 180);
    return () => {
      isActive = false;
      window.clearTimeout(timeout);
    };
  }, [selectedCountryCode, selectedStateCode, citySearch]);

  useEffect(() => {
    if (currentStateObj) {
      setStateSearch(currentStateObj.name);
      return;
    }

    setStateSearch('');
  }, [currentStateObj]);

  useEffect(() => {
    setRole(defaultRole);
  }, [defaultRole]);

  const handleDetectLocation = () => {
    setLocationDetectionMessage(null);
    if (!navigator.geolocation) {
      setLocationDetectionMessage('Location detection is not available in this browser. Choose your location manually.');
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${position.coords.latitude}&lon=${position.coords.longitude}`,
          { headers: { 'Accept-Language': 'en' } },
        );
        if (!response.ok) {
          setLocationDetectionMessage('We could not look up that location. Choose your location manually.');
          return;
        }

        const payload = await response.json();
        const address = payload?.address;
        const normalize = (value: string) => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const countryCode = String(address?.country_code || '').trim().toUpperCase();
        const countryName = String(address?.country || '').trim();
        const country = worldCountries.find((candidate: LocationCountry) => candidate.code.toUpperCase() === countryCode)
          || worldCountries.find((candidate: LocationCountry) => normalize(candidate.name) === normalize(countryName));
        if (!country) {
          setLocationDetectionMessage('We could not match your country. Choose your location manually.');
          return;
        }

        setSelectedCountryCode(country.code);
        setCountrySearch(country.name);
        const stateName = String(address?.state || address?.province || address?.region || '').trim();
        const countryRegions = await api.getLocationRegions(country.code);
        setStates(countryRegions);
        const state = countryRegions.find((candidate: LocationRegion) => normalize(candidate.name) === normalize(stateName));
        if (!state) {
          setSelectedStateCode('');
          setStateSearch('');
          setCitySearch('');
          setLocationDetectionMessage('Country found. Choose your state or region and city from the suggestions to confirm your location.');
          return;
        }

        setSelectedStateCode(state.code || '');
        setStateSearch(state.name);
        const cityName = String(address?.city || address?.town || address?.village || address?.municipality || '').trim();
        const matchingCities = cityName
          ? await api.searchLocationCities(country.code, state.code, cityName)
          : [];
        const city = matchingCities.find((candidate: LocationCity) => normalize(candidate.name) === normalize(cityName));
        setCityOptions(matchingCities);
        setCitySearch(city?.name || '');
        setLocationDetectionMessage(city
          ? 'Location found. Please check the selected country, state, and city before continuing.'
          : 'Country and state found. Choose your city from the suggestions to confirm your location.');
      } catch {
        setLocationDetectionMessage('We could not look up that location. Choose your location manually.');
      } finally {
        setIsDetectingLocation(false);
      }
    }, (geolocationError) => {
      setIsDetectingLocation(false);
      setLocationDetectionMessage(geolocationError.code === geolocationError.PERMISSION_DENIED
        ? 'Location permission was not granted. Choose your location manually.'
        : 'We could not detect your location. Choose your location manually.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);
    let accountCreated = false;
    let signupSessionActive = false;
    let signupProfileSaved = false;

    try {
    if (!isRegistering) {
      const authUser = await signInWithEmail(email.trim(), password);
      const cachedProfile = storageService.getUsers().find(user => user.id === authUser.id);
      const user = storageService.upsertUser({
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.isAdmin ? 'admin' : cachedProfile?.role === 'admin' ? authUser.role : cachedProfile?.role || authUser.role,
        phone: cachedProfile?.phone || '',
        countryCode: cachedProfile?.countryCode || '',
        location: cachedProfile?.location || { country: '', state: '', city: '' },
        whatsappNumber: cachedProfile?.whatsappNumber,
        shopName: cachedProfile?.shopName,
        bio: cachedProfile?.bio || '',
        handle: cachedProfile?.handle || `@${authUser.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        avatarUrl: authUser.avatarUrl || cachedProfile?.avatarUrl,
        isPromoted: cachedProfile?.isPromoted || false,
        isBlocked: cachedProfile?.isBlocked || false,
        followers: cachedProfile?.followers || [],
        createdAt: authUser.createdAt,
        isSuperAdmin: authUser.isSuperAdmin,
      });
      setSuccessMsg(`Welcome back, ${user.name}! Your FABSATTIRE studio is ready for your next bespoke discovery.`);
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
    if (password.length < 8) {
      setError(`Password is too short. Add ${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} (8 minimum).`);
      return;
    }
    const selectedCountryInput = countrySearch.trim().toLowerCase();
    const normalizedCityName = citySearch.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const selectedCity = cityOptions.find(city => (
      city.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === normalizedCityName
    )) || null;
    if (locationDataError || !locationDataLoaded) {
      setError(locationDataError || 'Country, state, and city suggestions are still loading. Please try again shortly.');
      return;
    }
    if (!selectedCountry
      || (selectedCountryInput !== selectedCountry.name.toLowerCase() && selectedCountryInput !== selectedCountry.code.toLowerCase())) {
      setError('Choose your country from the suggestions so we can validate your phone number.');
      return;
    }
    if (stateSearch.trim() && (!currentStateObj || currentStateObj.name !== stateSearch.trim())) {
      setError('Choose a state or region from the suggestions.');
      return;
    }
    if (citySearch.trim() && !currentStateObj) {
      setError('Choose a state or region before entering a city.');
      return;
    }
    if (!selectedCurrency) {
      setError('Choose a currency for your account.');
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

    const location = {
      country: selectedCountry.name,
      countryCode: selectedCountry.code,
      currency: selectedCurrency,
      state: currentStateObj?.code === 'ALL' ? '' : currentStateObj?.name || '',
      city: selectedCity?.name || citySearch.trim(),
      ...(selectedCity?.latitude !== undefined ? { lat: selectedCity.latitude } : {}),
      ...(selectedCity?.longitude !== undefined ? { lng: selectedCity.longitude } : {}),
    };
    const signupProfile = {
      role,
      phone: parsedPhone.formatInternational(),
      countryCode: selectedCountry.dialCode,
      location,
      whatsappNumber: parsedWhatsapp.formatInternational(),
      shopName: shopName.trim() || undefined,
      bio: bio.trim() || undefined,
      handle: userHandle,
    };
    const signupResult = await signUpWithEmail(email.trim().toLowerCase(), password, name.trim(), signupProfile);
    const authUser = signupResult.user;
    accountCreated = true;

    if (!signupResult.hasSession) {
      setSuccessMsg('Your account was created. Sign in with your email and password to continue.');
      setPassword('');
      setConfirmPassword('');
      setIsRegistering(false);
      return;
    }
    signupSessionActive = true;

    let avatarUploadFailed = false;
    let storedAvatarUrl = authUser.avatarUrl;
    if (avatarFile) {
      try {
        storedAvatarUrl = await uploadUserImage(avatarFile, authUser.id, 'profiles', `avatar-${Date.now()}.${fileExtension(avatarFile)}`);
      } catch {
        avatarUploadFailed = true;
      }
    }
    const newUser = storageService.upsertUser({
      id: authUser.id,
      email: authUser.email,
      name: name.trim(),
      role: authUser.isAdmin ? 'admin' : role,
      phone: parsedPhone.formatInternational(),
      countryCode: selectedCountry.dialCode,
      location,
      whatsappNumber: parsedWhatsapp.formatInternational(),
      shopName: shopName.trim() || undefined,
      handle: userHandle,
      bio: bio.trim() || undefined,
      avatarUrl: storedAvatarUrl || avatarUrl || undefined,
      isPromoted: false,
      isBlocked: false,
      followers: [],
      createdAt: authUser.createdAt,
      isSuperAdmin: authUser.isSuperAdmin,
    });
    await api.saveProfile(newUser);
    signupProfileSaved = true;

    await signOutAuth();
    signupSessionActive = false;
    setPassword('');
    setConfirmPassword('');
    setIsRegistering(false);
    setSuccessMsg(avatarUploadFailed
      ? 'Your account was created. Sign in to continue; you can add your profile photo later.'
      : 'Your account was created. Sign in with your email and password to continue.');
    } catch (authError) {
      if (accountCreated) {
        if (signupSessionActive) {
          try {
            await signOutAuth();
            signupSessionActive = false;
          } catch (signOutError) {
            console.error('Unable to end the new account session after profile setup failed.', signOutError);
          }
        }
        setPassword('');
        setConfirmPassword('');
        setIsRegistering(false);
        setError(signupProfileSaved
          ? 'Your account and profile were created, but sign-out could not finish. Refresh this page before signing in.'
          : 'Your account was created, but profile setup could not finish. Sign in to continue; do not create another account.');
      } else {
        setError(getAuthErrorMessage(authError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
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
      await resetAuthPassword(email.trim());
      setSuccessMsg('Password reset email sent. Check your inbox and spam folder.');
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setIsResettingPassword(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className={`mobile-panel relative my-2 w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl border shadow-2xl p-4 sm:p-6 md:p-8 transition-colors sm:rounded-3xl ${
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
        <div className="mb-5 text-center sm:mb-6">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            {role === 'tailor' && <Scissors className="h-6 w-6" />}
            {role === 'fabric_seller' && <Sparkles className="h-6 w-6" />}
            {role === 'buyer' && <ShoppingBag className="h-6 w-6" />}
            {role === 'admin' && <Shield className="h-6 w-6" />}
          </div>
          <h2 className="text-2xl font-serif font-bold tracking-tight sm:text-3xl">
            {isRegistering ? 'Join the FABSATTIRE Network' : 'Welcome Back to FABSATTIRE'}
          </h2>
          <p className={`mt-1 text-xs sm:text-sm ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            {isRegistering
              ? 'Choose your membership type to customize your tailored dashboard.'
              : 'Sign in to access your bespoke orders, inventory, or administration.'}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="mb-5 flex rounded-xl border border-neutral-700/40 bg-neutral-800/40 p-1 text-xs font-medium sm:mb-6">
          <button
            type="button"
            onClick={() => { setIsRegistering(true); setError(null); }}
            className={`flex-1 rounded-lg py-2.5 transition-all ${
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
            className={`flex-1 rounded-lg py-2.5 transition-all ${
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
              role="alert"
              aria-live="assertive"
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

        <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4">
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
                  className={`min-h-[3.4rem] p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'tailor'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <Scissors className="w-4 h-4" />
                  <span className="text-xs font-semibold sm:text-[11px]">Master Tailor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('fabric_seller')}
                  className={`min-h-[3.4rem] p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'fabric_seller'
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-semibold sm:text-[11px]">Fabric Merchant</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={`min-h-[3.4rem] p-3 rounded-xl border text-left flex flex-col items-center text-center gap-1 transition-all ${
                    role === 'buyer'
                      ? 'border-purple-500 bg-purple-500/15 text-purple-300'
                      : 'border-neutral-700/60 hover:border-neutral-600 text-neutral-400'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span className="text-xs font-semibold sm:text-[11px]">Client / Buyer</span>
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
                  <span className="flex-1">Geographic Location & Origin</span>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetectingLocation || !locationDataLoaded}
                    className="rounded-lg border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300 transition-colors hover:bg-amber-500/10 disabled:cursor-wait disabled:opacity-50"
                  >
                    {isDetectingLocation ? 'Finding location…' : 'Use my location'}
                  </button>
                </div>
                {locationDetectionMessage && <p role="status" className="text-[10px] text-neutral-400">{locationDetectionMessage}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <SearchableLocationField
                    label="Country"
                    value={countrySearch}
                    onChange={(nextValue) => {
                      setCountrySearch(nextValue);
                      const match = worldCountries.find((country) => country.name.toLowerCase() === nextValue.trim().toLowerCase() || country.code.toLowerCase() === nextValue.trim().toLowerCase());
                      if (match) {
                        if (match.code !== selectedCountryCode) {
                          setSelectedStateCode('');
                          setStateSearch('');
                          setCitySearch('');
                        }
                        setSelectedCountryCode(match.code);
                      } else if (nextValue.trim().toLowerCase() !== selectedCountry?.name.toLowerCase()) {
                        setSelectedCountryCode('');
                        setSelectedStateCode('');
                        setStateSearch('');
                        setCitySearch('');
                      }
                    }}
                    onClear={() => {
                      clearSelectedLocation();
                    }}
                    options={filteredCountries.map((country) => country.name)}
                    placeholder="Search country"
                    listId="country-search-list"
                  />

                  <SearchableLocationField
                    label="State / Province (optional)"
                    value={stateSearch}
                    onChange={(nextValue) => {
                      setStateSearch(nextValue);
                      const match = states.find((state) => state.name.toLowerCase() === nextValue.trim().toLowerCase() || state.code?.toLowerCase() === nextValue.trim().toLowerCase());
                      if (match) {
                        setSelectedStateCode(match.code || '');
                      } else {
                        setSelectedStateCode('');
                      }
                      setCitySearch('');
                    }}
                    onClear={() => {
                      setStateSearch('');
                      setSelectedStateCode('');
                      setCitySearch('');
                    }}
                    options={filteredStates.map((state) => state.name)}
                    placeholder="Search state"
                    listId="state-search-list"
                  />

                  <SearchableLocationField
                    label="City / District (optional)"
                    value={citySearch}
                    onChange={(nextValue) => {
                      setCitySearch(nextValue);
                    }}
                    onClear={() => {
                      setCitySearch('');
                    }}
                    options={filteredCities}
                    placeholder="Search city"
                    listId="city-search-list"
                  />
                </div>
                <p className="text-[10px] leading-relaxed text-neutral-500">
                  Country, region, and city suggestions come from the location catalog. If your city is not listed, enter its name manually; manually entered cities are saved without map coordinates.
                </p>
                <div className="mt-2">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Listing currency
                  </label>
                  <select
                    value={selectedCurrency}
                    onChange={(event) => setSelectedCurrency(event.target.value)}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-3 py-2 text-xs text-neutral-100 focus:border-amber-500 focus:outline-none"
                    required
                  >
                    {!selectedCurrency && <option value="">Choose currency</option>}
                    {worldCurrencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} — {currency.name}{currency.code === selectedCountry?.currency ? ' (country default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[10px] text-neutral-500">
                  Country default: <span className="text-amber-400 font-medium">{selectedCountry?.currency || 'Choose a country'}</span>
                </p>
              </div>

              {/* Phone & WhatsApp with Dial Code Tracker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Mobile Number * ({selectedCountry?.flag || '🌐'} {selectedCountry?.dialCode || 'select country'})
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
                    placeholder={`${selectedCountry?.dialCode || ''}8012345678`}
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
            {isRegistering && <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">Use at least 8 characters. Longer passwords are welcome.</p>}
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
            className="w-full min-h-[3.25rem] rounded-xl font-medium text-sm uppercase tracking-wider text-neutral-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all duration-200 mt-2 cursor-pointer font-sans disabled:opacity-70 disabled:cursor-not-allowed"
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
