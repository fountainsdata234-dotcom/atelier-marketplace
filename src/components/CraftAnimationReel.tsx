import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Sparkles } from 'lucide-react';

const animations = [
  { title: 'Garment in motion', url: 'https://res.cloudinary.com/auwy7fil/video/upload/v1789648069/garment-animation-gif-download-9143709.mp4' },
  { title: 'Knitting in progress', url: 'https://res.cloudinary.com/auwy7fil/video/upload/v1789648068/knitting-machine-animation-gif-download-9143715.mp4' },
  { title: 'The sewing room', url: 'https://res.cloudinary.com/auwy7fil/video/upload/v1789648068/sewing-machine-animation-gif-download-9143711.mp4' },
];

export const CraftAnimationReel: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(() => Math.floor(Math.random() * animations.length));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex(current => {
        const choices = animations.map((_, index) => index).filter(index => index !== current);
        return choices[Math.floor(Math.random() * choices.length)];
      });
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="mx-auto mt-5 w-full max-w-6xl px-3 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600"><Sparkles className="h-3.5 w-3.5" /> In the workroom</div>
        <div className="flex gap-1.5">{animations.map((animation, index) => <button key={animation.url} type="button" aria-label={`Show ${animation.title}`} onClick={() => setActiveIndex(index)} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-7 bg-amber-500' : 'w-1.5 bg-amber-500/30'}`} />)}</div>
      </div>
      <motion.div key={animations[activeIndex].url} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-neutral-950 shadow-lg">
        <video className="block aspect-[16/5] w-full object-cover sm:aspect-[16/4]" src={animations[activeIndex].url} autoPlay loop muted playsInline preload="metadata" aria-label={animations[activeIndex].title} />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 to-transparent px-4 pb-3 pt-8 text-white">
          <span className="text-xs font-semibold">{animations[activeIndex].title}</span>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-200"><Play className="h-3 w-3 fill-current" /> Looping craft study</span>
        </div>
      </motion.div>
    </section>
  );
};
