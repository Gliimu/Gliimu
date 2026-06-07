// ============================================
// APPLICATION.JS - Multi-step form with Supabase
// ============================================

import { supabase } from '../modules/supabase.js';
import { showToast } from '../modules/toast.js';

// DOM Elements
const form = document.getElementById('applicationForm');
const steps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-step');
let currentStep = 1;
const totalSteps = 3;

// Generate unique passkey
function generatePasskey() {
    const prefix = 'GLM';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// Update progress bar
function updateProgress(step) {
    progressSteps.forEach((progressStep, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            progressStep.classList.add('completed');
            progressStep.classList.remove('active');
        } else if (stepNum === step) {
            progressStep.classList.add('active');
            progressStep.classList.remove('completed');
        } else {
            progressStep.classList.remove('active', 'completed');
        }
    });
}

// Show step
function showStep(step) {
    steps.forEach((stepElement, index) => {
        if (index + 1 === step) {
            stepElement.classList.add('active');
        } else {
            stepElement.classList.remove('active');
        }
    });
    updateProgress(step);
    currentStep = step;
    
    // Scroll to top of form
    document.querySelector('.application-card').scrollIntoView({ behavior: 'smooth' });
}

// Next step
function nextStep() {
    if (validateStep(currentStep)) {
        if (currentStep < totalSteps) {
            showStep(currentStep + 1);
        }
    }
}

// Previous step
function prevStep() {
    if (currentStep > 1) {
        showStep(currentStep - 1);
    }
}

// Validate current step
function validateStep(step) {
    const currentStepElement = document.querySelector(`.form-step[data-step="${step}"]`);
    const requiredFields = currentStepElement.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.style.borderColor = '#ef4444';
            showToast(`Please fill in ${field.previousElementSibling?.textContent || 'all required fields'}`, 'error');
        } else {
            field.style.borderColor = '';
        }
    });
    
    // Special validation for step 2 - email format
    if (step === 2 && isValid) {
        const email = document.getElementById('email').value;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            isValid = false;
            showToast('Please enter a valid email address', 'error');
        }
        
        const phone = document.getElementById('phone').value;
        const phoneRegex = /^[0-9]{10,11}$/;
        if (!phoneRegex.test(phone.replace(/\D/g, ''))) {
            isValid = false;
            showToast('Please enter a valid phone number (10-11 digits)', 'error');
        }
    }
    
    return isValid;
}

// Show/hide institution field based on education level
function initEducationLevelListener() {
    const educationSelect = document.getElementById('educationLevel');
    const institutionGroup = document.getElementById('institutionGroup');
    
    if (educationSelect && institutionGroup) {
        educationSelect.addEventListener('change', () => {
            const value = educationSelect.value;
            if (value === 'bsc' || value === 'masters' || value === 'phd' || value === 'ond') {
                institutionGroup.style.display = 'block';
                document.getElementById('institution').required = true;
            } else {
                institutionGroup.style.display = 'none';
                document.getElementById('institution').required = false;
            }
        });
    }
}

// Submit application to Supabase
async function submitApplication(formData) {
    const passkey = generatePasskey();
    const applicationId = `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const application = {
        id: applicationId,
        full_name: formData.fullName,
        date_of_birth: formData.dateOfBirth,
        gender: formData.gender,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        country: 'Nigeria',
        phone: formData.phone,
        email: formData.email,
        education_level: formData.educationLevel,
        institution: formData.institution || null,
        course_of_interest: formData.courseOfInterest,
        heard_from: formData.heardFrom || null,
        passkey: passkey,
        status: 'pending',
        submitted_at: new Date().toISOString()
    };
    
    try {
        const { data, error } = await supabase
            .from('applications')
            .insert([application])
            .select();
        
        if (error) throw error;
        
        // Store passkey in localStorage for tracking
        localStorage.setItem('last_application_passkey', passkey);
        localStorage.setItem('last_application_email', formData.email);
        
        return { success: true, passkey: passkey };
        
    } catch (error) {
        console.error('Submission error:', error);
        return { success: false, error: error.message };
    }
}

// Collect form data
function collectFormData() {
    return {
        fullName: document.getElementById('fullName').value,
        dateOfBirth: document.getElementById('dateOfBirth').value,
        gender: document.getElementById('gender').value,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        educationLevel: document.getElementById('educationLevel').value,
        institution: document.getElementById('institution').value,
        courseOfInterest: document.getElementById('courseOfInterest').value,
        heardFrom: document.getElementById('heardFrom').value
    };
}

// Show success modal
function showSuccessModal(passkey) {
    const modal = document.getElementById('successModal');
    const passkeyDisplay = document.getElementById('passkeyDisplay');
    
    passkeyDisplay.textContent = passkey;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Copy button functionality
    const copyBtn = document.getElementById('copyPasskeyBtn');
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(passkey);
        showToast('Passkey copied to clipboard!', 'success');
    };
    
    // Close modal
    const closeBtn = document.getElementById('closeSuccessModal');
    closeBtn.onclick = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        window.location.href = '/index.html';
    };
    
    // Close on outside click
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
            window.location.href = '/index.html';
        }
    };
}

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!validateStep(3)) return;
    
    const submitBtn = document.querySelector('.btn-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    const formData = collectFormData();
    const result = await submitApplication(formData);
    
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
    
    if (result.success) {
        showSuccessModal(result.passkey);
        form.reset();
        showStep(1);
    } else {
        showToast(result.error || 'Failed to submit application. Please try again.', 'error');
    }
});

// Navigation buttons
document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', nextStep);
});

document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', prevStep);
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showStep(1);
    initEducationLevelListener();
    
    // Add input event listeners to clear red borders
    document.querySelectorAll('input, select').forEach(field => {
        field.addEventListener('input', () => {
            field.style.borderColor = '';
        });
    });
});

// Prevent Enter key from submitting form prematurely
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !document.activeElement.classList.contains('btn-submit')) {
        e.preventDefault();
    }
});
