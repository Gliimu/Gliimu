// application.js - Multi-step application form

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
  // Update review data when reaching step 3
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
  
  // Check terms on step 3
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
  
  // Email validation on step 1
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
  // Personal Info
  const firstName = document.getElementById('firstName').value;
  const lastName = document.getElementById('lastName').value;
  document.getElementById('reviewName').textContent = `${firstName} ${lastName}`;
  document.getElementById('reviewEmail').textContent = document.getElementById('email').value;
  document.getElementById('reviewPhone').textContent = document.getElementById('phone').value;
  
  // Background
  const educationSelect = document.getElementById('education');
  const educationText = educationSelect.options[educationSelect.selectedIndex]?.text || '—';
  document.getElementById('reviewEducation').textContent = educationText;
  
  const experienceSelect = document.getElementById('experience');
  const experienceText = experienceSelect.options[experienceSelect.selectedIndex]?.text || '—';
  document.getElementById('reviewExperience').textContent = experienceText;
}

// ============================================
// FORM SUBMISSION
// ============================================

async function submitApplication() {
  // Validate terms again
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
    timestamp: new Date().toISOString()
  };
  
  try {
    // Save to localStorage (mock backend)
    const applications = JSON.parse(localStorage.getItem('gliimu_applications') || '[]');
    const newId = 'app_' + Date.now();
    applications.push({ id: newId, ...formData, status: 'pending', createdAt: new Date().toISOString() });
    localStorage.setItem('gliimu_applications', JSON.stringify(applications));
    
    // Show success modal
    showSuccessModal();
    
    // Reset form
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
    termsCheckbox.checked = false;
    
  } catch (error) {
    console.error('Submission error:', error);
    alert('There was an error submitting your application. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ============================================
// SUCCESS MODAL
// ============================================

function showSuccessModal() {
  const modal = document.getElementById('successModal');
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
