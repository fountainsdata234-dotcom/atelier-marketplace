import React from 'react';
import { ArrowLeft, FileText, LockKeyhole, Mail, MessageSquare, Sparkles } from 'lucide-react';

interface LegalPageProps {
  page: 'about' | 'privacy' | 'terms' | 'contact';
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
  contact: {
    label: 'Contact us',
    title: 'Let us know how we can help.',
    icon: MessageSquare,
    paragraphs: [
      'Reach the Fabrilux team for account help, seller questions, partnership requests, or any marketplace support you need.',
      'Response times are fastest by email or WhatsApp, and our team can help with profile issues, listing questions, and platform updates.',
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

        {page === 'contact' && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <a
              href="mailto:fabrilux234@gmail.com?subject=Fabrilux%20Support&body=Hello%20Fabrilux%2C%0A%0AI%20need%20help%20with%20the%20marketplace.%0A"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
            >
              <Mail className="h-4 w-4" />
              Email us
            </a>
            <a
              href="https://wa.me/2348029772375?text=Hello%20Fabrilux%2C%20I%20need%20help%20with%20the%20marketplace."
              target="_blank"
              rel="noreferrer"
              aria-label="Message Fabrilux on WhatsApp"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp us
            </a>
          </div>
        )}

        <p className="mt-8 border-t border-neutral-800/60 pt-4 text-[11px] text-neutral-500">Last updated September 2026. These pages are provided in plain language so you can make an informed choice before joining.</p>
      </section>
    </main>
  );
};
