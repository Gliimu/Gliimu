// ============================================
// USER ALERTS - Alert Logic
// Path: /frontend/js/pages/user/user-alert.js
// Purpose: Manage all alert/notification functionality
// ============================================

import { supabase } from '../../modules/supabase.js';
import { showToast } from '../../modules/toast.js';

// ============================================
// ALERT MANAGER CLASS
// ============================================
export class AlertManager {
    constructor() {
        this.alerts = [];
        this.unreadCount = 0;
        this.userId = null;
        this.listeners = [];
        this.initialized = false;
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

            try {
                var { data, error } = await supabase
                    .from('user_alerts')
                    .select('*')
                    .eq('user_id', this.userId)
                    .order('created_at', { ascending: false });

                if (error) {
                    if (error.code === '42P01' || error.code === 'PGRST205') {
                        console.warn('user_alerts table not found, using local storage');
                        return this.loadLocalAlerts();
                    }
                    throw error;
                }

                if (data && data.length > 0) {
                    this.alerts = data;
                    this.unreadCount = this.alerts.filter(function(a) { return !a.read; }).length;
                    this.saveLocalAlerts();
                    this.notifyListeners();
                    return this.alerts;
                }
            } catch (dbError) {
                console.warn('Database error, using local storage:', dbError.message);
            }

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
            var stored = localStorage.getItem('alerts_' + this.userId);
            if (stored) {
                var parsed = JSON.parse(stored);
                this.alerts = parsed;
                this.unreadCount = this.alerts.filter(function(a) { return !a.read; }).length;
                this.notifyListeners();
                return this.alerts;
            }
        } catch (e) {
            console.warn('Could not load local alerts:', e);
        }
        
        this.createInitialAlerts();
        return this.alerts;
    }

    saveLocalAlerts() {
        try {
            localStorage.setItem('alerts_' + this.userId, JSON.stringify(this.alerts));
        } catch (e) {
            console.warn('Could not save local alerts:', e);
        }
    }

    // ============================================
    // CREATE INITIAL GUIDELINE ALERTS
    // ============================================
    createInitialAlerts() {
        var existing = this.alerts.filter(function(a) {
            return a.message && a.message.includes('created an account successfully');
        });

        if (existing.length === 0) {
            var initialAlerts = [
                {
                    id: 'alert_init_1_' + Date.now(),
                    user_id: this.userId,
                    icon: '🎉',
                    message: 'You have created an account successfully! Welcome to Gliimu.',
                    link: null,
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'success'
                },
                {
                    id: 'alert_init_2_' + Date.now(),
                    user_id: this.userId,
                    icon: '✉️',
                    message: 'Click the Messages tab to send applications or ask questions.',
                    link: null,
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'info'
                },
                {
                    id: 'alert_init_3_' + Date.now(),
                    user_id: this.userId,
                    icon: '📜',
                    message: 'By using our platform, you agree to our Terms & Conditions.',
                    link: 'https://gliimu.com/policy',
                    read: false,
                    created_at: new Date().toISOString(),
                    type: 'info'
                },
                {
                    id: 'alert_init_4_' + Date.now(),
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
    // ADD ACTIVITY ALERT
    // ============================================
    async addActivityAlert(activityData) {
        var newAlert = {
            id: 'alert_act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            user_id: this.userId,
            icon: activityData.icon || '📌',
            message: activityData.message,
            link: activityData.link || null,
            read: false,
            created_at: activityData.created_at || new Date().toISOString(),
            type: activityData.type || 'info'
        };

        this.alerts.unshift(newAlert);
        this.unreadCount++;
        this.saveLocalAlerts();
        this.notifyListeners();
        
        try {
            await supabase
                .from('user_alerts')
                .insert([newAlert]);
        } catch (e) {
            console.warn('Could not save activity to database:', e.message);
        }

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
            this.unreadCount = this.alerts.filter(function(a) { return !a.read; }).length;
        }
        return this.unreadCount;
    }

    // ============================================
    // MARK ALERT AS READ
    // ============================================
    async markAsRead(alertId) {
        var alert = this.alerts.find(function(a) { return a.id === alertId; });
        if (!alert || alert.read) return;

        alert.read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);

        try {
            await supabase
                .from('user_alerts')
                .update({ read: true })
                .eq('id', alertId);
        } catch (e) {
            console.warn('Could not mark alert as read in database:', e.message);
        }

        this.saveLocalAlerts();
        this.notifyListeners();
    }

    // ============================================
    // MARK ALL AS READ
    // ============================================
    async markAllAsRead() {
        this.alerts.forEach(function(a) {
            a.read = true;
        });
        this.unreadCount = 0;

        try {
            await supabase
                .from('user_alerts')
                .update({ read: true })
                .eq('user_id', this.userId)
                .eq('read', false);
        } catch (e) {
            console.warn('Could not mark all alerts as read in database:', e.message);
        }

        this.saveLocalAlerts();
        this.notifyListeners();
    }

    // ============================================
    // DELETE ALERT
    // ============================================
    async deleteAlert(alertId) {
        this.alerts = this.alerts.filter(function(a) { return a.id !== alertId; });
        this.unreadCount = this.alerts.filter(function(a) { return !a.read; }).length;

        try {
            await supabase
                .from('user_alerts')
                .delete()
                .eq('id', alertId);
        } catch (e) {
            console.warn('Could not delete alert in database:', e.message);
        }

        this.saveLocalAlerts();
        this.notifyListeners();
    }

    // ============================================
    // CLEAR ALL ALERTS
    // ============================================
    async clearAll() {
        this.alerts = [];
        this.unreadCount = 0;

        try {
            await supabase
                .from('user_alerts')
                .delete()
                .eq('user_id', this.userId);
        } catch (e) {
            console.warn('Could not clear alerts in database:', e.message);
        }

        this.saveLocalAlerts();
        this.notifyListeners();
    }

    // ============================================
    // REAL-TIME SUBSCRIPTION
    // ============================================
    setupRealtimeSubscription() {
        if (!this.userId) return;

        try {
            var channel = supabase
                .channel('alerts_channel_' + this.userId)
                .on('postgres_changes', 
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'user_alerts',
                        filter: 'user_id=eq.' + this.userId
                    },
                    function(payload) {
                        if (payload.new) {
                            this.alerts.unshift(payload.new);
                            if (!payload.new.read) {
                                this.unreadCount++;
                            }
                            this.saveLocalAlerts();
                            this.notifyListeners();
                        }
                    }.bind(this)
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

    removeListener(callback) {
        this.listeners = this.listeners.filter(function(cb) {
            return cb !== callback;
        });
    }

    notifyListeners() {
        var data = {
            alerts: this.alerts,
            unreadCount: this.unreadCount
        };
        this.listeners.forEach(function(cb) {
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
        
        var past;
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
        
        var now = new Date();
        var diff = Math.floor((now.getTime() - past.getTime()) / 1000);
        
        if (diff < 0) return 'Just now';
        if (diff < 5) return 'Just now';
        if (diff < 60) return diff + 's ago';
        
        var minutes = Math.floor(diff / 60);
        var hours = Math.floor(diff / 3600);
        var days = Math.floor(diff / 86400);
        var weeks = Math.floor(diff / 604800);
        var months = Math.floor(diff / 2592000);
        var years = Math.floor(diff / 31536000);

        if (minutes < 2) return '1m ago';
        if (minutes < 60) return minutes + 'm ago';
        if (hours < 2) return '1h ago';
        if (hours < 24) return hours + 'h ago';
        if (days < 2) return '1d ago';
        if (days < 7) return days + 'd ago';
        if (weeks < 2) return '1w ago';
        if (weeks < 4) return weeks + 'w ago';
        if (months < 2) return '1mo ago';
        if (months < 12) return months + 'mo ago';
        if (years < 2) return '1y ago';
        return years + 'y ago';
    }
}

// ============================================
// SINGLETON INSTANCE
// ============================================
var alertManager = new AlertManager();

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
    alertManager.createInitialAlerts();
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
    return await alertManager.addActivityAlert(alertData);
}

export { alertManager };
export default alertManager;
