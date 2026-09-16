import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';

interface IntroLoaderProps {
  onComplete: () => void;
  isDarkMode: boolean;
}

export const IntroLoader: React.FC<IntroLoaderProps> = ({ onComplete, isDarkMode }) => {
  const [stage, setStage] = useState<number>(0);
  const [progress, setProgress] = useState<number>(10);

  useEffect(() => {
    const timer1 = setTimeout(() => {
      setStage(1);
      setProgress(45);
    }, 600);

    const timer2 = setTimeout(() => {
      setStage(2);
      setProgress(85);
    }, 1300);

    const timer3 = setTimeout(() => {
      setProgress(100);
      setStage(3);
    }, 2000);

    const finishTimer = setTimeout(() => {
      onComplete();
    }, 2600);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(finishTimer);
    };
  }, [onComplete]);

  const stagesText = [
    'Unrolling Raw Silk & Cashmere...',
    'Threading Golden Bespoke Needles...',
    'Connecting World Artisans & Ateliers...',
    'Welcome to Haute Couture Marketplace'
  ];

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden ${
        isDarkMode ? 'bg-[#0a0b0d] text-neutral-100' : 'bg-[#faf8f4] text-neutral-900'
      }`}
    >
      {/* Background radial luxury glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,119,6,0.12)_0%,transparent_70%)] pointer-events-none" />

      {/* Haute Couture tape measure top & bottom motif */}
      <div className="absolute top-0 left-0 right-0 h-4 flex items-center justify-between px-2 opacity-30 select-none overflow-hidden font-mono text-[9px] border-b border-amber-600/30">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-2 w-px bg-amber-500" />
            <span>{i * 5}cm</span>
          </span>
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-md px-6 text-center">
        {/* Animated Emblem: Needle & Scissor Weave */}
        <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
          {/* Outer rotating stitch ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-dashed border-amber-500/30"
          />

          {/* Pulsing inner glow */}
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.45, 0.2] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute inset-2 rounded-full bg-amber-500/20 blur-xl"
          />

          {/* Central branded logo */}
          <motion.div
            initial={{ scale: 0.6, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 via-neutral-900/80 to-amber-700/20 border border-amber-500/40 backdrop-blur-md flex items-center justify-center shadow-2xl shadow-amber-900/20"
          >
            <img src="/favicon.svg" alt="Fabrilux Atelier" className="h-12 w-12 rounded-xl object-cover" />
          </motion.div>

          {/* Orbiting Sparkle */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0"
          >
            <Sparkles className="w-4 h-4 text-amber-300 absolute -top-1 left-1/2 -translate-x-1/2" />
          </motion.div>
        </div>

        {/* Brand Title */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
        >
          <span className="text-xs uppercase tracking-[0.35em] text-amber-500/90 font-medium">
            Bespoke Tailoring & Fabric Marketplace
          </span>
          <h1 className="text-4xl sm:text-5xl font-serif font-bold tracking-tight mt-1 mb-3 text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100">
            ATELIER
          </h1>
          <p className="text-sm font-light text-neutral-400 max-w-sm mb-6">
            Where master tailors, exquisite fabric sellers, and discerning clients meet.
          </p>
        </motion.div>

        {/* Progress Bar & Stage Indicator */}
        <div className="w-64 space-y-2.5">
          <div className="h-1.5 w-full bg-neutral-800/60 rounded-full overflow-hidden border border-amber-500/20">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600 rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ ease: 'easeOut', duration: 0.4 }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <AnimatePresence mode="wait">
              <motion.span
                key={stage}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.25 }}
                className="text-amber-400/90"
              >
                {stagesText[stage]}
              </motion.span>
            </AnimatePresence>
            <span>{progress}%</span>
          </div>
        </div>

        {/* Skip button */}
        <button
          onClick={onComplete}
          className="mt-8 text-xs text-neutral-400 hover:text-amber-300 underline underline-offset-4 tracking-wider transition-colors"
        >
          Enter Marketplace Immediately →
        </button>
      </div>

      {/* Tape measure bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-between px-2 opacity-30 select-none overflow-hidden font-mono text-[9px] border-t border-amber-600/30">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="flex flex-col items-center">
            <span className="h-2 w-px bg-amber-500" />
            <span>{i * 5}cm</span>
          </span>
        ))}
      </div>
    </motion.div>
  );
};
