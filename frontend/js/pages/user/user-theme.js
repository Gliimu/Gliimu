// ============================================
// USER THEME MODULE
// Path: /frontend/js/pages/user-theme.js
// Purpose: Manages theme state across all pages
// ============================================

const THEME_STORAGE_KEY = 'glimu_theme_preference';

/**
 * Theme Manager - Singleton
 */
class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        this.listeners = [];
        this.initialized = false;
        
        this.systemPrefersDark.addEventListener('change', () => {
            if (this.currentTheme === 'system') {
                this.applySystemTheme();
            }
        });
    }

    init() {
        if (this.initialized) return;
        
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        this.currentTheme = savedTheme || 'system';
        this.applyTheme(this.currentTheme);
        this.initialized = true;
        
        console.log(`🎨 Theme initialized: ${this.currentTheme}`);
    }

    getTheme() {
        return this.currentTheme;
    }

    applyTheme(theme) {
        this.currentTheme = theme;
        
        document.body.classList.remove('dark-mode', 'light-mode', 'system-theme');
        
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        } else if (theme === 'light') {
            document.body.classList.remove('dark-mode', 'system-theme');
        } else if (theme === 'system') {
            document.body.classList.add('system-theme');
            this.applySystemTheme();
        }
        
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        this.notifyListeners(theme);
    }

    applySystemTheme() {
        if (this.systemPrefersDark.matches) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        document.body.classList.add('system-theme');
    }

    toggleTheme() {
        const current = this.currentTheme;
        const newTheme = (current === 'light' || current === 'system') ? 'dark' : 'light';
        this.applyTheme(newTheme);
        return newTheme;
    }

    isDarkMode() {
        return document.body.classList.contains('dark-mode');
    }

    addListener(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
            callback(this.currentTheme);
        }
    }

    removeListener(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    notifyListeners(theme) {
        this.listeners.forEach(cb => {
            try { cb(theme); } catch (e) { console.error('Theme listener error:', e); }
        });
    }
}

const themeManager = new ThemeManager();

export function initTheme() {
    themeManager.init();
    return themeManager;
}

export function getTheme() {
    return themeManager.getTheme();
}

export function applyTheme(theme) {
    return themeManager.applyTheme(theme);
}

export function toggleTheme() {
    return themeManager.toggleTheme();
}

export function isDarkMode() {
    return themeManager.isDarkMode();
}

export function onThemeChange(callback) {
    themeManager.addListener(callback);
}

export function offThemeChange(callback) {
    themeManager.removeListener(callback);
}

export default {
    init: initTheme,
    getTheme,
    applyTheme,
    toggleTheme,
    isDarkMode,
    onThemeChange,
    offThemeChange,
    themeManager
};
