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
    }

    // ============================================
    // INITIALIZE ALERTS
    // ============================================
    async initialize(userId) {
        this.userId = userId;
        await this.loadAlerts();
        this.setupRealtimeSubscription();
    }

    // ============================================
    // LOAD ALERTS FROM DATABASE
    // ============================================
    async loadAlerts() {
        try {
            if (!this.userId) return [];

            const { data, error } = await supabase
                .from('user_alerts')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false });

            if (error) {
                // If table doesn't exist, use local storage fallback
                if (error.code === '42P01') {
                    return this.loadLocalAlerts();
                }
                throw error;
            }

            this.alerts = data || [];
            this.unreadCount = this.alerts.filter(a => !a.read).length;
            this.notifyListeners();
            return this.alerts;

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
                this.alerts = JSON.parse(stored);
                this.unreadCount = this.alerts.filter(a => !a.read).length;
                this.notifyListeners();
                return this.alerts;
            }
        } catch (e) {
            console.warn('Could not load local alerts:', e);
        }
        return [];
    }

    saveLocalAlerts() {
        try {
            localStorage.setItem(`alerts_${this.userId}`, JSON.stringify(this.alerts));
        } catch (e) {
            console.warn('Could not save local alerts:', e);
        }
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
            created_at: new Date().toISOString(),
            type: alertData.type || 'info'
        };

        try {
            // Try to save to database
            const { error } = await supabase
                .from('user_alerts')
                .insert([newAlert]);

            if (error) {
                if (error.code === '42P01') {
                    // Table doesn't exist, use local storage
                    this.alerts.unshift(newAlert);
                    this.unreadCount++;
                    this.saveLocalAlerts();
                    this.notifyListeners();
                    return newAlert;
                }
                throw error;
            }

            // Success - add to local state
            this.alerts.unshift(newAlert);
            this.unreadCount++;
            this.notifyListeners();
            return newAlert;

        } catch (error) {
            console.error('Error creating alert:', error);
            // Fallback to local
            this.alerts.unshift(newAlert);
            this.unreadCount++;
            this.saveLocalAlerts();
            this.notifyListeners();
            return newAlert;
        }
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

            // Update in database
            const { error } = await supabase
                .from('user_alerts')
                .update({ read: true })
                .eq('id', alertId);

            if (error && error.code !== '42P01') {
                throw error;
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

            // Update in database
            const { error } = await supabase
                .from('user_alerts')
                .update({ read: true })
                .eq('user_id', this.userId)
                .eq('read', false);

            if (error && error.code !== '42P01') {
                throw error;
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

            const { error } = await supabase
                .from('user_alerts')
                .delete()
                .eq('id', alertId);

            if (error && error.code !== '42P01') {
                throw error;
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

            const { error } = await supabase
                .from('user_alerts')
                .delete()
                .eq('user_id', this.userId);

            if (error && error.code !== '42P01') {
                throw error;
            }

            this.saveLocalAlerts();
            this.notifyListeners();

        } catch (error) {
            console.error('Error clearing alerts:', error);
        }
    }

    // ============================================
    // ADD INITIAL GUIDELINE ALERTS
    // ============================================
    async addInitialAlerts() {
        const initialAlerts = [
            {
                icon: '🎉',
                message: 'You have created an account successfully! Welcome to Gliimu.',
                type: 'success'
            },
            {
                icon: '✉️',
                message: 'Click the Messages tab to send applications or ask questions.',
                link: '#',
                type: 'info'
            },
            {
                icon: '📜',
                message: 'By using our platform, you agree to our Terms & Conditions.',
                link: 'https://gliimu.com/policy',
                type: 'info'
            },
            {
                icon: '🚀',
                message: 'Start by exploring the Library and earning GP points!',
                type: 'info'
            }
        ];

        // Check if initial alerts already added
        const existing = this.alerts.filter(a => 
            a.message.includes('created an account successfully') ||
            a.message.includes('Terms & Conditions')
        );

        if (existing.length === 0) {
            for (const alert of initialAlerts) {
                await this.createAlert(alert);
            }
        }
    }

    // ============================================
    // REAL-TIME SUBSCRIPTION
    // ============================================
    setupRealtimeSubscription() {
        if (!this.userId) return;

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
        this.listeners.forEach(cb => cb(data));
    }
}

// ============================================
// CREATE SINGLETON INSTANCE
// ============================================

const alertManager = new AlertManager();

// ============================================
// EXPORT FUNCTIONS
// ============================================

export async function addInitialAlerts(userId) {
    alertManager.userId = userId;
    await alertManager.loadAlerts();
    await alertManager.addInitialAlerts();
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

export { alertManager };

export default {
    alertManager,
    addInitialAlerts,
    getUnreadCount,
    markAllAsRead,
    getAlertFeed,
    subscribeToAlerts,
    createAlert
};
