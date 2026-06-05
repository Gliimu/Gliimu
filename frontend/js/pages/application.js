// application.js - Multi-step application form with backend integration

// ============================================
// STEP NAVIGATION
// ============================================

let currentStep = 1;
const totalSteps = 3;

function nextStep() {
  if (validateCurrentStep()) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('completed');
    currentStep++;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');
    updateProgress();
  }
}

function prevStep() {
  document.getElementById(`step-${currentStep}`).classList.remove('active');
  document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('active');
  document.querySelector(`.step[data-step="${currentStep}"]`).classList.remove('completed');
  currentStep--;
  document.getElementById(`step-${currentStep}`).classList.add('active');
  document.querySelector(`.step[data-step="${currentStep}"]`).classList.add('active');
  updateProgress();
}

function updateProgress() {
  if (currentStep === 3) {
    updateReviewData();
  }
}

// ============================================
// VALIDATION
// ============================================

function validateCurrentStep() {
  const currentStepDiv = document.getElementById(`step-${currentStep}`);
  const requiredFields = currentStepDiv.querySelectorAll('[required]');
  let isValid = true;
  
  if (currentStep === 3) {
    const termsCheckbox = document.getElementById('termsCheckbox');
    if (!termsCheckbox || !termsCheckbox.checked) {
      alert('Please agree to the terms to continue.');
      return false;
    }
  }
  
  requiredFields.forEach(field => {
    if (!field.value || field.value.trim() === '') {
      field.reportValidity();
      isValid = false;
    }
  });
  
  if (currentStep === 1) {
    const email = document.getElementById('email').value;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      alert('Please enter a valid email address.');
      return false;
    }
  }
  
  return isValid;
}

// ============================================
// UPDATE REVIEW DATA
// ============================================

function updateReviewData() {
  const firstName = document.getElementById('firstName').value;
  const lastName = document.getElementById('lastName').value;
  document.getElementById('reviewName').textContent = `${firstName} ${lastName}`;
  document.getElementById('reviewEmail').textContent = document.getElementById('email').value;
  document.getElementById('reviewPhone').textContent = document.getElementById('phone').value;
  
  const educationSelect = document.getElementById('education');
  document.getElementById('reviewEducation').textContent = educationSelect.options[educationSelect.selectedIndex]?.text || '—';
  
  const experienceSelect = document.getElementById('experience');
  document.getElementById('reviewExperience').textContent = experienceSelect.options[experienceSelect.selectedIndex]?.text || '—';
  
  const motivation = document.getElementById('motivation').value;
  document.getElementById('reviewMotivation').textContent = motivation.length > 100 ? motivation.substring(0, 100) + '...' : motivation;
}

// ============================================
// FORM SUBMISSION TO BACKEND
// ============================================

const API_BASE_URL = 'https://gliimu.onrender.com/api';

async function submitApplication() {
  const termsCheckbox = document.getElementById('termsCheckbox');
  if (!termsCheckbox || !termsCheckbox.checked) {
    alert('Please agree to the terms to submit your application.');
    return;
  }
  
  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  
  // Collect form data
  const formData = {
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    dob: document.getElementById('dob').value,
    gender: document.getElementById('gender').value,
    education: document.getElementById('education').value,
    experience: document.getElementById('experience').value,
    motivation: document.getElementById('motivation').value,
    source: document.getElementById('source').value,
    program: 'Full-Stack Media Production',
    timestamp: new Date().toISOString()
  };
  
  try {
    // Try to send to real backend
    const response = await fetch(`${API_BASE_URL}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Save to localStorage as backup
      const applications = JSON.parse(localStorage.getItem('gliimu_applications') || '[]');
      applications.push({ id: 'app_' + Date.now(), ...formData, status: 'pending' });
      localStorage.setItem('gliimu_applications', JSON.stringify(applications));
      
      showSuccessModal(formData);
      resetForm();
    } else {
      throw new Error(result.message || 'Submission failed');
    }
    
  } catch (error) {
    console.error('Backend error:', error);
    
    // Fallback to localStorage only
    const applications = JSON.parse(localStorage.getItem('gliimu_applications') || '[]');
    const newId = 'app_' + Date.now();
    applications.push({ id: newId, ...formData, status: 'pending', createdAt: new Date().toISOString() });
    localStorage.setItem('gliimu_applications', JSON.stringify(applications));
    
    showSuccessModal(formData);
    resetForm();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function resetForm() {
  document.getElementById('firstName').value = '';
  document.getElementById('lastName').value = '';
  document.getElementById('email').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('dob').value = '';
  document.getElementById('gender').value = '';
  document.getElementById('education').value = '';
  document.getElementById('experience').value = '';
  document.getElementById('motivation').value = '';
  document.getElementById('source').value = '';
  document.getElementById('termsCheckbox').checked = false;
}

function showSuccessModal(formData) {
  const modal = document.getElementById('successModal');
  const messageDiv = document.getElementById('successMessage');
  
  if (messageDiv) {
    messageDiv.innerHTML = `
      <p>Thank you, ${formData.firstName}!</p>
      <p>Your application has been received.</p>
      <br>
      <strong>Next steps:</strong><br>
      1. Check your email at <strong>${formData.email}</strong> for confirmation<br>
      2. We'll contact you within 48 hours<br>
      3. Complete your enrollment<br>
      <br>
      <small style="opacity: 0.7;">Reference: APP-${Date.now().toString().slice(-8)}</small>
    `;
  }
  
  if (modal) {
    modal.classList.add('is-visible');
  }
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) {
    modal.classList.remove('is-visible');
  }
  window.location.href = 'index.html';
}

// ============================================
// EXPOSE GLOBALLY
// ============================================
window.nextStep = nextStep;
window.prevStep = prevStep;
window.submitApplication = submitApplication;
window.closeSuccessModal = closeSuccessModal;
