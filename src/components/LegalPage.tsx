import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, LockKeyhole, Mail, MessageSquare, Send, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

interface LegalPageProps {
  page: 'about' | 'privacy' | 'terms' | 'contact';
  isDarkMode: boolean;
  onBack: () => void;
}

const content = {
  about: {
    label: 'About FABSATTIRE',
    title: 'Craft, connected with intention.',
    icon: Sparkles,
    paragraphs: [
      'FABSATTIRE is a focused marketplace for independent tailors, fabric merchants, and clients who care about the details behind what they wear.',
      'We bring discovery, direct conversations, location-aware browsing, and thoughtful presentation into one place so good work can travel further.',
    ],
  },
  privacy: {
    label: 'Privacy policy',
    title: 'Your account and choices stay yours.',
    icon: LockKeyhole,
    paragraphs: [
      'We use account details to authenticate you, provide marketplace features, process requests, and keep the service secure. We do not sell personal information.',
      'You can request profile corrections or account removal by contacting the FABSATTIRE administrator. Public seller details are shown only as needed for marketplace discovery.',
    ],
  },
  terms: {
    label: 'Terms of service',
    title: 'A clear standard for a careful marketplace.',
    icon: FileText,
    paragraphs: [
      'Use FABSATTIRE with accurate information and respect for other members. Sellers are responsible for the accuracy of their listings, prices, availability, and delivery commitments.',
      'FABSATTIRE may remove harmful, fraudulent, or misleading content and may restrict seller accounts that repeatedly violate these standards.',
    ],
  },
  contact: {
    label: 'Contact us',
    title: 'Let us know how we can help.',
    icon: MessageSquare,
    paragraphs: [
      'Reach the FABSATTIRE team for account help, seller questions, partnership requests, or any marketplace support you need.',
      'Response times are fastest by email or WhatsApp, and our team can help with profile issues, listing questions, and platform updates.',
    ],
  },
};

export const LegalPage: React.FC<LegalPageProps> = ({ page, isDarkMode, onBack }) => {
  const item = content[page];
  const Icon = item.icon;
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '', website: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const whatsappText = [
    'Hello FABSATTIRE,',
    contactForm.name.trim() ? `My name is ${contactForm.name.trim()}.` : '',
    contactForm.email.trim() ? `My email is ${contactForm.email.trim()}.` : '',
    contactForm.subject.trim() ? `Topic: ${contactForm.subject.trim()}.` : '',
    contactForm.message.trim(),
  ].filter(Boolean).join('\n\n');

  const submitContactForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSending(true);
    setContactStatus(null);
    try {
      await api.submitContactMessage(contactForm);
      setContactForm({ name: '', email: '', subject: '', message: '', website: '' });
      setContactStatus({ type: 'success', message: 'Your message has been sent. We’ll get back to you as soon as possible.' });
    } catch (error) {
      setContactStatus({
        type: 'error',
        message: safeCustomerErrorMessage(error, 'We could not send your message. Please try WhatsApp or try again shortly.'),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className={`mx-auto w-full px-4 py-8 sm:px-6 sm:py-14 ${page === 'contact' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 transition hover:text-amber-300">
        <ArrowLeft className="h-4 w-4" /> Back to FABSATTIRE
      </button>
      <section className={`rounded-3xl border p-6 sm:p-10 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
        <div className="mb-6 flex items-center gap-3 text-amber-500"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10"><Icon className="h-5 w-5" /></span><span className="text-[10px] font-bold uppercase tracking-[0.22em]">{item.label}</span></div>
        <h1 className="font-serif text-4xl font-bold leading-tight">{item.title}</h1>
        <div className={`mt-6 space-y-4 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
          {item.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        </div>

        {page === 'contact' && (
          <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
            <form onSubmit={submitContactForm} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Your name
                  <input required minLength={2} maxLength={100} autoComplete="name" value={contactForm.name} onChange={event => setContactForm(form => ({ ...form, name: event.target.value }))} placeholder="How should we address you?" className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500' : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400'}`} />
                </label>
                <label className="block text-sm font-semibold">
                  Email address
                  <input required type="email" maxLength={254} autoComplete="email" value={contactForm.email} onChange={event => setContactForm(form => ({ ...form, email: event.target.value }))} placeholder="you@example.com" className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500' : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400'}`} />
                </label>
              </div>
              <label className="block text-sm font-semibold">
                What can we help with?
                <select required value={contactForm.subject} onChange={event => setContactForm(form => ({ ...form, subject: event.target.value }))} className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'}`}>
                  <option value="" disabled>Select a topic</option>
                  <option>Account support</option>
                  <option>Seller or listing question</option>
                  <option>Partnership opportunity</option>
                  <option>Payments and plans</option>
                  <option>Something else</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Your message
                <textarea required minLength={10} maxLength={4000} rows={6} value={contactForm.message} onChange={event => setContactForm(form => ({ ...form, message: event.target.value }))} placeholder="Tell us a little more so we can point you in the right direction..." className={`mt-2 w-full resize-y rounded-xl border px-4 py-3 text-sm leading-6 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500' : 'border-neutral-200 bg-neutral-50 text-neutral-900 placeholder:text-neutral-400'}`} />
              </label>
              <label aria-hidden="true" tabIndex={-1} className="absolute -left-[10000px] h-px w-px overflow-hidden">
                Leave this field empty
                <input tabIndex={-1} autoComplete="off" value={contactForm.website} onChange={event => setContactForm(form => ({ ...form, website: event.target.value }))} />
              </label>
              {contactStatus && (
                <p role={contactStatus.type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${contactStatus.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>
                  {contactStatus.type === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                  {contactStatus.message}
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="submit" disabled={isSending} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-neutral-950 shadow-lg shadow-amber-500/15 transition hover:-translate-y-0.5 hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60">
                  <Send className="h-4 w-4" />{isSending ? 'Sending message…' : 'Send message'}
                </button>
                <p className={`text-xs ${isDarkMode ? 'text-neutral-500' : 'text-neutral-500'}`}>Your message goes directly to our support team.</p>
              </div>
            </form>

            <aside className={`h-fit rounded-2xl border p-5 sm:p-6 ${isDarkMode ? 'border-neutral-800 bg-neutral-900/70' : 'border-neutral-200 bg-neutral-50'}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500"><MessageSquare className="h-5 w-5" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">Prefer a quick chat?</h2>
              <p className={`mt-2 text-sm leading-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Continue on WhatsApp. Your name, email, topic, and message will be ready to send.</p>
              <a
                href={`https://wa.me/2348029772375?text=${encodeURIComponent(whatsappText || 'Hello FABSATTIRE, I need help with the marketplace.')}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Continue this message on WhatsApp"
                className="whatsapp-contact-pulse mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-[#062b16] shadow-lg shadow-emerald-500/20 transition hover:bg-[#31e875] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
              >
                <MessageSquare className="h-5 w-5" />Chat on WhatsApp
              </a>
              <p className={`mt-3 text-center text-xs ${isDarkMode ? 'text-neutral-500' : 'text-neutral-500'}`}>WhatsApp: +234 802 977 2375</p>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
};
