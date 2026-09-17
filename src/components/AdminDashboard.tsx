import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, UserPlus, UserX, Star, Ban, CheckCircle2, MessageSquare, Send, Edit3, Save, Phone, Clock, DollarSign, Sparkles, Scissors, Trash2 } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage } from '../types';
import { storageService } from '../services/storage';
import { api } from '../services/api';

interface AdminDashboardProps {
  currentUser: User;
  users: User[];
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
  broadcasts: BroadcastMessage[];
  onMessageUser: (user: User) => void;
  isDarkMode: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  users,
  posts,
  promoPlans,
  broadcasts,
  onMessageUser,
  isDarkMode
}) => {
  const isSuperAdmin = currentUser.isSuperAdmin === true;

  // Sub-admin management state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);

  // Broadcast message state
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'sellers' | 'buyers'>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSentMsg, setBroadcastSentMsg] = useState<string | null>(null);

  // Promotion Template Cards state
  const [editablePlans, setEditablePlans] = useState<AdminPromoPlan[]>(promoPlans);
  const [planSaveStatus, setPlanSaveStatus] = useState<string | null>(null);

  // Tab State: 'sellers' | 'posts' | 'promo_plans' | 'broadcast' | 'admins'
  const [activeTab, setActiveTab] = useState<'sellers' | 'posts' | 'promo_plans' | 'broadcast' | 'admins'>('sellers');

  useEffect(() => {
    setEditablePlans(promoPlans);
  }, [promoPlans]);

  // Filtered lists
  const moderatableUsers = users.filter(u => u.role === 'tailor' || u.role === 'fabric_seller');
  const tailors = users.filter(u => u.role === 'tailor');
  const fabricSellers = users.filter(u => u.role === 'fabric_seller');
  const customers = users.filter(u => u.role === 'buyer');
  const adminUsers = users.filter(u => u.role === 'admin');

  // Handle Add Admin
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminStatus(null);
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      setAdminStatus('Please enter a valid email address.');
      return;
    }
    try {
      const added = await api.addAdmin(newAdminEmail.trim().toLowerCase());
      storageService.upsertUser({
        ...added,
        followers: added.followers || [],
        isPromoted: added.isPromoted || false,
        isBlocked: added.isBlocked || false,
        createdAt: added.createdAt || new Date().toISOString(),
        role: 'admin',
      });
      setAdminStatus(`${added.email || newAdminEmail} is now an administrator.`);
      setNewAdminEmail('');
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : 'Administrator access could not be granted.');
    }
  };

  // Handle Delete Sub-Admin
  const handleDeleteAdmin = (adminId: string) => {
    if (!isSuperAdmin) {
      alert('Only the Firebase administrator can remove administrators.');
      return;
    }
    if (confirm('Are you sure you want to remove this administrator?')) {
      void api.removeAdmin(adminId)
        .then(() => {
          const res = storageService.deleteSecondaryAdmin(adminId, currentUser);
          setAdminStatus(res.message);
        })
        .catch(error => setAdminStatus(error instanceof Error ? error.message : 'Administrator access could not be removed.'));
    }
  };

  // Toggle Promote Tailor
  const handleTogglePromote = async (tailor: User) => {
    const updated = !tailor.isPromoted;
    storageService.updateUser(tailor.id, { isPromoted: updated });

    try {
      await api.updateUserProfile(tailor.id, { isPromoted: updated });
    } catch (error) {
      console.error('Profile sync failed while updating promotion state', error);
    }
  };

  // Toggle Block Tailor
  const handleToggleBlock = async (tailor: User) => {
    const updated = !tailor.isBlocked;
    storageService.updateUser(tailor.id, { isBlocked: updated });
    try {
      await api.setUserBlocked(tailor.id, updated);
      setAdminStatus(`${tailor.name} has been ${updated ? 'blocked' : 'unblocked'}.`);
    } catch (error) {
      storageService.updateUser(tailor.id, { isBlocked: !updated });
      setAdminStatus(error instanceof Error ? error.message : 'The account restriction could not be updated.');
    }
  };

  // Warn User
  const handleWarnUser = async (tailor: User) => {
    const defaultMessage = tailor.warningNote || 'Please review the platform rules and avoid misuse of the marketplace.';
    const draft = window.prompt(
      `Send a warning note to ${tailor.name} (${tailor.email}):`,
      defaultMessage
    );

    if (draft === null) return;

    const result = storageService.warnUser(tailor.id, draft);
    setAdminStatus(result.message);
    try {
      await api.updateUserProfile(tailor.id, { isWarned: true, warningNote: draft.trim().slice(0, 500) });
    } catch (error) {
      setAdminStatus(error instanceof Error ? error.message : 'The warning could not be delivered to the server.');
    }
  };

  // Send Broadcast
  const handleSendBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;

    storageService.sendBroadcast({
      sender: isSuperAdmin ? 'Super Administrator' : `${currentUser.name} (Admin)`,
      target: broadcastTarget,
      title: broadcastTitle.trim(),
      body: broadcastBody.trim()
    });

    setBroadcastSentMsg(`Broadcast sent successfully to ${broadcastTarget.toUpperCase()}!`);
    setBroadcastTitle('');
    setBroadcastBody('');
    setTimeout(() => setBroadcastSentMsg(null), 4000);
  };

  // Update Plan field in memory
  const handlePlanChange = (index: number, field: keyof AdminPromoPlan, value: any) => {
    const updated = [...editablePlans];
    updated[index] = { ...updated[index], [field]: value };
    setEditablePlans(updated);
  };

  // Save all 3 Promo Plan templates
  const handleSavePromoPlans = async () => {
    storageService.savePromoPlans(editablePlans);
    try {
      const savedPlans = await api.savePromoPlans(editablePlans);
      storageService.savePromoPlans(savedPlans);
      window.dispatchEvent(new CustomEvent('atelier_plans_updated'));
      setPlanSaveStatus('Promotion templates saved and updated live across all seller dashboards.');
    } catch (error) {
      setPlanSaveStatus(error instanceof Error ? error.message : 'Plans saved on this device but could not sync to the server.');
    }
    setTimeout(() => setPlanSaveStatus(null), 4000);
  };

  // Delete Post as Admin
  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Delete this post from the marketplace as administrator?')) return;

    const cachedPosts = storageService.getPosts();
    if (!cachedPosts.some(post => post.id === postId)) return;
    storageService.deletePost(postId, currentUser.id, true);

    try {
      await api.deletePost(postId);
      setAdminStatus('Post deleted from the marketplace.');
    } catch (error) {
      storageService.savePosts(cachedPosts);
      setAdminStatus(error instanceof Error ? error.message : 'The post could not be deleted.');
    }
  };

  return (
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Admin Top Banner */}
      <div className={`p-6 rounded-3xl border transition-all ${
        isDarkMode
          ? 'bg-gradient-to-br from-amber-500/10 via-[#121316] to-[#0c0d10] border-amber-500/40 shadow-xl'
          : 'bg-gradient-to-br from-amber-50 via-white to-neutral-50 border-amber-300 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-neutral-950 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Shield className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-serif font-bold">Atelier Administration Portal</h1>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-neutral-950">
                  {isSuperAdmin ? 'Super Admin' : 'Sub-Admin'}
                </span>
              </div>
              <p className={`text-xs mt-0.5 font-mono ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Active Session: {currentUser.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs w-full sm:w-auto">
            <div className="px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-left sm:text-center">
              <span className="text-amber-400 font-bold">{users.length}</span> Total Users
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-left sm:text-center">
              <span className="text-emerald-400 font-bold">{tailors.length}</span> Tailors
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-left sm:text-center">
              <span className="text-cyan-400 font-bold">{fabricSellers.length}</span> Fabric Sellers
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-left sm:text-center">
              <span className="text-blue-400 font-bold">{customers.length}</span> Customers
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-neutral-900/60 border border-neutral-800 font-mono text-left sm:text-center">
              <span className="text-purple-400 font-bold">{posts.length}</span> Live Posts
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-amber-500/20 text-xs font-medium">
          <button
            onClick={() => setActiveTab('sellers')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'sellers'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Marketplace Users ({moderatableUsers.length})
          </button>

          <button
            onClick={() => setActiveTab('promo_plans')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'promo_plans'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Promotion Plan Templates (3 Cards)
          </button>

          <button
            onClick={() => setActiveTab('broadcast')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'broadcast'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Broadcast Announcement
          </button>

          <button
            onClick={() => setActiveTab('posts')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'posts'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Marketplace Posts ({posts.length})
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Admin Management ({adminUsers.length})
          </button>
        </div>
      </div>

      {/* TAB 1: Tailors & Fabric Sellers Management */}
      {activeTab === 'sellers' && (
        <section className={`p-6 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-serif font-bold">Registered Tailors & Fabric Sellers</h2>
              <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Message, warn, promote, or block marketplace users. Posts can be removed from the Posts tab.
              </p>
            </div>
          </div>

          {moderatableUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              No marketplace users registered yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {moderatableUsers.map((tailor) => (
                <div
                  key={tailor.id}
                  className={`rounded-2xl border p-4 space-y-3 transition-all ${
                    isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-neutral-100 truncate">{tailor.shopName || tailor.name}</div>
                      <div className="text-[11px] text-amber-400 font-mono truncate">{tailor.handle}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {tailor.isPromoted && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ★ Promoted
                        </span>
                      )}
                      {tailor.isBlocked ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/40">
                          Blocked
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-300">
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase tracking-wide">Role</span>
                      <span className="capitalize font-mono">{tailor.role.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 block text-[10px] uppercase tracking-wide">Location</span>
                      <span>{tailor.location.city}, {tailor.location.country}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-neutral-400 block text-[10px] uppercase tracking-wide">Phone</span>
                      <span className="font-mono">{tailor.phone}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onMessageUser(tailor)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500 hover:text-neutral-950 transition-all"
                    >
                      Message
                    </button>
                    <button
                      onClick={() => handleTogglePromote(tailor)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        tailor.isPromoted
                          ? 'bg-neutral-800 text-amber-400 border border-amber-500/50'
                          : 'bg-amber-400 text-neutral-950 hover:bg-amber-300'
                      }`}
                    >
                      {tailor.isPromoted ? 'Demote' : '★ Promote'}
                    </button>

                    <button
                      onClick={() => handleToggleBlock(tailor)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        tailor.isBlocked
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white'
                      }`}
                    >
                      {tailor.isBlocked ? 'Unblock' : 'Block'}
                    </button>

                    <button
                      onClick={() => handleWarnUser(tailor)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500 hover:text-neutral-950 transition-all"
                    >
                      Warn
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: Promotion Plan Templates Editor (3 Cards) */}
      {activeTab === 'promo_plans' && (
        <section className={`p-6 sm:p-8 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-neutral-800">
            <div>
              <h2 className="text-xl font-serif font-bold">3 Promotion / Premium Plan Templates</h2>
              <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Fill in these 3 customizable cards. Sellers view them in their studio and click to contact your WhatsApp to purchase promotions.
              </p>
            </div>

            <button
              onClick={handleSavePromoPlans}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <Save className="w-4 h-4" />
              <span>Save All 3 Templates</span>
            </button>
          </div>

          {planSaveStatus && (
            <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{planSaveStatus}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {editablePlans.map((plan, index) => (
              <div
                key={plan.id}
                className="p-5 rounded-2xl border border-neutral-800 bg-neutral-900/40 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    Template Card #{index + 1}
                  </span>
                  <input
                    type="color"
                    value={plan.accentColor || '#d97706'}
                    onChange={(e) => handlePlanChange(index, 'accentColor', e.target.value)}
                    title="Card Badge Accent Color"
                    className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">Badge Label</label>
                  <input
                    type="text"
                    value={plan.badgeLabel}
                    onChange={(e) => handlePlanChange(index, 'badgeLabel', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">Card Caption / Title</label>
                  <input
                    type="text"
                    value={plan.caption}
                    onChange={(e) => handlePlanChange(index, 'caption', e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-serif font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Time Range</label>
                    <input
                      type="text"
                      value={plan.timeRange}
                      onChange={(e) => handlePlanChange(index, 'timeRange', e.target.value)}
                      placeholder="e.g. 30 Days"
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1">Amount ($ USD)</label>
                    <input
                      type="number"
                      value={plan.amount}
                      onChange={(e) => handlePlanChange(index, 'amount', Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">Plan Description</label>
                  <textarea
                    rows={3}
                    value={plan.description}
                    onChange={(e) => handlePlanChange(index, 'description', e.target.value)}
                    className="w-full p-2.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1">Admin WhatsApp for Comms</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-500" />
                    <input
                      type="tel"
                      value={plan.whatsappNumber}
                      onChange={(e) => handlePlanChange(index, 'whatsappNumber', e.target.value)}
                      placeholder="+234 800 000 0000"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-neutral-800 border border-neutral-700 font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 3: Broadcast Announcement */}
      {activeTab === 'broadcast' && (
        <section className={`p-6 sm:p-8 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="mb-6 pb-4 border-b border-neutral-800">
            <h2 className="text-xl font-serif font-bold">Broadcast Center</h2>
            <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Send direct announcements to Tailors/Fabric Sellers, Customers/Buyers, or both simultaneously.
            </p>
          </div>

          {broadcastSentMsg && (
            <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{broadcastSentMsg}</span>
            </div>
          )}

          <form onSubmit={handleSendBroadcast} className="max-w-2xl space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Target Audience *
              </label>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('all')}
                  className={`flex-1 py-2 rounded-xl border font-medium transition-all ${
                    broadcastTarget === 'all'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  Both Sellers & Customers
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('sellers')}
                  className={`flex-1 py-2 rounded-xl border font-medium transition-all ${
                    broadcastTarget === 'sellers'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  Sellers / Tailors Only
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('buyers')}
                  className={`flex-1 py-2 rounded-xl border font-medium transition-all ${
                    broadcastTarget === 'buyers'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-neutral-700 text-neutral-400'
                  }`}
                >
                  Clients / Buyers Only
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Announcement Subject *
              </label>
              <input
                type="text"
                required
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. Upcoming Runway Promotion Spotlight & Bespoke Guidelines"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                Message Content *
              </label>
              <textarea
                rows={4}
                required
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="Write your communication here. All targeted users will receive this notice."
                className="w-full p-3 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-lg hover:shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Broadcast Notice Now</span>
            </button>
          </form>

          {/* Past Broadcast History */}
          {broadcasts.length > 0 && (
            <div className="mt-8 pt-6 border-t border-neutral-800">
              <h3 className="text-sm font-serif font-bold mb-3">Broadcast Log ({broadcasts.length})</h3>
              <div className="space-y-3">
                {broadcasts.map((b) => (
                  <div key={b.id} className="p-3 rounded-xl border border-neutral-800 bg-neutral-900/30 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono mb-1">
                      <span className="text-amber-400 font-bold uppercase">{b.target}</span>
                      <span>{new Date(b.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="font-semibold text-neutral-200">{b.title}</div>
                    <p className="text-neutral-400 mt-0.5">{b.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: All Marketplace Posts with Timestamps */}
      {activeTab === 'posts' && (
        <section className={`p-6 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-serif font-bold">All Tailor & Fabric Posts</h2>
              <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Timestamped catalog of all items posted by registered tailors and fabric sellers.
              </p>
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              No garments or fabric items posted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-[11px] text-neutral-400 font-mono">
                    <th className="pb-3 font-medium">Preview</th>
                    <th className="pb-3 font-medium">Title & Author</th>
                    <th className="pb-3 font-medium">Pricing Tiers</th>
                    <th className="pb-3 font-medium">Timestamp</th>
                    <th className="pb-3 font-medium">Engagement</th>
                    <th className="pb-3 font-medium text-right">Moderation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {posts.map((post) => (
                    <tr key={post.id} className="hover:bg-neutral-800/20 transition-colors">
                      <td className="py-3">
                        <img
                          src={post.imageUrl}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover bg-neutral-800"
                        />
                      </td>
                      <td className="py-3">
                        <div className="font-semibold text-neutral-100">{post.title}</div>
                        <div className="text-[11px] text-amber-400 font-mono">{post.authorName} ({post.authorHandle})</div>
                      </td>
                      <td className="py-3 font-mono text-[11px]">
                        {post.pricing.basic > 0 ? `${post.pricing.currency || 'USD'} ${post.pricing.basic}` : 'Negotiable'}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-neutral-400">
                        {new Date(post.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 font-mono text-[11px] text-neutral-400">
                        {post.likes.length} Likes • {post.saves.length} Saves
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors"
                          title="Remove post"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 5: Admin Management (Super Admin & Sub-Admins) */}
      {activeTab === 'admins' && (
        <section className={`p-6 sm:p-8 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-[#121316] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm'
        }`}>
          <div className="mb-6 pb-4 border-b border-neutral-800">
            <h2 className="text-xl font-serif font-bold">Administrator Roster & Roles</h2>
            <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
              Firebase administrators can moderate and broadcast. Only accounts with the Firebase admin claim can revoke secondary administrators.
            </p>
          </div>

          {/* Add Admin Form */}
          <form onSubmit={handleAddAdmin} className="max-w-md mb-8">
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Add New Administrator by Email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="colleague@domain.com"
                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-neutral-800/40 border border-neutral-700 focus:border-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Grant Admin</span>
              </button>
            </div>
            {adminStatus && (
              <p className="text-xs text-amber-400 mt-2 font-mono">{adminStatus}</p>
            )}
          </form>

          {/* Admin List */}
          <div className="space-y-3">
            <h3 className="text-sm font-serif font-bold mb-2">Active Administrators ({adminUsers.length})</h3>
            {adminUsers.map((adm) => {
              const isPrimary = adm.isSuperAdmin === true;
              return (
                <div
                  key={adm.id}
                  className="p-3.5 rounded-xl border border-neutral-800 bg-neutral-900/40 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isPrimary ? 'bg-amber-500 text-neutral-950' : 'bg-neutral-800 text-amber-400'
                    }`}>
                      {isPrimary ? '★' : 'AD'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">{adm.name || adm.email}</span>
                        {isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-neutral-950 uppercase">
                            Primary Super Admin
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-400 font-mono">{adm.email}</span>
                    </div>
                  </div>

                  {/* Delete Admin Button (Only enabled for Super Admin) */}
                  {!isPrimary && (
                    <button
                      onClick={() => handleDeleteAdmin(adm.id)}
                      disabled={!isSuperAdmin}
                      title={isSuperAdmin ? 'Remove administrator' : 'Only Super Admin can delete admins'}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isSuperAdmin
                          ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white cursor-pointer'
                          : 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
