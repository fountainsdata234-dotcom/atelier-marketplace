import { User, ClothPost, AdminPromoPlan, DirectMessage, BroadcastMessage, SavedPhoto } from '../types';

const STORAGE_KEYS = {
  USERS: 'atelier_users_v2',
  CURRENT_USER: 'atelier_active_user_v2',
  POSTS: 'atelier_cloth_posts_v2',
  PROMO_PLANS: 'atelier_promo_plans_v2',
  MESSAGES: 'atelier_messages_v2',
  BROADCASTS: 'atelier_broadcasts_v2',
  DARK_MODE: 'atelier_dark_mode_v2',
  SAVED_PHOTOS: 'atelier_saved_photos_v2',
  COLLECTION_PACKAGES: 'atelier_collection_packages_v2'
};

const DEFAULT_PROMO_PLANS: AdminPromoPlan[] = [
  {
    id: 'promo-1',
    caption: 'Atelier Spotlight Boost',
    timeRange: '7 Days Active',
    description: 'Feature your bespoke designs at the top of the marketplace carousel with the verified golden Atelier badge.',
    amount: 25,
    currency: 'USD',
    whatsappNumber: '+2348000000001',
    badgeLabel: 'Rising Atelier',
    accentColor: '#d97706',
    isActive: true,
  },
  {
    id: 'promo-2',
    caption: 'Haute Runway Premiere',
    timeRange: '30 Days Priority',
    description: 'Maximum feed visibility, priority placement in location search results, and 3x customer direct inquiry routing.',
    amount: 75,
    currency: 'USD',
    whatsappNumber: '+2348000000001',
    badgeLabel: 'Master Tailor',
    accentColor: '#059669',
    isActive: true,
  },
  {
    id: 'promo-3',
    caption: 'Couture Enterprise Suite',
    timeRange: '90 Days VIP',
    description: 'Full carousel lock, direct WhatsApp VIP lead generation, featured banner in buyer digests, and verified atelier insignia.',
    amount: 190,
    currency: 'USD',
    whatsappNumber: '+2348000000001',
    badgeLabel: 'Premier Maison',
    accentColor: '#8b5cf6',
    isActive: true,
  },
];

// Initial empty posts array as user strictly requested:
// "note i dnt want to see demo all cloths seen should be added by any tailors or seller that creates account and posts a cloth."
const INITIAL_POSTS: ClothPost[] = [];

export const storageService = {
  // Initialization
  init(): void {
    if (!localStorage.getItem(STORAGE_KEYS.PROMO_PLANS)) {
      localStorage.setItem(STORAGE_KEYS.PROMO_PLANS, JSON.stringify(DEFAULT_PROMO_PLANS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.POSTS)) {
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(INITIAL_POSTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.MESSAGES)) {
      localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BROADCASTS)) {
      localStorage.setItem(STORAGE_KEYS.BROADCASTS, JSON.stringify([]));
    }
    
  },

  // USERS
  getUsers(): User[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  getSavedPhotos(): SavedPhoto[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAVED_PHOTOS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveSavedPhotos(photos: SavedPhoto[]): void {
    localStorage.setItem(STORAGE_KEYS.SAVED_PHOTOS, JSON.stringify(photos));
    window.dispatchEvent(new CustomEvent('atelier_saved_photos_updated'));
  },

  addSavedPhoto(photo: Omit<SavedPhoto, 'id' | 'savedAt'>): SavedPhoto | null {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return null;

    const photos = this.getSavedPhotos().filter(item => item.url !== photo.url);
    const added: SavedPhoto = {
      ...photo,
      id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
    };

    const updated = [added, ...photos].slice(0, 120);
    this.saveSavedPhotos(updated);
    return added;
  },

  removeSavedPhoto(id: string): void {
    this.saveSavedPhotos(this.getSavedPhotos().filter(photo => photo.id !== id));
  },

  saveUsers(users: User[]): void {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent('atelier_users_updated'));
  },

  upsertUser(user: User): User {
    const users = this.getUsers();
    const index = users.findIndex(existing => existing.id === user.id);
    if (index >= 0) users[index] = { ...users[index], ...user };
    else users.push(user);
    this.saveUsers(users);
    this.setCurrentUser(index >= 0 ? users[index] : user);
    return index >= 0 ? users[index] : user;
  },

  getCurrentUser(): User | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
    window.dispatchEvent(new CustomEvent('atelier_auth_changed', { detail: user }));
  },

  createUser(userData: Omit<User, 'id' | 'createdAt' | 'followers' | 'isPromoted' | 'isBlocked'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...userData,
      id: `usr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      followers: [],
      isPromoted: false,
      isBlocked: false
    };
    users.push(newUser);
    this.saveUsers(users);
    this.setCurrentUser(newUser);
    return newUser;
  },

  updateUser(id: string, updates: Partial<User>): User | null {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    
    users[index] = { ...users[index], ...updates };
    this.saveUsers(users);

    // Update active user if self
    const current = this.getCurrentUser();
    if (current && current.id === id) {
      this.setCurrentUser(users[index]);
    }

    // If tailor details like name, avatar, or promoted status changed, update their posts author info
    if (updates.name || updates.avatarUrl || updates.handle || updates.isPromoted !== undefined) {
      const posts = this.getPosts();
      let changed = false;
      const updatedPosts = posts.map(p => {
        if (p.authorId === id) {
          changed = true;
          return {
            ...p,
            authorName: updates.name || p.authorName,
            authorAvatar: updates.avatarUrl !== undefined ? updates.avatarUrl : p.authorAvatar,
            authorHandle: updates.handle || p.authorHandle,
            isPromoted: updates.isPromoted !== undefined ? updates.isPromoted : p.isPromoted
          };
        }
        return p;
      });
      if (changed) {
        this.savePosts(updatedPosts);
      }
    }

    return users[index];
  },

  addSecondaryAdmin(email: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsers();
    const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      if (existing.role === 'admin') {
        return { success: false, message: 'This email is already registered as an administrator.' };
      }
      // Upgrade existing user to admin
      existing.role = 'admin';
      existing.addedByEmail = 'firebase-admin';
      this.saveUsers(users);
      return { success: true, message: `Upgraded ${existing.name} (${email}) to Administrator.`, user: existing };
    }

    // Create fresh sub-admin
    const newAdmin: User = {
      id: `admin-sub-${Date.now()}`,
      email,
      name: email.split('@')[0],
      role: 'admin',
      phone: '+1 000 000 0000',
      countryCode: '+1',
      location: { country: 'United States', state: 'New York', city: 'New York City' },
      handle: `@${email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')}_admin`,
      isPromoted: false,
      isBlocked: false,
      followers: [],
      createdAt: new Date().toISOString(),
      isSuperAdmin: false,
      addedByEmail: 'firebase-admin'
    };
    users.push(newAdmin);
    this.saveUsers(users);
    return { success: true, message: `Added ${email} as Administrator successfully.`, user: newAdmin };
  },

  deleteSecondaryAdmin(adminId: string, actingUser: User): { success: boolean; message: string } {
    if (!actingUser.isSuperAdmin) {
      return { success: false, message: 'Only the Super Administrator can remove administrators.' };
    }
    const users = this.getUsers();
    const target = users.find(u => u.id === adminId);
    if (!target) return { success: false, message: 'Administrator not found.' };
    const filtered = users.filter(u => u.id !== adminId);
    this.saveUsers(filtered);
    return { success: true, message: `Administrator ${target.email} was removed.` };
  },

  warnUser(userId: string, note: string): { success: boolean; message: string } {
    const users = this.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return { success: false, message: 'User not found.' };

    target.isWarned = true;
    target.warningNote = note.trim().slice(0, 500) || 'Warning issued by administrator.';
    this.saveUsers(users);
    return { success: true, message: `Warning sent to ${target.name}.` };
  },

  // POSTS
  getPosts(): ClothPost[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.POSTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  savePosts(posts: ClothPost[]): void {
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    window.dispatchEvent(new CustomEvent('atelier_posts_updated'));
  },

  getCollectionPackageState(): { freeSlots: number; unlockedSlots: number } {
    const stored = localStorage.getItem(STORAGE_KEYS.COLLECTION_PACKAGES);
    const parsed = stored ? JSON.parse(stored) : null;
    const current = parsed || { freeSlots: 5, unlockedSlots: 5 };
    return {
      freeSlots: Math.max(0, Number(current.freeSlots) || 5),
      unlockedSlots: Math.max(0, Number(current.unlockedSlots) || 5),
    };
  },

  updateCollectionPackageState(unlockedSlots: number): { freeSlots: number; unlockedSlots: number } {
    const next = {
      freeSlots: 5,
      unlockedSlots: Math.max(5, Math.min(50, Number(unlockedSlots) || 5)),
    };
    localStorage.setItem(STORAGE_KEYS.COLLECTION_PACKAGES, JSON.stringify(next));
    return next;
  },

  createPost(postData: Omit<ClothPost, 'id' | 'likes' | 'saves' | 'createdAt'>): { success: boolean; post?: ClothPost; message?: string } {
    const author = this.getUsers().find(u => u.id === postData.authorId);
    if (author?.isBlocked) {
      return { success: false, message: 'Your account has been restricted by an administrator. You cannot create new posts.' };
    }

    const posts = this.getPosts();
    const newPost: ClothPost = {
      ...postData,
      id: `post-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      likes: [],
      saves: [],
      ratingsByUser: {},
      rating: 0,
      ratingCount: 0,
      createdAt: new Date().toISOString()
    };
    posts.unshift(newPost);
    this.savePosts(posts);
    return { success: true, post: newPost };
  },

  deletePost(postId: string, userId: string, isAdmin: boolean): boolean {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return false;
    if (post.authorId !== userId && !isAdmin) return false;
    
    const filtered = posts.filter(p => p.id !== postId);
    this.savePosts(filtered);
    return true;
  },

  toggleLikePost(postId: string, userId: string): { likesCount: number; isLiked: boolean } {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return { likesCount: 0, isLiked: false };

    const likedIndex = post.likes.indexOf(userId);
    let isLiked = false;
    if (likedIndex >= 0) {
      post.likes.splice(likedIndex, 1);
      isLiked = false;
    } else {
      post.likes.push(userId);
      isLiked = true;
    }
    this.savePosts(posts);
    return { likesCount: post.likes.length, isLiked };
  },

  ratePost(postId: string, userId: string, rating: number): { rating: number; ratingCount: number } | null {
    const posts = this.getPosts();
    const post = posts.find(item => item.id === postId);
    if (!post || rating < 1 || rating > 5) return null;
    const ratingsByUser = post.ratingsByUser || {};
    ratingsByUser[userId] = rating;
    const values = Object.values(ratingsByUser) as number[];
    post.ratingsByUser = ratingsByUser;
    post.ratingCount = values.length;
    post.rating = values.reduce((sum, value) => sum + value, 0) / values.length;
    this.savePosts(posts);
    return { rating: post.rating, ratingCount: post.ratingCount };
  },

  toggleSavePost(postId: string, userId: string): { savesCount: number; isSaved: boolean } {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return { savesCount: 0, isSaved: false };

    const savedIndex = post.saves.indexOf(userId);
    let isSaved = false;
    if (savedIndex >= 0) {
      post.saves.splice(savedIndex, 1);
      isSaved = false;
    } else {
      post.saves.push(userId);
      isSaved = true;
    }
    this.savePosts(posts);
    return { savesCount: post.saves.length, isSaved };
  },

  toggleFollowUser(targetUserId: string, currentUserId: string): { followersCount: number; isFollowing: boolean } {
    const users = this.getUsers();
    const target = users.find(u => u.id === targetUserId);
    if (!target) return { followersCount: 0, isFollowing: false };

    const index = target.followers.indexOf(currentUserId);
    let isFollowing = false;
    if (index >= 0) {
      target.followers.splice(index, 1);
      isFollowing = false;
    } else {
      target.followers.push(currentUserId);
      isFollowing = true;
    }
    this.saveUsers(users);
    return { followersCount: target.followers.length, isFollowing };
  },

  // PROMOTION PLANS
  getPromoPlans(): AdminPromoPlan[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROMO_PLANS);
      return data ? JSON.parse(data) : DEFAULT_PROMO_PLANS;
    } catch {
      return DEFAULT_PROMO_PLANS;
    }
  },

  savePromoPlans(plans: AdminPromoPlan[]): void {
    localStorage.setItem(STORAGE_KEYS.PROMO_PLANS, JSON.stringify(plans));
    window.dispatchEvent(new CustomEvent('atelier_plans_updated'));
  },

  updatePromoPlan(id: string, updates: Partial<AdminPromoPlan>): AdminPromoPlan[] {
    const plans = this.getPromoPlans();
    const updated = plans.map(p => p.id === id ? { ...p, ...updates } : p);
    this.savePromoPlans(updated);
    return updated;
  },

  // DIRECT MESSAGING
  getMessages(user1Id: string, user2Id?: string): DirectMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      const msgs: DirectMessage[] = data ? JSON.parse(data) : [];
      if (!user2Id) {
        return msgs.filter(m => m.senderId === user1Id || m.recipientId === user1Id);
      }
      return msgs.filter(
        m => (m.senderId === user1Id && m.recipientId === user2Id) ||
             (m.senderId === user2Id && m.recipientId === user1Id)
      );
    } catch {
      return [];
    }
  },

  sendMessage(message: Omit<DirectMessage, 'id' | 'timestamp' | 'isRead'>): DirectMessage {
    const all = this.getAllMessages();
    const newMsg: DirectMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      isRead: false
    };
    all.push(newMsg);
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('atelier_message_received', { detail: newMsg }));
    return newMsg;
  },

  getAllMessages(): DirectMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // BROADCASTS
  getBroadcasts(): BroadcastMessage[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BROADCASTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  sendBroadcast(broadcast: Omit<BroadcastMessage, 'id' | 'createdAt'>): BroadcastMessage {
    const all = this.getBroadcasts();
    const newBroadcast: BroadcastMessage = {
      ...broadcast,
      id: `bcast-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    all.unshift(newBroadcast);
    localStorage.setItem(STORAGE_KEYS.BROADCASTS, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('atelier_broadcast_received', { detail: newBroadcast }));
    return newBroadcast;
  }
};
