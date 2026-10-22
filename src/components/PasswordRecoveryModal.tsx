import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { getAuthErrorMessage, updateAuthPassword } from '../services/auth';

interface PasswordRecoveryModalProps {
  isDarkMode: boolean;
  onComplete: () => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({ isDarkMode, onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAuthPassword(password);
      setSuccess(true);
      window.setTimeout(onComplete, 1200);
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl sm:p-8 ${
        isDarkMode ? 'border-neutral-800 bg-[#121316] text-neutral-100' : 'border-neutral-200 bg-white text-neutral-900'
      }`}>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-serif font-bold">Choose a new password</h2>
          <p className="mt-2 text-sm text-neutral-400">Your password reset link is verified. Set a new password to continue.</p>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Password updated. Returning to FABSATTIRE...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium">
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-3 py-3 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-800/40 px-3 py-3 text-sm focus:border-amber-500 focus:outline-none"
            />
          </label>
          <p className="text-xs text-neutral-500">Use at least 8 characters.</p>
          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 px-4 py-3 text-sm font-semibold uppercase tracking-wider text-neutral-950 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
};
