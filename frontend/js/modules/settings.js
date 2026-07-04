// ============================================
// APP SETTINGS MODULE
// ============================================

import { supabase } from './supabase.js';

let settingsCache = null;
let lastFetch = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getAppSettings() {
    // Return cached if still fresh
    if (settingsCache && lastFetch && (Date.now() - lastFetch < CACHE_DURATION)) {
        return settingsCache;
    }
    
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('key, value');
        
        if (error) throw error;
        
        // Convert to object
        settingsCache = {};
        data.forEach(item => {
            settingsCache[item.key] = item.value;
        });
        
        lastFetch = Date.now();
        return settingsCache;
        
    } catch (error) {
        console.error('Error fetching app settings:', error);
        // Return defaults if fetch fails
        return {
            bank_name: 'GTBank',
            bank_account_name: 'Gliimu Institute Ltd',
            bank_account_number: '0123456789',
            wallet_default_balance: '0'
        };
    }
}

export async function getBankDetails() {
    const settings = await getAppSettings();
    return {
        bankName: settings.bank_name || 'GTBank',
        accountName: settings.bank_account_name || 'Gliimu Institute Ltd',
        accountNumber: settings.bank_account_number || '0123456789'
    };
}

export async function getDefaultWalletBalance() {
    const settings = await getAppSettings();
    return parseInt(settings.wallet_default_balance) || 0;
}

export default {
    getAppSettings,
    getBankDetails,
    getDefaultWalletBalance
};
