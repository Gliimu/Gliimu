// ============================================
// USER UTILITIES - Shared Utility Functions
// Path: /frontend/js/pages/user/user-utils.js
// Purpose: Shared utility functions for all user modules
// ============================================

import { showToast } from '../../modules/toast.js';

// ============================================
// TIME AGO
// ============================================
export function getTimeAgo(date) {
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

// ============================================
// ESCAPE HTML
// ============================================
export function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// GENERATE ID
// ============================================
export function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================
// FORMAT CURRENCY
// ============================================
export function formatCurrency(amount) {
    return '₦' + (amount || 0).toLocaleString();
}

// ============================================
// FORMAT DATE
// ============================================
export function formatDate(date) {
    if (!date) return 'N/A';
    var d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

// ============================================
// FORMAT DATETIME
// ============================================
export function formatDateTime(date) {
    if (!date) return 'N/A';
    var d = new Date(date);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

// ============================================
// TRUNCATE TEXT
// ============================================
export function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// ============================================
// COPY TO CLIPBOARD
// ============================================
export function copyToClipboard(text) {
    if (!text) return false;
    
    navigator.clipboard.writeText(text).then(function() {
        showToast('📋 Copied to clipboard!', 'success');
        return true;
    }).catch(function() {
        // Fallback
        var input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('📋 Copied to clipboard!', 'success');
        return true;
    });
    
    return true;
}

// ============================================
// GET STATUS COLOR
// ============================================
export function getStatusColor(status) {
    var colors = {
        'pending': '#f59e0b',
        'approved': '#10b981',
        'rejected': '#ef4444',
        'replied': '#3b82f6',
        'reviewed': '#8b5cf6',
        'closed': '#64748b',
        'accepted': '#10b981',
        'graded': '#8b5cf6'
    };
    return colors[status] || '#64748b';
}

// ============================================
// GET STATUS LABEL
// ============================================
export function getStatusLabel(status) {
    var labels = {
        'pending': 'Pending',
        'approved': '✅ Approved',
        'rejected': '❌ Rejected',
        'replied': '💬 Replied',
        'reviewed': '📋 Reviewed',
        'closed': '🔒 Closed',
        'accepted': '✅ Accepted',
        'graded': '📊 Graded'
    };
    return labels[status] || status;
}

// ============================================
// GET CATEGORY LABEL
// ============================================
export function getCategoryLabel(category) {
    var labels = {
        'apply': '📝 Application',
        'inquire': '❓ Inquiry',
        'contract': '📄 Contract',
        'submit_work': '💼 Work Submission',
        'hire': '👔 Job Request'
    };
    return labels[category] || category;
}

// ============================================
// GET CATEGORY ICON
// ============================================
export function getCategoryIcon(category) {
    var icons = {
        'apply': '🎓',
        'inquire': '❓',
        'contract': '📄',
        'submit_work': '💼',
        'hire': '👔'
    };
    return icons[category] || '📌';
}

// ============================================
// VALIDATE EMAIL
// ============================================
export function isValidEmail(email) {
    if (!email) return false;
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ============================================
// VALIDATE PHONE
// ============================================
export function isValidPhone(phone) {
    if (!phone) return false;
    var re = /^[0-9]{10,15}$/;
    return re.test(phone.replace(/\s/g, ''));
}

// ============================================
// DEEP CLONE
// ============================================
export function deepClone(obj) {
    if (!obj) return obj;
    return JSON.parse(JSON.stringify(obj));
}

// ============================================
// IS EMPTY OBJECT
// ============================================
export function isEmptyObject(obj) {
    if (!obj) return true;
    return Object.keys(obj).length === 0;
}

// ============================================
// DEBOUNCE
// ============================================
export function debounce(func, wait) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            func.apply(context, args);
        }, wait);
    };
}

// ============================================
// THROTTLE
// ============================================
export function throttle(func, limit) {
    var inThrottle;
    return function() {
        var context = this;
        var args = arguments;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(function() {
                inThrottle = false;
            }, limit);
        }
    };
}
