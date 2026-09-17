import React from 'react';
import { ArrowLeft, FileText, LockKeyhole, Sparkles } from 'lucide-react';

interface LegalPageProps {
  page: 'about' | 'privacy' | 'terms';
  isDarkMode: boolean;
  onBack: () => void;
}

const content = {
  about: {
    label: 'About Fabrilux',
    title: 'Craft, connected with intention.',
    icon: Sparkles,
    paragraphs: [
      'Fabrilux Atelier is a focused marketplace for independent tailors, fabric merchants, and clients who care about the details behind what they wear.',
      'We bring discovery, direct conversations, location-aware browsing, and thoughtful presentation into one place so good work can travel further.',
    ],
  },
  privacy: {
    label: 'Privacy policy',
    title: 'Your account and choices stay yours.',
    icon: LockKeyhole,
    paragraphs: [
      'We use account details to authenticate you, provide marketplace features, process requests, and keep the service secure. We do not sell personal information.',
      'You can request profile corrections or account removal by contacting the Fabrilux administrator. Public seller details are shown only as needed for marketplace discovery.',
    ],
  },
  terms: {
    label: 'Terms of service',
    title: 'A clear standard for a careful marketplace.',
    icon: FileText,
    paragraphs: [
      'Use Fabrilux with accurate information and respect for other members. Sellers are responsible for the accuracy of their listings, prices, availability, and delivery commitments.',
      'Fabrilux may remove harmful, fraudulent, or misleading content and may restrict seller accounts that repeatedly violate these standards.',
    ],
  },
};

export const LegalPage: React.FC<LegalPageProps> = ({ page, isDarkMode, onBack }) => {
  const item = content[page];
  const Icon = item.icon;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 transition hover:text-amber-300">
        <ArrowLeft className="h-4 w-4" /> Back to Fabrilux
      </button>
      <section className={`rounded-3xl border p-6 sm:p-10 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div className="mb-6 flex items-center gap-3 text-amber-500"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10"><Icon className="h-5 w-5" /></span><span className="text-[10px] font-bold uppercase tracking-[0.22em]">{item.label}</span></div>
        <h1 className="font-serif text-4xl font-bold leading-tight">{item.title}</h1>
        <div className={`mt-6 space-y-4 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
          {item.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <p className="mt-8 border-t border-neutral-800/60 pt-4 text-[11px] text-neutral-500">Last updated September 2026. These pages are provided in plain language so you can make an informed choice before joining.</p>
      </section>
    </main>
  );
};
