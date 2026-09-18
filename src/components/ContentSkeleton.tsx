import React from 'react';

interface ContentSkeletonProps {
  isDarkMode: boolean;
}

export const ContentSkeleton: React.FC<ContentSkeletonProps> = ({ isDarkMode }) => (
  <div className={`content-loading mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${isDarkMode ? 'text-neutral-300' : 'text-slate-700'}`} aria-busy="true" aria-label="Loading content">
    <div className="loading-wave mb-6 h-28 rounded-3xl border border-white/20 p-5 sm:h-32" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="loading-wave rounded-3xl border border-white/20 p-3">
          <div className="h-48 rounded-2xl bg-white/10" />
          <div className="mt-4 h-3 w-2/3 rounded-full bg-white/10" />
          <div className="mt-2 h-3 w-5/6 rounded-full bg-white/10" />
          <div className="mt-5 h-9 rounded-xl bg-white/10" />
        </div>
      ))}
    </div>
  </div>
);
