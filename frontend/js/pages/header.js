// ============================================
// Add this to your existing header.js
// ============================================

import { signIn, signUp, signOut, getCurrentUser, isAuthenticated, redirectBasedOnRole } from '../modules/auth.js';
import { showToast } from '../modules/toast.js';

// Initialize login modal functionality
function initLoginModal() {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    
    // Open modal function
    window.openLoginModal = function() {
        // Reset forms
        document.getElementById('loginFormContainer').style.display = 'block';
        document.getElementById('signupFormContainer').style.display = 'none';
        document.getElementById('loginForm').reset();
        document.getElementById('signupForm').reset();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    
    // Close modal function
    window.closeLoginModal = function() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    // Close on X button
    const closeBtn = document.getElementById('closeLoginModal');
    if (closeBtn) {
        closeBtn.onclick = () => window.closeLoginModal();
    }
    
    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) window.closeLoginModal();
    };
    
    // Switch to signup form
    const showSignupBtn = document.getElementById('showSignupBtn');
    if (showSignupBtn) {
        showSignupBtn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('loginFormContainer').style.display = 'none';
            document.getElementById('signupFormContainer').style.display = 'block';
        };
    }
    
    // Switch to login form
    const showLoginBtn = document.getElementById('showLoginBtn');
    if (showLoginBtn) {
        showLoginBtn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('signupFormContainer').style.display = 'none';
            document.getElementById('loginFormContainer').style.display = 'block';
        };
    }
    
    // Handle login form submission
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            await signIn(email, password);
        };
    }
    
    // Handle signup form submission
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('signupName').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupConfirmPassword').value;
            await signUp(name, email, password, confirmPassword);
        };
    }
}

// Update header UI based on auth state
function updateHeaderAuth() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    
    const user = getCurrentUser();
    
    if (user) {
        // User is logged in - show profile dropdown
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=fbb040&color=fff`;
        
        navRight.innerHTML = `
            <div class="profile-wrapper">
                <img src="${avatarUrl}" alt="Profile" class="header-profile-img">
                <span class="dropdown-arrow"><i class="fas fa-chevron-down"></i></span>
                <div class="profile-dropdown">
                    <a href="${user.role === 'admin' ? '/admin-dashboard.html' : '/dashboard.html'}" class="dropdown-item">
                        <i class="fas fa-tachometer-alt"></i> Dashboard
                    </a>
                    <a href="#" onclick="window.logout()" class="dropdown-item">
                        <i class="fas fa-sign-out-alt"></i> Sign Out
                    </a>
                </div>
            </div>
            <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
                <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18">
                    <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" stroke-width="2"/>
                    <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/>
                    <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/>
                    <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/>
                    <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>
                </svg>
                <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none" stroke-width="2"/>
                </svg>
            </button>
        `;
        
        // Re-initialize theme toggle
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const newToggle = themeToggle.cloneNode(true);
            themeToggle.parentNode.replaceChild(newToggle, themeToggle);
            newToggle.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const isDark = document.body.classList.contains('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
        
        // Initialize profile dropdown
        const profileWrapper = document.querySelector('.profile-wrapper');
        if (profileWrapper) {
            const dropdown = profileWrapper.querySelector('.profile-dropdown');
            profileWrapper.onclick = (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('active');
            };
            document.onclick = () => dropdown.classList.remove('active');
        }
        
    } else {
        // User is not logged in - show sign in button
        navRight.innerHTML = `
            <a href="#" onclick="openLoginModal(); return false;" class="nav-btn primary">Sign in</a>
            <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">
                <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18">
                    <circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" stroke-width="2"/>
                    <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/>
                    <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/>
                    <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/>
                    <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>
                </svg>
                <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" fill="none" stroke-width="2"/>
                </svg>
            </button>
        `;
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const newToggle = themeToggle.cloneNode(true);
            themeToggle.parentNode.replaceChild(newToggle, themeToggle);
            newToggle.addEventListener('click', () => {
                document.body.classList.toggle('dark-mode');
                const isDark = document.body.classList.contains('dark-mode');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
    }
}

// Global logout function
window.logout = async () => {
    await signOut();
};

// Initialize everything when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    initLoginModal();
    updateHeaderAuth();
    initThemeFromStorage();
});

function initThemeFromStorage() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
}
