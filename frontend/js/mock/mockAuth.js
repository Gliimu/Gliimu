// Simple mock auth that works without backend
// Include this in your HTML files during development

window.mockAuth = {
  login: function(username, password) {
    // Demo: any login works
    const user = {
      username: username,
      name: username.includes('student') ? 'Demo Student' : username.includes('instructor') ? 'Demo Instructor' : 'Super Admin',
      email: `${username}@gliimu.com`,
      role: username.includes('student') ? 'Student' : username.includes('instructor') ? 'Instructor' : 'Admin',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`
    };
    
    localStorage.setItem('gliimu_user', JSON.stringify(user));
    
    // Redirect based on role
    let redirectUrl = 'user.html';
    if (user.role === 'Instructor') redirectUrl = 'instructor.html';
    if (user.role === 'Admin') redirectUrl = 'dashtypex.html';
    
    window.location.href = redirectUrl;
    return true;
  },
  
  logout: function() {
    localStorage.removeItem('gliimu_user');
    window.location.href = 'index.html';
  },
  
  getUser: function() {
    const user = localStorage.getItem('gliimu_user');
    return user ? JSON.parse(user) : null;
  }
};

// Override the openLoginModal function for demo
window.openLoginModal = function() {
  // For demo, just login directly
  const username = prompt('Demo Login\n\nEnter: student, instructor, or admin');
  if (username) {
    window.mockAuth.login(username, 'any');
  }
};