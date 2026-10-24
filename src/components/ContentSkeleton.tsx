import React from 'react';

interface ContentSkeletonProps {
  isDarkMode: boolean;
}

export const ContentSkeleton: React.FC<ContentSkeletonProps> = ({ isDarkMode }) => (
  <div className={`content-loading min-h-[calc(100vh-4rem)] w-full px-4 py-6 sm:px-6 lg:px-8 ${isDarkMode ? 'text-neutral-300' : 'text-slate-700'}`} aria-busy="true" aria-label="Loading Fabsattire">
    <div className={`mb-6 flex min-h-32 items-center gap-4 rounded-3xl border p-5 sm:p-7 ${isDarkMode ? 'border-amber-500/20 bg-[#121316]/90' : 'border-amber-500/20 bg-white/90'}`}>
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-spin rounded-2xl border-2 border-amber-400/15 border-t-amber-400" />
        <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400">Fabsattire</p>
        <p className={`mt-1 text-sm ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`} role="status">Preparing your marketplace…</p>
        <div className="loading-wave mt-4 h-1.5 w-full max-w-sm rounded-full" />
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className={`loading-wave rounded-3xl border p-3 sm:p-4 ${isDarkMode ? 'border-white/10' : 'border-neutral-200'}`}>
          <div className="h-56 rounded-2xl bg-white/[0.08] sm:h-64" />
          <div className="mt-5 h-3 w-2/3 rounded-full bg-white/10" />
          <div className="mt-3 h-3 w-5/6 rounded-full bg-white/10" />
          <div className="mt-5 h-10 rounded-xl bg-white/[0.08]" />
        </div>
      ))}
    </div>
  </div>
);
