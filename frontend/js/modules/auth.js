// Auth Module - Handles login, logout, session management

// Mock login for development (no backend needed)
export const mockLogin = (username, password) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      let role = 'Student';
      let name = 'Demo Student';
      let redirectUrl = 'user.html';
      
      if (username.toLowerCase().includes('instructor')) {
        role = 'Instructor';
        name = 'Demo Instructor';
        redirectUrl = 'instructor.html';
      } else if (username.toLowerCase().includes('admin')) {
        role = 'Admin';
        name = 'Super Admin';
        redirectUrl = 'dashtypex.html';
      }
      
      const user = {
        id: 'demo_' + Date.now(),
        username: username,
        name: name,
        email: `${username}@gliimu.com`,
        role: role,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
        token: 'mock_token_' + Date.now()
      };
      
      localStorage.setItem('gliimu_user', JSON.stringify(user));
      resolve({ success: true, user, redirectUrl });
    }, 500);
  });
};

// Real login (when backend is ready)
export const login = async (username, password) => {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      localStorage.setItem('gliimu_user', JSON.stringify(data.userData));
      if (data.token) {
        data.userData.token = data.token;
        localStorage.setItem('gliimu_user', JSON.stringify(data.userData));
      }
    }
    
    return data;
  } catch (error) {
    console.error('Login error:', error);
    // Fallback to mock login if server is down
    return mockLogin(username, password);
  }
};

// Logout
export const logout = () => {
  localStorage.removeItem('gliimu_user');
  localStorage.removeItem('gliimu_avatar');
  window.location.href = 'index.html';
};

// Get current user from localStorage
export const getCurrentUser = () => {
  const user = localStorage.getItem('gliimu_user');
  return user ? JSON.parse(user) : null;
};

// Check if user is logged in
export const isLoggedIn = () => {
  return getCurrentUser() !== null;
};

// Get user role
export const getUserRole = () => {
  const user = getCurrentUser();
  return user ? user.role : null;
};

// Get auth token
export const getAuthToken = () => {
  const user = getCurrentUser();
  return user ? user.token : null;
};

// Update user avatar
export const updateAvatar = (avatarUrl) => {
  const user = getCurrentUser();
  if (user) {
    user.avatar = avatarUrl;
    localStorage.setItem('gliimu_user', JSON.stringify(user));
    localStorage.setItem('gliimu_avatar', avatarUrl);
  }
};

// Redirect based on role
export const redirectToDashboard = () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  const roleMap = {
    'Student': 'user.html',
    'Instructor': 'instructor.html',
    'Admin': 'dashtypex.html'
  };
  
  window.location.href = roleMap[user.role] || 'index.html';
};