import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Compass, FileText, Heart, LockKeyhole, Mail, MessageSquare, Scissors, Send, Sparkles, Target, Users } from 'lucide-react';
import { api } from '../services/api';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

interface LegalPageProps {
  page: 'about' | 'privacy' | 'terms' | 'contact';
  isDarkMode: boolean;
  onBack: () => void;
}

const content = {
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

  if (page === 'about') {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-amber-500 transition hover:text-amber-300">
          <ArrowLeft className="h-4 w-4" /> Back to FABSATTIRE
        </button>

        <section className="relative isolate flex min-h-[420px] overflow-hidden rounded-[2rem] border border-amber-500/20 bg-neutral-950 sm:min-h-[500px]">
          <img src="/assets/landing-fashion.jpg" alt="A carefully crafted fashion look" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#100d0b]/95 via-[#100d0b]/75 to-[#100d0b]/20" />
          <div className="max-w-3xl self-center px-6 py-12 sm:px-12 sm:py-16">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/25 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> About Fabs Attire
            </p>
            <h1 className="max-w-2xl font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Where Creativity Meets Craftsmanship.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/80 sm:text-base">
              Fabs Attire was born from a simple idea: making it easier for people to discover exceptional fashion while connecting talented fashion creators with the people who appreciate their craft.
            </p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/70 sm:text-base">
              We believe fashion is more than what you wear. It is an expression of identity, culture, creativity and individuality.
            </p>
          </div>
          <span className="absolute bottom-4 right-5 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-[10px] text-white/75 backdrop-blur">Style with a story</span>
        </section>

        <section className={`mt-8 grid overflow-hidden rounded-[1.75rem] border md:grid-cols-[0.9fr_1.1fr] ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
          <div className="relative min-h-64 md:min-h-full">
            <img src="/assets/landing-sewing-machine.jpg" alt="A tailor at work on a sewing machine" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">Our story · Made by hand</span>
          </div>
          <div className="p-6 sm:p-9 lg:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Our story</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Bringing good ideas and good hands together.</h2>
            <div className={`mt-5 space-y-4 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
              <p>The idea behind Fabs Attire came from recognizing an opportunity within the fashion industry.</p>
              <p>There are incredibly talented tailors and fashion designers everywhere, yet many struggle to reach the right audience. At the same time, customers often find it difficult to discover reliable fashion creators whose skills match their expectations.</p>
              <p className="font-semibold text-amber-500">We wanted to bridge that gap.</p>
              <p>Fabs Attire was created to make fashion discovery more accessible, give talented creators greater visibility, and make the connection between customers and tailors easier and more meaningful.</p>
              <p>Our goal isn't simply to display clothes. It's to build an ecosystem where talent gets recognized, creativity gets discovered, and opportunities are created.</p>
              <p>From timeless traditional outfits to contemporary styles, Fabs Attire creates a space where creativity meets opportunity and where every stitch tells a story.</p>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          <article className={`rounded-[1.5rem] border p-6 sm:p-8 ${isDarkMode ? 'border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-[#121316]' : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white'}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500"><Target className="h-5 w-5" /></span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Our mission</p>
            <h2 className={`mt-2 font-serif text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>Making Fashion Discovery Effortless.</h2>
            <p className={`mt-3 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>To empower fashion creators with the visibility and opportunities they deserve while giving customers a convenient way to discover, explore and connect with talented tailors.</p>
          </article>
          <article className={`rounded-[1.5rem] border p-6 sm:p-8 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><Compass className="h-5 w-5" /></span>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500">Our vision</p>
            <h2 className={`mt-2 font-serif text-2xl font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>A World Where Every Talented Creator Gets Seen.</h2>
            <p className={`mt-3 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>We envision a future where discovering a great tailor is as easy as discovering a great product — where location is no longer a major barrier to opportunity and where African fashion talent can reach beyond geographical boundaries.</p>
          </article>
        </section>

        <section className={`mt-8 grid overflow-hidden rounded-[1.75rem] border md:grid-cols-[1fr_0.8fr] ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
          <div className="p-6 sm:p-9 lg:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Meet the founder</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold sm:text-4xl">OBA <span className="text-lg font-normal text-amber-500">— Founder &amp; Creator, Fabs Attire</span></h2>
            <div className={`mt-5 space-y-4 text-sm leading-7 ${isDarkMode ? 'text-neutral-300' : 'text-neutral-600'}`}>
              <p>I'm OBA, a web developer, creative thinker and someone fascinated by the possibilities of technology.</p>
              <p>I've always found something extraordinary about the ability to turn imagination into reality through programming. An idea that exists only in your head can become a functional product, a platform or an experience that people interact with.</p>
              <p>That's one of the things that drives me.</p>
              <p>Fabs Attire is one of those ideas brought to life through that passion. I wanted to build something meaningful — something that doesn't just exist on the internet but solves a real problem and creates value for people.</p>
              <p>My approach to building is simple: imagine beyond the ordinary, pay attention to the details, and never stop improving.</p>
              <p>I'm not just interested in writing code or building websites. I'm interested in creating experiences, solving problems and exploring what technology can make possible.</p>
              <p>Fabs Attire represents that mindset — a combination of creativity, innovation and a vision for something bigger.</p>
              <p className="font-serif text-lg italic text-amber-500">And this is only the beginning.</p>
            </div>
          </div>
          <div className="relative min-h-72 overflow-hidden md:min-h-full">
            <img src="/assets/landing-textiles.jpg" alt="Rich fabrics chosen for a new design" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/5" />
            <p className="absolute bottom-5 left-5 right-5 font-serif text-2xl italic text-white sm:text-3xl">“Imagine beyond the ordinary.”</p>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Why Fabs Attire</p>
            <h2 className={`mt-2 font-serif text-3xl font-semibold sm:text-4xl ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>What makes us different?</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: 'Creator Visibility', text: 'Helping talented tailors showcase their work, build their presence and reach more customers.', icon: Users },
              { title: 'Easy Discovery', text: 'Making it easier for customers to explore fashion and find creators who match their style and preferences.', icon: Compass },
              { title: 'Celebrating Craftsmanship', text: 'Giving creativity, skill and quality craftsmanship the recognition they deserve.', icon: Scissors },
              { title: 'Technology With Purpose', text: 'Using technology to create meaningful connections, simplify fashion discovery and open up new opportunities.', icon: Sparkles },
            ].map(({ title, text, icon: FeatureIcon }, index) => (
              <article key={title} className={`rounded-2xl border p-5 transition hover:-translate-y-1 hover:border-amber-500/50 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><FeatureIcon className="h-5 w-5" /></span>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">0{index + 1}</p>
                <h3 className={`mt-1 font-serif text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{title}</h3>
                <p className={`mt-2 text-xs leading-6 ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative mt-10 overflow-hidden rounded-[1.75rem] border border-amber-500/25 bg-gradient-to-br from-[#20170d] via-[#15120f] to-[#0d0e10] px-6 py-9 text-center sm:px-12 sm:py-12">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300"><Heart className="h-6 w-6" /></span>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">Our promise</p>
          <h2 className="mx-auto mt-2 max-w-3xl font-serif text-3xl font-semibold text-white sm:text-4xl">Every beautiful outfit begins with a story.</h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-neutral-300">We believe that behind every beautiful outfit is a creative mind, a skilled hand and a story worth discovering. At Fabs Attire, we're building more than a fashion marketplace. We're creating a space where those stories can be seen, appreciated and connected with the people who matter.</p>
          <p className="mt-7 font-serif text-xl font-semibold text-amber-200">Welcome to Fabs Attire.</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-400">Where Your Style Finds Its Creator.</p>
        </section>
      </main>
    );
  }

  const item = content[page];
  const Icon = item.icon;
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
