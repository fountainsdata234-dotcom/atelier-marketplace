import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bot, ChevronRight, Eraser, Sparkles, UserRound } from 'lucide-react';
import { ClothPost, User } from '../types';
import { getHandleSlug } from '../utils/profile';

interface AssistantPageProps {
  users: User[];
  posts: ClothPost[];
  currentUser: User | null;
  isDarkMode: boolean;
  onSelectSeller: (seller: User) => void;
}

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  profileIds?: string[];
}

const STORAGE_KEY = 'atelier_local_assistant_conversation_v1';
const MAX_MESSAGES = 100;

const cleanText = (value: string) => value
  .toLowerCase()
  .replace(/[^\p{L}\p{N}@\s_-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const distance = (left: string, right: string) => {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let column = 1; column <= right.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= left.length; row += 1) {
      const current = rows[row];
      rows[row] = Math.min(
        rows[row] + 1,
        rows[row - 1] + 1,
        previous + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return rows[left.length];
};

const readConversation = (): AssistantMessage[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as AssistantMessage[];
    return Array.isArray(saved) ? saved.slice(-MAX_MESSAGES) : [];
  } catch {
    return [];
  }
};

const getInitialMessage = (): AssistantMessage => ({
  id: 'assistant-welcome',
  role: 'assistant',
  text: 'Hi, I’m your Fabsattire guide. Tell me what you need in your own words — even if the spelling is rough. I can help you find an artisan, open a profile, or suggest where to start.',
  createdAt: new Date().toISOString(),
});

export const AssistantPage: React.FC<AssistantPageProps> = ({
  users,
  posts,
  currentUser,
  isDarkMode,
  onSelectSeller,
}) => {
  const [messages, setMessages] = useState<AssistantMessage[]>(() => {
    const saved = readConversation();
    return saved.length > 0 ? saved : [getInitialMessage()];
  });
  const [draft, setDraft] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const sellers = useMemo(
    () => users.filter(user => user.role === 'tailor' || user.role === 'fabric_seller'),
    [users],
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const findProfiles = (text: string) => {
    const normalized = cleanText(text);
    const handleMention = normalized.match(/@([a-z0-9._-]+)/)?.[1];
    const query = handleMention || normalized
      .replace(/\b(please|help|me|find|open|go|to|upload|profile|page|of|the|artisan|tailor|seller|fabric|merchant)\b/g, ' ')
      .trim();
    if (!query) return [];

    return sellers
      .map(user => {
        const handle = getHandleSlug(user.handle);
        const name = cleanText(user.name);
        const shop = cleanText(user.shopName || '');
        const exact = handle === query || handleMention === handle;
        const score = exact ? 0 : Math.min(
          distance(query, handle),
          distance(query, name),
          shop ? distance(query, shop) : Number.MAX_SAFE_INTEGER,
        );
        return { user, score, exact };
      })
      .filter(item => item.exact || item.score <= Math.max(2, Math.ceil(query.length * 0.35)))
      .sort((left, right) => left.score - right.score)
      .slice(0, 5)
      .map(item => item.user);
  };

  const makeReply = (text: string) => {
    const normalized = cleanText(text);
    const profiles = findProfiles(text);
    const asksForProfile = Boolean(normalized.match(/@[\w.-]+|profile|handle|artisan|tailor|seller|merchant/));

    if (asksForProfile && profiles.length > 0) {
      const exactHandle = normalized.match(/@([a-z0-9._-]+)/)?.[1];
      const exact = exactHandle && profiles.some(profile => getHandleSlug(profile.handle) === exactHandle);
      if (exact && profiles[0]) {
        return {
          text: `I found @${getHandleSlug(profiles[0].handle)}. Opening ${profiles[0].name}’s profile now.`,
          profileIds: [profiles[0].id],
          openProfile: profiles[0],
        };
      }
      return {
        text: `I’m not completely sure which profile you mean, but these look closest. Choose one and I’ll take you there.`,
        profileIds: profiles.map(profile => profile.id),
      };
    }

    if (normalized.match(/\b(hi|hello|hey|good morning|good evening)\b/)) {
      return { text: `Hello${currentUser ? ` ${currentUser.name.split(' ')[0]}` : ''}! What are you looking for today — a tailor, fabric, or a specific profile?` };
    }
    if (normalized.match(/\b(fabric|material|cloth|textile)\b/)) {
      const fabricPosts = posts.filter(post => post.listingType === 'FABRIC').slice(0, 3);
      return {
        text: fabricPosts.length > 0
          ? `I found ${fabricPosts.length} fabric option${fabricPosts.length === 1 ? '' : 's'} in the marketplace. Try Marketplace and search by colour, material, or location for a more specific match.`
          : 'I can help you look for fabric. Tell me the material, colour, pattern, or location you have in mind, and I’ll guide you to the best place to search.',
      };
    }
    if (normalized.match(/\b(help|how|what|suggest|recommend|looking)\b/)) {
      return { text: 'Absolutely. Be as informal as you like — for example, “find a tailor in Lagos” or “open @maria couture”. I’ll interpret the intent, correct small spelling mistakes, and suggest the next step.' };
    }
    return { text: 'I understand you’re looking for help, but I need one more detail. You can mention a profile handle with @, a city, a fabric type, or what you want to make.' };
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isThinking) return;
    setDraft('');
    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages(current => [...current, userMessage].slice(-MAX_MESSAGES));
    setIsThinking(true);
    window.setTimeout(() => {
      const reply = makeReply(text);
      const assistantMessage: AssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: reply.text,
        profileIds: reply.profileIds,
        createdAt: new Date().toISOString(),
      };
      setMessages(current => [...current, assistantMessage].slice(-MAX_MESSAGES));
      setIsThinking(false);
      if (reply.openProfile) onSelectSeller(reply.openProfile);
    }, 420);
  };

  const clearConversation = () => {
    const welcome = getInitialMessage();
    setMessages([welcome]);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([welcome]));
  };

  const profileById = new Map(sellers.map(profile => [profile.id, profile]));
  return (
    <section className={`mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12 ${isDarkMode ? 'text-neutral-100' : 'text-neutral-900'}`}>
      <div className={`overflow-hidden rounded-[2rem] border shadow-2xl ${isDarkMode ? 'border-amber-500/20 bg-[#121419]/95' : 'border-amber-500/20 bg-white'}`}>
        <div className="border-b border-amber-500/15 bg-gradient-to-br from-amber-500/15 via-transparent to-transparent p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-neutral-950 shadow-lg shadow-amber-500/20"><Sparkles className="h-6 w-6" /></div>
              <div><p className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-400">Fabsattire assistant</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Tell me what you need.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">A private, device-saved conversation that understands imperfect wording and helps you reach the right artisan.</p></div>
            </div>
            <button type="button" onClick={clearConversation} className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 px-3 py-2 text-xs text-neutral-400 hover:border-amber-500/50 hover:text-amber-300"><Eraser className="h-3.5 w-3.5" /> Clear</button>
          </div>
        </div>
        <div className="max-h-[55vh] min-h-[360px] space-y-4 overflow-y-auto p-4 sm:p-8">
          {messages.map(message => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300"><Bot className="h-4 w-4" /></div>}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'rounded-br-md bg-amber-400 text-neutral-950' : isDarkMode ? 'rounded-bl-md bg-neutral-800/80 text-neutral-200' : 'rounded-bl-md bg-neutral-100 text-neutral-800'}`}>
                <p>{message.text}</p>
                {message.profileIds && <div className="mt-3 space-y-2">{message.profileIds.map(id => { const profile = profileById.get(id); if (!profile) return null; return <button type="button" key={id} onClick={() => onSelectSeller(profile)} className="flex w-full items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-left transition hover:border-amber-400 hover:bg-amber-500/20"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-300"><UserRound className="h-4 w-4" /></div><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{profile.name}</strong><small className="block truncate text-[11px] text-amber-300">@{getHandleSlug(profile.handle)} · {profile.email}</small></span><ChevronRight className="h-4 w-4 text-amber-300" /></button>; })}</div>}
              </div>
            </div>
          ))}
          {isThinking && <div className="flex items-center gap-3 text-xs text-neutral-500"><Bot className="h-4 w-4 text-amber-400" /> Thinking through that…</div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={sendMessage} className="border-t border-amber-500/15 p-4 sm:p-6">
          <div className={`flex items-center gap-2 rounded-2xl border p-2 ${isDarkMode ? 'border-neutral-700 bg-neutral-900/80' : 'border-neutral-200 bg-neutral-50'}`}>
            <input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Try: abeg help me open @handle profile" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-neutral-500" aria-label="Message the Fabsattire assistant" />
            <button type="submit" disabled={!draft.trim() || isThinking} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><ArrowRight className="h-5 w-5" /></button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500"><Bot className="h-3.5 w-3.5" /> Your assistant conversation stays in this device’s local storage.</p>
        </form>
      </div>
    </section>
  );
};
