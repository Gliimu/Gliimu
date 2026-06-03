// Admin Module - Handles admin panel functionality

import { showToast } from './toast.js';

// Mock users data
const mockUsers = [
  { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com', phone: '+234800000000', role: 'Student', status: 'Active', track: 'Media Track' },
  { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', phone: '+234800000001', role: 'Instructor', status: 'Active', track: 'Tech Track' },
  { id: '3', firstName: 'Admin', lastName: 'User', email: 'admin@example.com', phone: '+234800000002', role: 'Admin', status: 'Active', track: null }
];

// Mock payments data
const mockPayments = [
  { id: 'pay_001', studentName: 'John Doe', amount: 25000, date: '2025-03-01', ref: 'REF123456', receipt: '/uploads/receipt.jpg', status: 'pending' }
];

// Fetch all users
export async function getAllUsers() {
  try {
    return mockUsers;
  } catch (error) {
    console.error('Get users error:', error);
    return [];
  }
}

// Fetch pending payments
export async function getPendingPayments() {
  try {
    return mockPayments.filter(p => p.status === 'pending');
  } catch (error) {
    console.error('Get payments error:', error);
    return [];
  }
}

// Approve payment
export async function approvePayment(paymentId) {
  try {
    showToast('Payment approved!', 'success');
    return true;
  } catch (error) {
    console.error('Approve payment error:', error);
    showToast('Failed to approve', 'error');
    return false;
  }
}

// Update user role/status
export async function updateUser(userId, updates) {
  try {
    showToast('User updated', 'success');
    return true;
  } catch (error) {
    console.error('Update user error:', error);
    showToast('Update failed', 'error');
    return false;
  }
}

// Render users table
export async function renderUsersTable(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const users = await getAllUsers();
  
  if (users.length === 0) {
    container.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found</td></tr>';
    return;
  }
  
  container.innerHTML = users.map(u => `
    <tr>
      <td>${u.firstName} ${u.lastName}</td>
      <td>${u.email}</td>
      <td><span class="badge ${u.role === 'Student' ? 'active' : 'pending'}">${u.role}</span></td>
      <td>${u.track || '-'}</td>
      <td><span class="badge active">${u.status}</span></td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="editUser('${u.id}')">Edit</button>
      </td>
    </tr>
  `).join('');
}

// Render payments table
export async function renderPaymentsTable(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const payments = await getPendingPayments();
  
  if (payments.length === 0) {
    container.innerHTML = '<tr><td colspan="5" style="text-align:center;">No pending payments</td></tr>';
    return;
  }
  
  container.innerHTML = payments.map(p => `
    <tr>
      <td>${p.studentName}</td>
      <td>₦${p.amount.toLocaleString()}</td>
      <td>${p.date}</td>
      <td><code>${p.ref}</code></td>
      <td>
        <button class="btn btn-success btn-sm" onclick="approvePayment('${p.id}')">Approve</button>
      </td>
    </tr>
  `).join('');
}