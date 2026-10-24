import React from 'react';
import { UserRole } from '../types';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  isDarkMode: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, isDarkMode }) => (
  <section className="relative flex min-h-[68vh] items-center justify-center overflow-hidden px-5 py-20 text-center sm:min-h-[72vh]">
    <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl sm:h-96 sm:w-96" />
    <div className="relative mx-auto max-w-2xl">
      <p className={`text-lg leading-relaxed sm:text-2xl sm:leading-relaxed ${isDarkMode ? 'text-neutral-200' : 'text-neutral-700'}`}>
        Fabsattire brings you closer to skilled tailors and distinctive fabrics, all in one place.
      </p>
      <button
        type="button"
        onClick={() => onOpenAuth('buyer')}
        className={`mt-8 inline-flex items-center justify-center rounded-full bg-amber-400 px-8 py-3.5 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 ${isDarkMode ? 'focus-visible:ring-offset-neutral-950' : 'focus-visible:ring-offset-white'}`}
      >
        Get started
      </button>
    </div>
  </section>
);
