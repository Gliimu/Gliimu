// ============================================
// USER ALERTS MODULE
// Path: /frontend/js/pages/user-alerts.js
// Purpose: Manages all alert/notification functionality
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// ============================================
// ALERT MANAGER CLASS
// ============================================

class AlertManager {
    constructor() {
        this.alerts = [];
        this.unreadCount = 0;
        this.userId = null;
        this.listeners = [];
        this.initialized = false;
        this.activityData = [];
    }

    // ============================================
    // INITIALIZE ALERTS
    // ============================================
    async initialize(userId) {
        this.userId = userId;
        await this.loadAlerts();
        this.setupRealtimeSubscription();
        this.initialized = true;
    }

    // ============================================
    // LOAD ALERTS FROM DATABASE
    // ============================================
    async loadAlerts() {
        try {
            if (!this.userId) {
                console.warn('No userId for alerts');
                return [];
            }

            // Try to load from database first
            try {
                const { data, error } = await supabase
                    .from('user_alerts')
                    .select('*')
                    .eq('user_id', this.userId)
                    .order('created_at', { ascending: false });

                if (error) {
                    // Table doesn't exist - use local storage fallback
                    if (error.code === '42P01' || error.code === 'PGRST205') {
                        console.warn('user_alerts table not found, using local storage');
                        return this.loadLocalAlerts();
                    }
                    throw error;
                }

                if (data && data.length > 0) {
                    this.alerts = data;
                    this.unreadCount = this.alerts.filter(a => !a.read).length;
                    this.saveLocalAlerts();
                    this.notifyListeners();
                    return this.alerts;
                }
            } catch (dbError) {
                console.warn('Database error, using local storage:', dbError.message);
            }

            // Fallback to local storage
            return this.loadLocalAlerts();

        } catch (error) {
            console.error('Error loading alerts:', error);
            return this.loadLocalAlerts();
        }
    }

    // ============================================
    // LOCAL STORAGE FALLBACK
    // ============================================
    loadLocalAlerts() {
        try {
            const stored = localStorage.getItem(`alerts_${this.userId}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.alerts = parsed;
                this.unreadCount = this.alerts.filter(a => !a.read).length;
                this.notifyListeners();
                return this.alerts;
            }
        } catch (e) {
            console.warn('Could not load local alerts:', e);
        }
        
        // If no alerts exist, create initial ones
        this.createInitialAlerts();
        return this.alerts;
    }

    saveLocalAlerts() {
        try {
            localStorage.setItem(`alerts_${this.userId}`, JSON.stringify(this.alerts));
        } catch (e) {
            console.warn('Could not save local alerts:', e);
        }
    }

    // ============================================
    // CREATE INITIAL GUIDELINE ALERTS
    // ============================================
    createInitialAlerts() {
        // Check if initial alerts already exist
        const existing = this.alerts.filter(a => 
            a.message.includes('created an account successfully') ||
            a.message.includes('Terms & Conditions')
        );

        if (existing.length === 0) {
            const initialAlerts = [
                {
                    id: `alert_init_1_${Date.now()}`,
                    user_id: this.userId,
                    icon: '🎉',
                    message: 'You have created an account successfully! Welcome to Gliimu.',
                    link: null,
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'success'
                },
                {
                    id: `alert_init_2_${Date.now()}`,
                    user_id: this.userId,
                    icon: '✉️',
                    message: 'Click the Messages tab to send applications or ask questions.',
                    link: null,
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'info'
                },
                {
                    id: `alert_init_3_${Date.now()}`,
                    user_id: this.userId,
                    icon: '📜',
                    message: 'By using our platform, you agree to our Terms & Conditions.',
                    link: 'https://gliimu.com/policy',
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'info'
                },
                {
                    id: `alert_init_4_${Date.now()}`,
                    user_id: this.userId,
                    icon: '🚀',
                    message: 'Start by exploring the Library and earning GP points!',
                    link: null,
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'info'
                }
            ];

            this.alerts = initialAlerts;
            this.unreadCount = initialAlerts.length;
            this.saveLocalAlerts();
            this.notifyListeners();
            
            console.log('✅ Created 4 initial guideline alerts');
        }
    }

    // ============================================
    // ADD RECENT ACTIVITY AS ALERT
    // ============================================
    async addActivityAlert(activityData) {
        // activityData should contain: icon, message, link, type, created_at
        const newAlert = {
            id: `alert_act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            user_id: this.userId,
            icon: activityData.icon || '📌',
            message: activityData.message,
            link: activityData.link || null,
            read: false,
            created_at: activityData.created_at || new Date().toISOString(),
            type: activityData.type || 'info'
        };

        // Add to beginning of alerts
        this.alerts.unshift(newAlert);
        this.unreadCount++;
        this.saveLocalAlerts();
        this.notifyListeners();
        
        // Try to save to database
        try {
            await supabase
                .from('user_alerts')
                .insert([newAlert]);
        } catch (e) {
            // Table doesn't exist, already saved locally
            console.warn('Could not save activity to database:', e.message);
        }

        return newAlert;
    }

    // ============================================
    // CREATE ALERT FROM ACTIVITY TYPE
    // ============================================
    createAlertFromActivity(type, data) {
        const activityMap = {
            'heart_received': {
                icon: '❤️',
                message: `Someone ❤️ your post!`,
                type: 'heart'
            },
            'comment': {
                icon: '💬',
                message: `You commented on a post`,
                type: 'comment'
            },
            'share': {
                icon: '📤',
                message: `You shared content`,
                type: 'share'
            },
            'read': {
                icon: '📖',
                message: `You read a book/article`,
                type: 'read'
            },
            'submission_graded': {
                icon: '✅',
                message: `Your submission was graded!`,
                type: 'graded'
            },
            'streak_bonus': {
                icon: '🔥',
                message: `Streak bonus! +${data?.gp_earned || 0} GP`,
                type: 'streak'
            },
            'referral': {
                icon: '👤',
                message: `Someone joined using your referral link`,
                type: 'referral'
            },
            'payment_approved': {
                icon: '💰',
                message: `Your wallet funding of ₦${data?.amount?.toLocaleString() || 0} was approved!`,
                type: 'payment'
            },
            'payment_rejected': {
                icon: '❌',
                message: `Your wallet funding of ₦${data?.amount?.toLocaleString() || 0} was rejected.`,
                type: 'payment'
            },
            'role_approved': {
                icon: '🎓',
                message: `Your application to become a ${data?.role || 'student'} was approved!`,
                type: 'role'
            },
            'role_rejected': {
                icon: '📋',
                message: `Your role application was reviewed. Check your dashboard for details.`,
                type: 'role'
            },
            'gp_earned': {
                icon: '⭐',
                message: `You earned ${data?.gp_earned || 0} GP!`,
                type: 'gp'
            }
        };

        const activity = activityMap[type];
        if (!activity) return null;

        return {
            icon: activity.icon,
            message: activity.message,
            type: activity.type,
            created_at: data?.created_at || new Date().toISOString()
        };
    }

    // ============================================
    // ADD INITIAL ALERTS (Public method)
    // ============================================
    async addInitialAlerts() {
        if (this.alerts.length === 0) {
            this.createInitialAlerts();
        } else {
            const hasInitial = this.alerts.some(a => 
                a.message.includes('created an account successfully')
            );
            if (!hasInitial) {
                this.createInitialAlerts();
            }
        }
        return this.alerts;
    }

    // ============================================
    // CREATE NEW ALERT
    // ============================================
    async createAlert(alertData) {
        const newAlert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            user_id: this.userId,
            icon: alertData.icon || '📌',
            message: alertData.message,
            link: alertData.link || null,
            read: false,
            created_at: alertData.created_at || new Date().toISOString(),
            type: alertData.type || 'info'
        };

        try {
            const { error } = await supabase
                .from('user_alerts')
                .insert([newAlert]);

            if (error && error.code !== '42P01' && error.code !== 'PGRST205') {
                console.warn('Could not save to database:', error.message);
            }
        } catch (e) {
            console.warn('Using local storage for alerts');
        }

        this.alerts.unshift(newAlert);
        this.unreadCount++;
        this.saveLocalAlerts();
        this.notifyListeners();
        return newAlert;
    }

    // ============================================
    // GET ALERTS
    // ============================================
    async getAlerts() {
        if (this.alerts.length === 0) {
            await this.loadAlerts();
        }
        return this.alerts;
    }

    // ============================================
    // GET UNREAD COUNT
    // ============================================
    async getUnreadCount() {
        if (this.unreadCount === 0 && this.alerts.length > 0) {
            this.unreadCount = this.alerts.filter(a => !a.read).length;
        }
        return this.unreadCount;
    }

    // ============================================
    // MARK ALERT AS READ
    // ============================================
    async markAsRead(alertId) {
        try {
            const alert = this.alerts.find(a => a.id === alertId);
            if (!alert || alert.read) return;

            alert.read = true;
            this.unreadCount = Math.max(0, this.unreadCount - 1);

            try {
                await supabase
                    .from('user_alerts')
                    .update({ read: true })
                    .eq('id', alertId);
            } catch (e) {
                // Table doesn't exist, just use local
            }

            this.saveLocalAlerts();
            this.notifyListeners();

        } catch (error) {
            console.error('Error marking alert as read:', error);
        }
    }

    // ============================================
    // MARK ALL AS READ
    // ============================================
    async markAllAsRead() {
        try {
            this.alerts.forEach(a => a.read = true);
            this.unreadCount = 0;

            try {
                await supabase
                    .from('user_alerts')
                    .update({ read: true })
                    .eq('user_id', this.userId)
                    .eq('read', false);
            } catch (e) {
                // Table doesn't exist, just use local
            }

            this.saveLocalAlerts();
            this.notifyListeners();

        } catch (error) {
            console.error('Error marking all alerts as read:', error);
        }
    }

    // ============================================
    // DELETE ALERT
    // ============================================
    async deleteAlert(alertId) {
        try {
            this.alerts = this.alerts.filter(a => a.id !== alertId);
            this.unreadCount = this.alerts.filter(a => !a.read).length;

            try {
                await supabase
                    .from('user_alerts')
                    .delete()
                    .eq('id', alertId);
            } catch (e) {
                // Table doesn't exist, just use local
            }

            this.saveLocalAlerts();
            this.notifyListeners();

        } catch (error) {
            console.error('Error deleting alert:', error);
        }
    }

    // ============================================
    // CLEAR ALL ALERTS
    // ============================================
    async clearAll() {
        try {
            this.alerts = [];
            this.unreadCount = 0;

            try {
                await supabase
                    .from('user_alerts')
                    .delete()
                    .eq('user_id', this.userId);
            } catch (e) {
                // Table doesn't exist, just use local
            }

            this.saveLocalAlerts();
            this.notifyListeners();

        } catch (error) {
            console.error('Error clearing alerts:', error);
        }
    }

    // ============================================
    // REAL-TIME SUBSCRIPTION
    // ============================================
    setupRealtimeSubscription() {
        if (!this.userId) return;

        try {
            const channel = supabase
                .channel('alerts_channel')
                .on('postgres_changes', 
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'user_alerts',
                        filter: `user_id=eq.${this.userId}`
                    },
                    (payload) => {
                        if (payload.new) {
                            this.alerts.unshift(payload.new);
                            if (!payload.new.read) {
                                this.unreadCount++;
                            }
                            this.saveLocalAlerts();
                            this.notifyListeners();
                        }
                    }
                )
                .subscribe();
        } catch (e) {
            console.warn('Could not setup real-time subscription:', e.message);
        }
    }

    // ============================================
    // LISTENER SYSTEM
    // ============================================
    addListener(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        const data = {
            alerts: this.alerts,
            unreadCount: this.unreadCount
        };
        this.listeners.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('Listener error:', e);
            }
        });
    }

    // ============================================
    // GET TIME AGO
    // ============================================
    getTimeAgo(date) {
        if (!date) return 'Just now';
        
        let past;
        if (typeof date === 'string') {
            past = new Date(date);
        } else if (date instanceof Date) {
            past = date;
        } else {
            return 'Just now';
        }
        
        if (isNaN(past.getTime())) {
            return 'Just now';
        }
        
        const now = new Date();
        const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
        
        if (diff < 0) return 'Just now';
        if (diff < 5) return 'Just now';
        if (diff < 60) return `${diff}s ago`;
        
        const minutes = Math.floor(diff / 60);
        const hours = Math.floor(diff / 3600);
        const days = Math.floor(diff / 86400);
        const weeks = Math.floor(diff / 604800);
        const months = Math.floor(diff / 2592000);
        const years = Math.floor(diff / 31536000);

        if (minutes < 2) return '1m ago';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 2) return '1h ago';
        if (hours < 24) return `${hours}h ago`;
        if (days < 2) return '1d ago';
        if (days < 7) return `${days}d ago`;
        if (weeks < 2) return '1w ago';
        if (weeks < 4) return `${weeks}w ago`;
        if (months < 2) return '1mo ago';
        if (months < 12) return `${months}mo ago`;
        if (years < 2) return '1y ago';
        return `${years}y ago`;
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================

const alertManager = new AlertManager();

// ============================================
// EXPORT FUNCTIONS
// ============================================

export async function initializeAlerts(userId) {
    await alertManager.initialize(userId);
    return alertManager;
}

export async function addInitialAlerts(userId) {
    alertManager.userId = userId;
    await alertManager.loadAlerts();
    await alertManager.addInitialAlerts();
    return alertManager.alerts;
}

export async function getUnreadCount(userId) {
    if (alertManager.userId !== userId) {
        alertManager.userId = userId;
        await alertManager.loadAlerts();
    }
    return alertManager.unreadCount;
}

export async function markAllAsRead(userId) {
    if (alertManager.userId !== userId) {
        alertManager.userId = userId;
        await alertManager.loadAlerts();
    }
    await alertManager.markAllAsRead();
}

export async function getAlertFeed(userId) {
    if (alertManager.userId !== userId) {
        alertManager.userId = userId;
        await alertManager.loadAlerts();
    }
    return alertManager.alerts;
}

export function subscribeToAlerts(callback) {
    alertManager.addListener(callback);
}

export async function createAlert(alertData) {
    return await alertManager.createAlert(alertData);
}

export async function addActivityAlert(activityData) {
    return await alertManager.addActivityAlert(activityData);
}

export function createAlertFromActivity(type, data) {
    return alertManager.createAlertFromActivity(type, data);
}

export function getTimeAgo(date) {
    return alertManager.getTimeAgo(date);
}

export { alertManager };

export default {
    alertManager,
    initializeAlerts,
    addInitialAlerts,
    getUnreadCount,
    markAllAsRead,
    getAlertFeed,
    subscribeToAlerts,
    createAlert,
    addActivityAlert,
    createAlertFromActivity,
    getTimeAgo
};
