// ============================================
// ADMIN ROLE - Exports for different roles
// Re-exports functions from admin-super.js based on role
// ============================================

import {
    renderOverview,
    renderUpdate,
    renderInquiries,
    renderEvents,
    renderPayments,
    renderSales,
    renderRecords,
    renderSubmissions,
    renderUsers,
    renderPartnerships,
    renderAdminManagement
} from './admin-super.js';

// ============================================
// CRM ROLE - Overview, Update, Inquiries, Events
// ============================================
export const crmExports = {
    renderOverview,
    renderUpdate,
    renderInquiries,
    renderEvents
};

// ============================================
// MANAGER ROLE - Overview, Submissions, Users, Partnerships
// ============================================
export const managerExports = {
    renderOverview,
    renderSubmissions,
    renderUsers,
    renderPartnerships
};

// ============================================
// SECRETARY ROLE - Overview, Payments, Sales, Records
// ============================================
export const secretaryExports = {
    renderOverview,
    renderPayments,
    renderSales,
    renderRecords
};

// ============================================
// MEMBER ROLE - Overview, Records
// ============================================
export const memberExports = {
    renderOverview,
    renderRecords
};

// ============================================
// ROLE MAP - For dynamic loading
// ============================================
export const roleMap = {
    crm: crmExports,
    manager: managerExports,
    secretary: secretaryExports,
    member: memberExports,
    super_admin: {
        renderOverview,
        renderUpdate,
        renderInquiries,
        renderEvents,
        renderPayments,
        renderSales,
        renderRecords,
        renderSubmissions,
        renderUsers,
        renderPartnerships,
        renderAdminManagement
    }
};

// ============================================
// GET RENDER FUNCTION FOR TAB - EXPORT THIS
// ============================================
export function getRenderFunction(role, tabId) {
    const roleExports = roleMap[role] || roleMap.secretary;
    const renderMap = {
        'overview': roleExports.renderOverview,
        'update': roleExports.renderUpdate,
        'inquiries': roleExports.renderInquiries,
        'events': roleExports.renderEvents,
        'payments': roleExports.renderPayments,
        'sales': roleExports.renderSales,
        'records': roleExports.renderRecords,
        'submissions': roleExports.renderSubmissions,
        'users': roleExports.renderUsers,
        'partnerships': roleExports.renderPartnerships,
        'admin_management': roleExports.renderAdminManagement
    };
    return renderMap[tabId] || null;
}
