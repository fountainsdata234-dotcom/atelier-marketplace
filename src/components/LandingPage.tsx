import React from 'react';
import { UserRole } from '../types';
import { useTypingText } from '../hooks/useTypingText';

interface LandingPageProps {
  onOpenAuth: (defaultRole: UserRole) => void;
  isDarkMode: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, isDarkMode }) => {
  const headline = 'Find your fit. Meet your maker.';
  const typedHeadline = useTypingText([headline], { enabled: true, typeDelayMs: 84 });

  return (
    <section className="relative isolate flex min-h-[68vh] items-center overflow-hidden px-5 py-16 sm:min-h-[72vh] sm:px-8 sm:py-20 lg:px-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-1/2 -z-10 h-80 w-80 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl sm:h-[30rem] sm:w-[30rem]" />
      <div className={`grid w-full items-center gap-10 rounded-[2rem] border px-6 py-12 shadow-2xl sm:px-10 sm:py-16 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16 lg:px-16 ${isDarkMode ? 'border-white/10 bg-white/[0.03] shadow-black/20' : 'border-neutral-200 bg-white/75 shadow-neutral-900/5'}`}>
        <div className="max-w-4xl">
          <p className={`mb-5 text-xs font-semibold uppercase tracking-[0.28em] ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
            Fabsattire · Tailoring & textiles
          </p>
          <h1 className={`h-[2em] overflow-hidden text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl md:text-7xl lg:text-8xl ${isDarkMode ? 'text-white' : 'text-neutral-950'}`}>
            <span aria-hidden="true" className="typing-caret">{typedHeadline}</span>
            <span className="sr-only">{headline}</span>
          </h1>
          <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
            Discover skilled tailors and distinctive fabrics, all in one place.
          </p>
        </div>
        <div className="flex items-center lg:justify-end">
          <button
            type="button"
            onClick={() => onOpenAuth('buyer')}
            className={`group inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-amber-400 px-7 py-4 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-500/20 transition hover:-translate-y-0.5 hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 sm:w-auto lg:w-full ${isDarkMode ? 'focus-visible:ring-offset-neutral-950' : 'focus-visible:ring-offset-white'}`}
          >
            Get started
            <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      </div>
    </section>
  );
};
