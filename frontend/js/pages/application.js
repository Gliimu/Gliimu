// ============================================
// APPLICATION.JS - Privacy-focused application
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// Generate username from full name
function generateUsername(fullName) {
    const cleanName = fullName.toLowerCase().trim();
    const nameParts = cleanName.split(' ');
    let username = nameParts[0];
    
    if (nameParts.length > 1) {
        username += '.' + nameParts.slice(1).join('');
    }
    
    // Remove special characters
    username = username.replace(/[^a-z0-9.]/g, '');
    
    // Add random suffix for uniqueness
    const randomSuffix = Math.floor(Math.random() * 1000);
    return `${username}${randomSuffix}`;
}

// Generate recovery phrase
function generateRecoveryPhrase() {
    const words = [
        'blue', 'ocean', 'golden', 'sunset', 'brave', 'tiger', 'swift', 'eagle',
        'calm', 'river', 'mountain', 'forest', 'storm', 'thunder', 'peace', 'light',
        'shadow', 'dream', 'wonder', 'magic', 'silent', 'wisdom', 'courage', 'honor'
    ];
    
    const phrase = [];
    for (let i = 0; i < 6; i++) {
        const randomIndex = Math.floor(Math.random() * words.length);
        phrase.push(words[randomIndex]);
    }
    return phrase.join('-');
}

// Hash password (simple - in production use bcrypt on backend)
async function hashPassword(password) {
    // This is a simple hash for demo
    // In production, you should hash on the backend
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Save application to Supabase
async function saveApplication(applicationData) {
    const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const application = {
        id: applicationId,
        full_name: applicationData.fullName,
        birth_day: applicationData.birthDay,
        birth_month: applicationData.birthMonth,
        role: applicationData.role,
        password_hash: applicationData.passwordHash,
        username: applicationData.username,
        recovery_phrase: applicationData.recoveryPhrase,
        email: applicationData.email || null,
        phone: applicationData.phone || null,
        status: 'pending',
        submitted_at: new Date().toISOString()
    };
    
    console.log('Saving application:', { ...application, password_hash: '[HIDDEN]' });
    
    try {
        const { data, error } = await supabase
            .from('applications')
            .insert([application])
            .select();
        
        if (error) {
            console.error('Supabase error:', error);
            throw error;
        }
        
        console.log('Application saved:', data);
        
        // Also store in localStorage as backup
        const pendingApps = JSON.parse(localStorage.getItem('pending_applications') || '[]');
        pendingApps.push({
            ...application,
            submittedAt: new Date().toISOString(),
            password_hash: applicationData.password // Store plain for display only
        });
        localStorage.setItem('pending_applications', JSON.stringify(pendingApps));
        
        return { success: true, data: data[0] };
        
    } catch (error) {
        console.error('Save error:', error);
        return { success: false, error: error.message };
    }
}

// Generate PDF with credentials
function generatePDF(userData) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(44, 47, 120);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text('Gliimu Institute', pageWidth / 2, 25, { align: 'center' });
    
    // Title
    doc.setTextColor(44, 47, 120);
    doc.setFontSize(16);
    doc.text('Account Credentials', pageWidth / 2, 60, { align: 'center' });
    
    // Important Note
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('⚠️ IMPORTANT: Save this document securely', pageWidth / 2, 75, { align: 'center' });
    
    // Credentials
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('Your Account Details:', 20, 95);
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Full Name: ${userData.fullName}`, 20, 110);
    doc.text(`Username: ${userData.username}`, 20, 120);
    doc.text(`Password: ${userData.password}`, 20, 130);
    doc.text(`Recovery Phrase: ${userData.recoveryPhrase}`, 20, 140);
    doc.text(`Role: ${userData.role}`, 20, 150);
    
    // Warning
    doc.setTextColor(200, 0, 0);
    doc.setFontSize(10);
    doc.text('❗ Keep this recovery phrase safe!', 20, 175);
    doc.text('❗ You will need it to reset your password if you forget it.', 20, 185);
    doc.text('❗ This information will not be shown again.', 20, 195);
    
    // Footer
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 270);
    doc.text('© Gliimu Institute of Media Technologies Ltd.', pageWidth / 2, 280, { align: 'center' });
    
    // Save PDF
    doc.save(`Gliimu_Credentials_${userData.username}.pdf`);
}

// Handle form submission
const form = document.getElementById('applicationForm');
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Get form values
        const fullName = document.getElementById('fullName').value.trim();
        const birthDay = parseInt(document.getElementById('birthDay').value);
        const birthMonth = parseInt(document.getElementById('birthMonth').value);
        const role = document.getElementById('role').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Validation
        if (!fullName) {
            showToast('Please enter your full name', 'error');
            return;
        }
        
        if (!birthDay || !birthMonth) {
            showToast('Please select your birth day and month', 'error');
            return;
        }
        
        if (!role) {
            showToast('Please select your role', 'error');
            return;
        }
        
        if (password.length < 8) {
            showToast('Password must be at least 8 characters', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }
        
        // Generate credentials
        const username = generateUsername(fullName);
        const recoveryPhrase = generateRecoveryPhrase();
        const passwordHash = await hashPassword(password);
        
        const applicationData = {
            fullName,
            birthDay,
            birthMonth,
            role,
            password,
            passwordHash,
            username,
            recoveryPhrase
        };
        
        // Show loading state
        const submitBtn = document.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        submitBtn.disabled = true;
        
        // Save to Supabase
        const result = await saveApplication(applicationData);
        
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
        
        if (result.success) {
            // Display credentials in modal
            document.getElementById('displayUsername').textContent = username;
            document.getElementById('displayRecoveryPhrase').textContent = recoveryPhrase;
            document.getElementById('displayPassword').textContent = password;
            
            // Store for PDF generation
            window.currentCredentials = {
                fullName,
                username,
                password,
                recoveryPhrase,
                role
            };
            
            // Show modal
            const modal = document.getElementById('successModal');
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Clear form
            form.reset();
            
            showToast('Account created successfully!', 'success');
        } else {
            showToast(result.error || 'Failed to create account. Please try again.', 'error');
        }
    });
}

// PDF Download
const downloadBtn = document.getElementById('downloadPdfBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        if (window.currentCredentials) {
            generatePDF(window.currentCredentials);
            showToast('PDF downloaded! Save it somewhere safe.', 'success');
        }
    });
}

// Modal close
const closeModalBtn = document.getElementById('closeSuccessModal');
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        const modal = document.getElementById('successModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });
}

// Close modal on outside click
window.onclick = (e) => {
    const modal = document.getElementById('successModal');
    if (e.target === modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
};
