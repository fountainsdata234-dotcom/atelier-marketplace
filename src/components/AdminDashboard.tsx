import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Users, UserPlus, UserX, Ban, CheckCircle2, MessageSquare, Send, Edit3, Save, Phone, Clock, DollarSign, Sparkles, Scissors, Trash2, Search, X, Flag } from 'lucide-react';
import { User, ClothPost, AdminPromoPlan, BroadcastMessage, ListingReport, MarketplaceAbuseFlag } from '../types';
import { storageService } from '../services/storage';
import { api } from '../services/api';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { safeCustomerErrorMessage } from '../utils/customerMessages';

interface AdminDashboardProps {
  currentUser: User;
  users: User[];
  posts: ClothPost[];
  promoPlans: AdminPromoPlan[];
  broadcasts: BroadcastMessage[];
  isDarkMode: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  users,
  posts,
  promoPlans,
  broadcasts,
  isDarkMode
}) => {
  const isSuperAdmin = currentUser.isSuperAdmin === true;

  // Sub-admin management state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [deletedSellerIds, setDeletedSellerIds] = useState<string[]>([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [visibleSellerCount, setVisibleSellerCount] = useState(10);

  // Broadcast message state
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'sellers' | 'buyers'>('all');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSentMsg, setBroadcastSentMsg] = useState<string | null>(null);

  // Promotion Template Cards state
  const [editablePlans, setEditablePlans] = useState<AdminPromoPlan[]>(promoPlans);
  const [planSaveStatus, setPlanSaveStatus] = useState<string | null>(null);

  // Tab State: 'sellers' | 'posts' | 'promo_plans' | 'broadcast' | 'admins'
  const [activeTab, setActiveTab] = useState<'sellers' | 'posts' | 'moderation' | 'reports' | 'abuse' | 'promo_plans' | 'broadcast' | 'admins'>('sellers');
  const [moderationListings, setModerationListings] = useState<ClothPost[]>([]);
  const [moderationStatus, setModerationStatus] = useState<string | null>(null);
  const [listingReports, setListingReports] = useState<ListingReport[]>([]);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [abuseFlags, setAbuseFlags] = useState<MarketplaceAbuseFlag[]>([]);
  const [abuseQueueStatus, setAbuseQueueStatus] = useState<string | null>(null);

  useEffect(() => {
    setEditablePlans(promoPlans);
  }, [promoPlans]);

  useEffect(() => {
    if (activeTab !== 'moderation') return;
    void api.getListingsForModeration()
      .then(setModerationListings)
      .catch((error: unknown) => setModerationStatus(safeCustomerErrorMessage(error, "We couldn't load the moderation queue. Please try again.")));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'abuse') return;
    setAbuseQueueStatus(null);
    void api.getMarketplaceAbuseFlags()
      .then(setAbuseFlags)
      .catch((error: unknown) => setAbuseQueueStatus(safeCustomerErrorMessage(error, "We couldn't load the activity queue. Please try again.")));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    void api.getListingReports()
      .then(setListingReports)
      .catch((error: unknown) => setReportStatus(safeCustomerErrorMessage(error, "We couldn't load reports. Please try again.")));
  }, [activeTab]);

  const moderateListing = async (listing: ClothPost, decision: 'approve' | 'reject') => {
    const reason = decision === 'reject' ? window.prompt('Optional feedback for the seller:') || '' : '';
    try {
      await api.moderateListing(listing.id, decision, reason);
      setModerationListings(current => current.filter(item => item.id !== listing.id));
      setModerationStatus(decision === 'approve' ? 'Listing approved and published.' : 'Listing rejected; the seller can edit and resubmit it.');
    } catch (error) {
      setModerationStatus(safeCustomerErrorMessage(error, "The moderation decision couldn't be saved. Please try again."));
    }
  };

  const resolveListingReport = async (report: ListingReport, status: 'reviewed' | 'dismissed') => {
    const reason = window.prompt('Enter the reason for this report decision (at least 5 characters):');
    if (reason === null) return;
    try {
      await api.updateListingReport(report.id, status, reason.trim());
      setListingReports(current => current.filter(item => item.id !== report.id));
      setReportStatus(status === 'reviewed' ? 'Report marked as reviewed.' : 'Report dismissed.');
    } catch (error) {
      setReportStatus(safeCustomerErrorMessage(error, "The report couldn't be updated. Please try again."));
    }
  };

  const updateAbuseFlag = async (flag: MarketplaceAbuseFlag, status: 'investigating' | 'resolved' | 'dismissed') => {
    const prompt = status === 'investigating'
      ? 'Add a note about the investigation (at least 5 characters):'
      : 'Explain the resolution or dismissal (at least 5 characters):';
    const reason = window.prompt(prompt);
    if (reason === null) return;
    try {
      await api.resolveMarketplaceAbuseFlag(flag.id, status, reason.trim());
      setAbuseFlags(current => current.filter(item => item.id !== flag.id));
      setAbuseQueueStatus(status === 'investigating' ? 'Signal marked for investigation.' : 'Signal review decision recorded.');
    } catch (error) {
      setAbuseQueueStatus(safeCustomerErrorMessage(error, "The activity report couldn't be updated. Please try again."));
    }
  };

  // Filtered lists
  const uniqueUsers = Array.from(new Map(users.map(user => [user.id, user])).values());
  const moderatableUsers = uniqueUsers.filter(u => (u.role === 'tailor' || u.role === 'fabric_seller') && !deletedSellerIds.includes(u.id));
  const sellerSearchTerm = sellerSearch.trim().toLowerCase();
  const filteredModeratableUsers = sellerSearchTerm
    ? moderatableUsers.filter(user => [
        user.name,
        user.shopName,
        user.handle,
        user.email,
        user.role.replace('_', ' '),
        user.location.city,
        user.location.state,
        user.location.country,
        user.phone,
        user.whatsappNumber,
        user.bio,
      ].some(value => value?.toLowerCase().includes(sellerSearchTerm)))
    : moderatableUsers;
  const visibleModeratableUsers = filteredModeratableUsers.slice(0, visibleSellerCount);
  const tailors = uniqueUsers.filter(u => u.role === 'tailor');
  const fabricSellers = uniqueUsers.filter(u => u.role === 'fabric_seller');
  const customers = uniqueUsers.filter(u => u.role === 'buyer');
  const adminUsers = uniqueUsers.filter(u => u.role === 'admin');

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
      const newAdmin = {
        ...added,
        followers: added.followers || [],
        isPromoted: added.isPromoted || false,
        isBlocked: added.isBlocked || false,
        createdAt: added.createdAt || new Date().toISOString(),
        role: 'admin',
      } as User;
      const existingUsers = storageService.getUsers();
      storageService.saveUsers([...existingUsers.filter(user => user.id !== newAdmin.id), newAdmin]);
      storageService.setCurrentUser(currentUser);
      setAdminStatus(`${added.email || newAdminEmail} is now an administrator.`);
      setNewAdminEmail('');
    } catch (error) {
      setAdminStatus(safeCustomerErrorMessage(error, "Administrator access couldn't be granted. Please try again."));
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
          setAdminStatus(safeCustomerErrorMessage(new Error(res.message), 'The administrator account was updated.'));
        })
        .catch((error: unknown) => setAdminStatus(safeCustomerErrorMessage(error, "Administrator access couldn't be removed. Please try again.")));
    }
  };

  const handleToggleAdminBlock = async (admin: User) => {
    if (!isSuperAdmin || admin.isSuperAdmin) return;
    const blocked = !admin.isBlocked;
    const reason = window.prompt(`Reason for ${blocked ? 'blocking' : 'unblocking'} ${admin.name || admin.email}:`)?.trim();
    if (!reason || reason.length < 5) return;
    try {
      await api.setUserBlocked(admin.id, blocked, reason);
      storageService.updateUser(admin.id, { isBlocked: blocked });
      setAdminStatus(`${admin.name || admin.email} has been ${blocked ? 'blocked' : 'unblocked'}.`);
    } catch (error) {
      setAdminStatus(safeCustomerErrorMessage(error, "Administrator access couldn't be updated. Please try again."));
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
    const reason = window.prompt(`Reason for ${updated ? 'blocking' : 'unblocking'} ${tailor.name}:`)?.trim();
    if (!reason || reason.length < 5) return;
    storageService.updateUser(tailor.id, { isBlocked: updated });
    try {
      await api.setUserBlocked(tailor.id, updated, reason);
      setAdminStatus(`${tailor.name} has been ${updated ? 'blocked' : 'unblocked'}.`);
    } catch (error) {
      storageService.updateUser(tailor.id, { isBlocked: !updated });
      setAdminStatus(safeCustomerErrorMessage(error, "The account restriction couldn't be updated. Please try again."));
    }
  };

  const handleDeleteSeller = async (tailor: User) => {
    if (!window.confirm(`Permanently delete ${tailor.shopName || tailor.name}, their posts, messages, profile, and Firebase account? This cannot be undone.`)) return;
    try {
      await api.deleteSeller(tailor.id);
      storageService.deleteUser(tailor.id);
      setDeletedSellerIds(ids => [...ids, tailor.id]);
      setAdminStatus(`${tailor.shopName || tailor.name} and all linked account data were permanently deleted.`);
    } catch (error) {
      setAdminStatus(safeCustomerErrorMessage(error, "The seller account couldn't be deleted. Please try again."));
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
    setAdminStatus(safeCustomerErrorMessage(new Error(result.message), 'The seller was notified.'));
    try {
      await api.updateUserProfile(tailor.id, { isWarned: true, warningNote: draft.trim().slice(0, 500) });
    } catch (error) {
      setAdminStatus(safeCustomerErrorMessage(error, "The warning couldn't be sent. Please try again."));
    }
  };

  // Send Broadcast
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;

    storageService.sendBroadcast({
      sender: isSuperAdmin ? 'Super Administrator' : `${currentUser.name} (Admin)`,
      target: broadcastTarget,
      title: broadcastTitle.trim(),
      body: broadcastBody.trim()
    });

    try {
      await api.sendBroadcast({
        sender: isSuperAdmin ? 'Super Administrator' : `${currentUser.name} (Admin)`,
        target: broadcastTarget,
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
      });
    } catch (error) {
      setBroadcastSentMsg(safeCustomerErrorMessage(error, "The announcement couldn't be sent. Please try again."));
      return;
    }

    setBroadcastSentMsg(`Notification sent successfully to ${broadcastTarget.toUpperCase()}!`);
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
      setPlanSaveStatus(safeCustomerErrorMessage(error, "The promotion plans couldn't be saved. Please try again."));
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
      setAdminStatus(safeCustomerErrorMessage(error, "The listing couldn't be deleted. Please try again."));
    }
  };

  return (
    <div className="relative z-10 w-full px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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
            onClick={() => setActiveTab('moderation')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'moderation'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            Listing review
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5" /> Listing reports</span>
          </button>

          <button
            onClick={() => setActiveTab('abuse')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'abuse'
                ? 'bg-amber-500 text-neutral-950 font-semibold shadow'
                : 'bg-neutral-800/40 text-neutral-400 hover:text-white'
            }`}
          >
            <span className="inline-flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Abuse signals</span>
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
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-serif font-bold">Registered Tailors & Fabric Sellers</h2>
              <p className={`text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
                Contact sellers on WhatsApp, warn, promote, or block users. Posts can be removed from the Posts tab.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400" />
                <input
                  type="search"
                  value={sellerSearch}
                  onChange={event => {
                    setSellerSearch(event.target.value);
                    setVisibleSellerCount(10);
                  }}
                  placeholder="Search sellers by name, shop, role, location, phone, or email..."
                  aria-label="Search registered tailors and fabric sellers"
                  className={`w-full rounded-xl border py-3 pl-10 pr-10 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 ${
                    isDarkMode ? 'border-neutral-700 bg-neutral-900 text-white placeholder-neutral-500' : 'border-neutral-300 bg-white text-neutral-900 placeholder-neutral-400'
                  }`}
                />
                {sellerSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setSellerSearch('');
                      setVisibleSellerCount(10);
                    }}
                    aria-label="Clear seller search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-amber-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </label>
              <span className="shrink-0 text-xs text-neutral-400" aria-live="polite">
                {sellerSearchTerm
                  ? `${filteredModeratableUsers.length} result${filteredModeratableUsers.length === 1 ? '' : 's'}`
                  : `${moderatableUsers.length} sellers`}
              </span>
            </div>
          </div>

          {moderatableUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-400">
              No marketplace users registered yet.
            </div>
          ) : filteredModeratableUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-400">
              No sellers match “{sellerSearch.trim()}”. Try a name, role, or location.
            </div>
          ) : (
            <>
              <div className="grid max-h-[70vh] grid-cols-1 gap-4 overflow-y-auto overscroll-contain pr-1 xl:grid-cols-2">
              {visibleModeratableUsers.map((tailor) => (
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
                      <span>{[tailor.location.city, tailor.location.state, tailor.location.country].filter(Boolean).join(', ')}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-neutral-400 block text-[10px] uppercase tracking-wide">Phone</span>
                      <span className="font-mono">{tailor.phone}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {buildWhatsAppUrl(tailor.whatsappNumber || tailor.phone, `Hello ${tailor.name}, I am contacting you from FABSATTIRE.`) && <a href={buildWhatsAppUrl(tailor.whatsappNumber || tailor.phone, `Hello ${tailor.name}, I am contacting you from FABSATTIRE.`) || undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500 hover:text-neutral-950">WhatsApp</a>}
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
                    <button
                      onClick={() => void handleDeleteSeller(tailor)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-700/20 text-red-300 border border-red-500/40 hover:bg-red-600 hover:text-white transition-all"
                    >
                      <Trash2 className="mr-1 inline-block h-3.5 w-3.5" /> Delete account
                    </button>
                  </div>
                </div>
              ))}
              </div>
              {visibleSellerCount < filteredModeratableUsers.length && (
                <div className="mt-5 flex flex-col items-center gap-2">
                  <p className="text-xs text-neutral-400">
                    Showing {visibleModeratableUsers.length} of {filteredModeratableUsers.length} sellers
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisibleSellerCount(count => count + 10)}
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500 hover:text-neutral-950"
                  >
                    Load 10 more sellers
                  </button>
                </div>
              )}
            </>
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
              Send one-way notifications to everyone, sellers only, or customers only. Recipients cannot reply in the app.
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
                  Public · Everyone
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
                  Sellers Only
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
                  Customers Only
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

      {activeTab === 'moderation' && (
        <section className={`rounded-3xl border p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
          <h2 className="text-xl font-serif font-bold">Listing review queue</h2>
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>New listings and edits remain private until approved. Approval publishes them to search and the marketplace.</p>
          {moderationStatus && <p role="status" className="mt-3 text-xs text-amber-300">{moderationStatus}</p>}
          {moderationListings.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">No listings are waiting for review.</p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {moderationListings.map(listing => (
                <article key={listing.id} className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
                  <img src={listing.imageAssets?.[0]?.thumbnailUrl || listing.imageUrl} alt={listing.imageAlt || ''} className="h-52 w-full bg-neutral-950 object-contain" />
                  <div className="space-y-2 p-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">{listing.listingType || listing.authorRole}</span>
                    <h3 className="font-serif text-lg font-bold">{listing.title}</h3>
                    <p className="line-clamp-3 whitespace-pre-line text-xs text-neutral-400">{listing.description}</p>
                    <p className="text-[10px] text-neutral-500">Seller: {listing.authorName || listing.authorId}</p>
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={() => void moderateListing(listing, 'approve')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">Approve & publish</button>
                      <button type="button" onClick={() => void moderateListing(listing, 'reject')} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300">Reject with feedback</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'reports' && (
        <section className={`rounded-3xl border p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
          <h2 className="text-xl font-serif font-bold">Listing reports</h2>
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>Review buyer reports and record the resolution.</p>
          {reportStatus && <p role="status" className="mt-3 text-xs text-amber-300">{reportStatus}</p>}
          {listingReports.length === 0 ? (
            <p className="py-8 text-center text-xs text-neutral-400">No open reports.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {listingReports.map(report => (
                <article key={report.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{report.listing?.title || 'Listing'}</h3>
                      <p className="mt-1 text-xs text-amber-300">{report.reason}</p>
                      <p className="mt-2 whitespace-pre-line text-xs text-neutral-400">{report.details || 'No additional information supplied.'}</p>
                      <p className="mt-2 text-[10px] text-neutral-500">Reported by {report.reporter?.name || report.reporter?.email || report.reporterId} · {new Date(report.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void resolveListingReport(report, 'reviewed')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-bold text-emerald-300">Mark reviewed</button>
                      <button type="button" onClick={() => void resolveListingReport(report, 'dismissed')} className="rounded-lg border border-neutral-700 px-3 py-2 text-[10px] font-bold text-neutral-300">Dismiss</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'abuse' && (
        <section className={`rounded-3xl border p-6 ${isDarkMode ? 'border-neutral-800 bg-[#121316]' : 'border-neutral-200 bg-white shadow-sm'}`}>
          <h2 className="text-xl font-serif font-bold">Marketplace abuse signals</h2>
          <p className={`mt-1 text-xs ${isDarkMode ? 'text-neutral-400' : 'text-neutral-600'}`}>
            Signals are review leads, not proof of fraud. Shared networks and repeated patterns are not automatic grounds for blocking or removal.
          </p>
          {abuseQueueStatus && <p role="status" className="mt-3 text-xs text-amber-300">{abuseQueueStatus}</p>}
          {abuseFlags.length === 0 ? <p className="py-8 text-center text-xs text-neutral-400">No open abuse signals.</p> : <div className="mt-5 space-y-3">
            {abuseFlags.map(flag => <article key={flag.id} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{flag.flagType.replaceAll('_', ' ')}</strong>
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${flag.severity === 'high' ? 'bg-red-500/15 text-red-300' : flag.severity === 'medium' ? 'bg-amber-500/15 text-amber-300' : 'bg-neutral-700 text-neutral-300'}`}>{flag.severity}</span>
                <span className="text-[10px] text-neutral-500">{flag.action} · {new Date(flag.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-[10px] text-neutral-400">Account: {flag.actorId || 'unlinked'} · Target: {flag.targetId || 'not specified'}</p>
              <pre className="mt-2 overflow-auto rounded-lg bg-black/20 p-2 text-[10px] text-neutral-400">{JSON.stringify(flag.evidence, null, 2)}</pre>
              {flag.signalHash && <p className="mt-2 break-all text-[9px] text-neutral-500">Pseudonymous session signal: {flag.signalHash}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void updateAbuseFlag(flag, 'investigating')} className="rounded-lg border border-amber-500/30 px-3 py-2 text-[10px] font-bold text-amber-300">Investigate</button>
                <button type="button" onClick={() => void updateAbuseFlag(flag, 'resolved')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-bold text-emerald-300">Resolve</button>
                <button type="button" onClick={() => void updateAbuseFlag(flag, 'dismissed')} className="rounded-lg border border-neutral-700 px-3 py-2 text-[10px] font-bold text-neutral-300">Dismiss</button>
              </div>
            </article>)}
          </div>}
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
              Administrators can moderate sellers, manage posts, send messages, and broadcast notices. Only the Super Admin can remove administrators or change administrator access.
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

                  {/* Administrator controls are reserved for the Super Admin. */}
                  {!isPrimary && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void handleToggleAdminBlock(adm)} disabled={!isSuperAdmin} title={isSuperAdmin ? 'Block administrator' : 'Only Super Admin can block admins'} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isSuperAdmin ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'cursor-not-allowed border-neutral-800 bg-neutral-800 text-neutral-500 opacity-40'}`}>
                        <Ban className="mr-1 inline h-3.5 w-3.5" />{adm.isBlocked ? 'Unblock' : 'Block'}
                      </button>
                      <button
                        onClick={() => handleDeleteAdmin(adm.id)}
                        disabled={!isSuperAdmin}
                        title={isSuperAdmin ? 'Remove administrator' : 'Only Super Admin can delete admins'}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-all ${isSuperAdmin ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500 hover:text-white cursor-pointer' : 'opacity-40 cursor-not-allowed bg-neutral-800 text-neutral-500'}`}
                      >
                        <UserX className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
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
