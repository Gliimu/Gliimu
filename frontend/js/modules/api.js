// API Module - Handles all fetch requests to backend

const API_BASE_URL = 'http://127.0.0.1:3000/api';

// Helper function to get auth token
function getAuthToken() {
  const user = localStorage.getItem('gliimu_user');
  if (user) {
    const userData = JSON.parse(user);
    return userData.token || null;
  }
  return null;
}

// Generic fetch function with error handling
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  const token = getAuthToken();
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  };
  
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth endpoints
export const login = (username, password) => {
  return apiRequest('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
};

export const register = (userData) => {
  return apiRequest('/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
};

// User endpoints
export const getCurrentUser = () => {
  return apiRequest('/users/me');
};

export const getMyStudents = () => {
  return apiRequest('/my-students', {
    method: 'POST',
    body: JSON.stringify({ username: JSON.parse(localStorage.getItem('gliimu_user'))?.username })
  });
};

export const getAllUsers = () => {
  return apiRequest('/all-users');
};

// Wallet endpoints
export const getWallet = (username) => {
  return apiRequest(`/wallet/${username}`);
};

export const requestTopUp = (formData) => {
  return fetch(`${API_BASE_URL}/wallet/request-topup`, {
    method: 'POST',
    body: formData
  }).then(res => res.json());
};

export const initiatePayment = (amount) => {
  const user = JSON.parse(localStorage.getItem('gliimu_user'));
  return apiRequest('/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({ username: user?.username, amount })
  });
};

export const withdrawFunds = (amount) => {
  const user = JSON.parse(localStorage.getItem('gliimu_user'));
  return apiRequest('/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify({ username: user?.username, amount })
  });
};

// Assignment endpoints
export const getAssignments = () => {
  return apiRequest('/assignments');
};

export const createAssignment = (assignmentData) => {
  return apiRequest('/assignments/create', {
    method: 'POST',
    body: JSON.stringify(assignmentData)
  });
};

export const submitAssignment = (formData) => {
  return fetch(`${API_BASE_URL}/assignments/submit`, {
    method: 'POST',
    body: formData
  }).then(res => res.json());
};

export const gradeSubmission = (submissionId, grade, feedback) => {
  return apiRequest('/assignments/grade', {
    method: 'POST',
    body: JSON.stringify({ submissionId, grade, feedback })
  });
};

// Library endpoints
export const getMaterials = () => {
  return apiRequest('/materials');
};

export const purchaseMaterial = (materialId) => {
  const user = JSON.parse(localStorage.getItem('gliimu_user'));
  return apiRequest('/library/purchase', {
    method: 'POST',
    body: JSON.stringify({ userId: user?.id, materialId })
  });
};

// Hub endpoints
export const getHubItems = () => {
  return apiRequest('/hub-items');
};

// Contact endpoint
export const submitContact = (formData) => {
  return apiRequest('/contact', {
    method: 'POST',
    body: JSON.stringify(formData)
  });
};

// Settings endpoints
export const getSettings = () => {
  return apiRequest('/settings');
};

export const updateSettings = (settings) => {
  return apiRequest('/settings/update', {
    method: 'POST',
    body: JSON.stringify(settings)
  });
};

// Notification endpoints
export const getNotifications = () => {
  return apiRequest('/notifications');
};

export const markNotificationsRead = () => {
  return apiRequest('/notifications/mark-read', { method: 'POST' });
};

// Reset password with recovery phrase + DOB verification
export const resetPassword = (data) => {
  return apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(data)
  });
};
