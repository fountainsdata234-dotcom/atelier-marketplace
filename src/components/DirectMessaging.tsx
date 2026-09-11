import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageSquare, Phone, User as UserIcon, Scissors, ArrowLeft, Check, CheckCheck } from 'lucide-react';
import { User, DirectMessage, ClothPost } from '../types';
import { storageService } from '../services/storage';
import { api } from '../services/api';

interface DirectMessagingProps {
  currentUser: User;
  recipientUser?: User | null;
  selectedPost?: ClothPost | null;
  onClose: () => void;
  isDarkMode: boolean;
}

export const DirectMessaging: React.FC<DirectMessagingProps> = ({
  currentUser,
  recipientUser: initialRecipient,
  selectedPost,
  onClose,
  isDarkMode
}) => {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [activePartner, setActivePartner] = useState<User | null>(initialRecipient || null);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load all user conversations
  const [allMessages, setAllMessages] = useState<DirectMessage[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    Promise.all([api.getMessages(), api.getUsers()]).then(([remoteMessages, remoteUsers]) => {
      setAllMessages(remoteMessages);
      setAllUsers(remoteUsers);
    }).catch(error => console.error('Messages unavailable', error));
  }, []);

  // Build the available conversation partner list from all registered users so
  // admins and buyers can message any seller/customer immediately, even before a
  // conversation thread already exists.
  const conversationPartners = allUsers
    .filter(u => u.id !== currentUser.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  // If initial recipient is supplied, keep it pinned to the top of the list.
  if (initialRecipient) {
    const initialIndex = conversationPartners.findIndex(p => p.id === initialRecipient.id);
    if (initialIndex >= 0) {
      conversationPartners.splice(initialIndex, 1);
    }
    conversationPartners.unshift(initialRecipient);
  }

  // Refresh messages for active partner
  useEffect(() => {
    if (activePartner) {
      setMessages(allMessages.filter(message =>
        (message.senderId === currentUser.id && message.recipientId === activePartner.id) ||
        (message.senderId === activePartner.id && message.recipientId === currentUser.id)
      ));
    }
  }, [activePartner, currentUser.id, allMessages]);

  // Set default partner if none
  useEffect(() => {
    if (!activePartner && conversationPartners.length > 0) {
      setActivePartner(conversationPartners[0]);
    }
  }, [conversationPartners.length]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activePartner) return;

    const newMsg = await api.sendMessage({
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: currentUser.role,
      recipientId: activePartner.id,
      recipientName: activePartner.name,
      postId: selectedPost?.id,
      postTitle: selectedPost?.title,
      content: text.trim(),
    });

    setAllMessages(prev => [...prev, newMsg]);
    setInputText('');
  };

  const openPartnerWhatsApp = () => {
    if (!activePartner?.whatsappNumber) return;
    const phone = activePartner.whatsappNumber.replace(/\D/g, '');
    const text = encodeURIComponent(`Hello ${activePartner.name}, I am messaging you from Atelier Marketplace.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`relative w-full max-w-4xl h-[85vh] rounded-3xl border shadow-2xl flex flex-col md:flex-row overflow-hidden transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        {/* Left: Conversations Sidebar */}
        <div className={`w-full md:w-80 border-r flex flex-col ${
          isDarkMode ? 'border-neutral-800 bg-neutral-950/40' : 'border-neutral-200 bg-neutral-50/50'
        } ${activePartner ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-neutral-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              <h3 className="font-serif font-bold text-base">Atelier Messages</h3>
            </div>
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversationPartners.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400">
                No active conversations yet. Inquire about any bespoke design in the marketplace to start chatting!
              </div>
            ) : (
              conversationPartners.map((partner) => {
                const isSelected = activePartner?.id === partner.id;
                return (
                  <button
                    key={partner.id}
                    onClick={() => setActivePartner(partner)}
                    className={`w-full p-3 rounded-2xl text-left flex items-center gap-3 transition-colors ${
                      isSelected
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                        : 'hover:bg-neutral-800/30 text-neutral-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                      {partner.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate">{partner.shopName || partner.name}</div>
                      <div className="text-[11px] text-neutral-400 truncate capitalize font-mono">
                        {partner.role.replace('_', ' ')} • {partner.location.city}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Active Chat Area */}
        {activePartner ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Chat Header */}
            <div className="p-4 border-b border-neutral-800/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActivePartner(null)}
                  className="md:hidden p-1.5 rounded-lg text-neutral-400"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-xs">
                  {activePartner.name.charAt(0)}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-serif font-bold text-base leading-tight">
                      {activePartner.shopName || activePartner.name}
                    </h4>
                    {activePartner.isPromoted && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-neutral-950">
                        ★ VIP
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {activePartner.handle} • {activePartner.location.city}, {activePartner.location.country}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activePartner.whatsappNumber && (
                  <button
                    onClick={openPartnerWhatsApp}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
                    title="Switch to WhatsApp"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">WhatsApp</span>
                  </button>
                )}

                <button
                  onClick={onClose}
                  className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/40 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Post reference if initiated from a post */}
            {selectedPost && (
              <div className="p-2.5 px-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <img
                    src={selectedPost.imageUrl}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                  <div>
                    <span className="font-semibold text-neutral-200 block truncate max-w-xs sm:max-w-md">
                      Regarding: {selectedPost.title}
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono">
                      Seller Price: {selectedPost.pricing.basic > 0 ? `${selectedPost.pricing.currency || selectedPost.authorLocation.currency || 'USD'} ${selectedPost.pricing.basic}` : 'Negotiable'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-xs text-neutral-400 space-y-3">
                  <Scissors className="w-8 h-8 text-amber-500/50 mx-auto" />
                  <p>Start your custom tailoring inquiry with {activePartner.name}.</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto pt-2">
                    <button
                      onClick={() => handleSendMessage('Hello! Can you provide your measurement guidelines and turnaround time?')}
                      className="px-2.5 py-1 rounded-full text-[11px] bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700"
                    >
                      "Measurement guide?"
                    </button>
                    <button
                      onClick={() => handleSendMessage('Hello! I would like to order a bespoke cut with premium Italian fabric.')}
                      className="px-2.5 py-1 rounded-full text-[11px] bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700"
                    >
                      "Order bespoke cut"
                    </button>
                    <button
                      onClick={() => handleSendMessage('Hi, do you offer expedited delivery for weddings or special occasions?')}
                      className="px-2.5 py-1 rounded-full text-[11px] bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700"
                    >
                      "Rush delivery inquiry"
                    </button>
                  </div>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderId === currentUser.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          isMe
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-medium rounded-tr-xs shadow-sm'
                            : isDarkMode
                            ? 'bg-neutral-800 text-neutral-100 rounded-tl-xs border border-neutral-700/60'
                            : 'bg-neutral-100 text-neutral-900 rounded-tl-xs border border-neutral-200'
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-[9px] text-neutral-500 mt-1 font-mono px-1">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 sm:p-4 border-t border-neutral-800/60 bg-neutral-900/40">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Message ${activePartner.name} about custom cut, sizing, fabrics...`}
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl bg-neutral-800/60 border border-neutral-700 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-md disabled:opacity-40 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center p-8 text-center text-neutral-400 text-xs">
            Select a conversation partner from the left to start direct messaging.
          </div>
        )}
      </motion.div>
    </div>
  );
};
