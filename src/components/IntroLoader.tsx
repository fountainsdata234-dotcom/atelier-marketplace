import React, { useEffect } from 'react';
import { motion } from 'motion/react';

interface IntroLoaderProps {
  onComplete: () => void;
  isDarkMode: boolean;
}

const brand = 'FABSATTIRE'.split('');
const letterStart = [
  { x: -72, y: 58, rotate: -18 },
  { x: 54, y: 72, rotate: 14 },
  { x: -42, y: 42, rotate: -12 },
  { x: 76, y: 55, rotate: 20 },
  { x: -64, y: 76, rotate: -16 },
  { x: 48, y: 48, rotate: 12 },
  { x: -50, y: 64, rotate: -20 },
  { x: 68, y: 40, rotate: 16 },
  { x: -34, y: 70, rotate: -14 },
  { x: 42, y: 56, rotate: 18 },
];

export const IntroLoader: React.FC<IntroLoaderProps> = ({ onComplete, isDarkMode }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      sessionStorage.setItem('fabsattire_intro_seen', '1');
      onComplete();
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${isDarkMode ? 'bg-[#0c0d10] text-white' : 'bg-[#fbf9f5] text-neutral-900'}`}
      role="status"
      aria-label="Opening Fabsattire"
    >
      <div className="pointer-events-none absolute h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="relative flex flex-col items-center px-6 text-center">
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="absolute -top-5 h-px w-44 origin-center bg-gradient-to-r from-transparent via-amber-400/80 to-transparent"
        />
        <div className="flex h-20 items-end justify-center gap-0.5 sm:h-24">
          {brand.map((letter, index) => {
            const start = letterStart[index];
            return (
              <motion.span
                key={`${letter}-${index}`}
                initial={{ opacity: 0, x: start.x, y: start.y, rotate: start.rotate, scale: 0.72 }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: [0.72, 1.12, 0.96, 1] }}
                transition={{ delay: index * 0.055, duration: 0.62, ease: [0.22, 1, 0.36, 1], type: 'spring', bounce: 0.48 }}
                className="inline-block font-serif text-[clamp(1.7rem,9vw,4rem)] font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-t from-amber-600 via-amber-300 to-amber-100"
              >
                {letter}
              </motion.span>
            );
          })}
        </div>
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 112, opacity: 1 }}
          transition={{ delay: 0.72, duration: 0.35 }}
          className="mt-1 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent"
        />
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.58, duration: 0.3 }}
          className="mt-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-500"
        >
          Tailor · Fabric · Marketplace
        </motion.span>
        <div className="mt-7 h-1 w-40 overflow-hidden rounded-full bg-amber-500/15">
          <motion.div
            className="h-full rounded-full bg-amber-400"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 0.95, ease: 'easeInOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
};
