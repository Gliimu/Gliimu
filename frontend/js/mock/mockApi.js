import { mockUsers, mockLibrary, mockHub, mockMessages, mockOnlineUsers } from './mockData.js';

// Simulate API delay
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

// Auth
export const mockLogin = async (username, password) => {
  await delay();
  
  // Demo login: any username/password works for testing
  let user = null;
  if (username.includes('student') || password === 'student') {
    user = mockUsers.student;
  } else if (username.includes('instructor') || password === 'instructor') {
    user = mockUsers.instructor;
  } else {
    user = mockUsers.admin;
  }
  
  localStorage.setItem('gliimu_user', JSON.stringify(user));
  return { success: true, user, redirectUrl: user.role === 'Student' ? 'user.html' : user.role === 'Instructor' ? 'instructor.html' : 'dashtypex.html' };
};

export const mockLogout = () => {
  localStorage.removeItem('gliimu_user');
  return { success: true };
};

export const getCurrentUser = () => {
  const user = localStorage.getItem('gliimu_user');
  return user ? JSON.parse(user) : null;
};

// Wallet
export const mockGetWallet = async (username) => {
  await delay();
  const user = mockUsers.student;
  return { success: true, balance: user.walletBalance, transactions: user.transactions };
};

// Library
export const mockGetMaterials = async () => {
  await delay();
  return { success: true, materials: mockLibrary };
};

// Hub
export const mockGetHubItems = async () => {
  await delay();
  return { success: true, items: mockHub };
};

// Forum/Chat
export const mockGetMessages = async () => {
  await delay();
  return { success: true, messages: mockMessages };
};

export const mockSendMessage = async (text, sender, senderName) => {
  await delay();
  const newMessage = {
    id: `msg_${Date.now()}`,
    sender,
    senderName,
    text,
    type: 'text',
    timestamp: new Date().toISOString()
  };
  return { success: true, message: newMessage };
};

export const mockGetOnlineUsers = async () => {
  await delay();
  return { success: true, users: mockOnlineUsers };
};

// Students (for instructor)
export const mockGetMyStudents = async () => {
  await delay();
  const instructor = mockUsers.instructor;
  return { success: true, students: instructor.students };
};

// Assignments (for instructor)
export const mockGetAssignments = async () => {
  await delay();
  const instructor = mockUsers.instructor;
  return { success: true, assignments: instructor.assignments };
};

// Dashboard stats (for admin)
export const mockGetStats = async () => {
  await delay();
  return {
    success: true,
    stats: {
      totalStudents: 45,
      totalStaff: 8,
      pendingPayments: 125000,
      revenue: 450000
    }
  };
};