// application.js - Multi-step application form

// ============================================
// DEVICE FINGERPRINT (Prevents multiple signups)
// ============================================

function getDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.language,
    navigator.hardwareConcurrency || 'unknown',
    !!navigator.maxTouchPoints
  ];
  
  // Simple hash function
  let hash = 0;
  const str = components.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  
  return Math.abs(hash).toString(36);
}

function checkExistingApplication() {
  const fingerprint = getDeviceFingerprint();
  const submittedApps = JSON.parse(localStorage.getItem('gliimu_submitted_fingerprints') || '[]');
  
  if (submittedApps.includes(fingerprint)) {
    alert('You have already submitted an application from this device.\n\nIf you need to apply again, please contact support.');
    return true;
  }
  return false;
}

function recordApplicationSubmission() {
  const fingerprint = getDeviceFingerprint();
  const submittedApps = JSON.parse(localStorage.getItem('gliimu_submitted_fingerprints') || '[]');
  submittedApps.push(fingerprint);
  localStorage.setItem('gliimu_submitted_fingerprints', JSON.stringify(submittedApps));
}

// ============================================
// FORM STEP NAVIGATION
// ============================================

let currentStep = 1;
const totalSteps = 3;

function nextStep() {
  if (validateCurrentStep()) {
    document.getElementById(`step-${currentStep}`).classList.remove('active');
    document.getElementById(`step-nav-${currentStep}`).classList.remove('active');
    document.getElementById(`step-nav-${currentStep}`).classList.add('completed');
    currentStep++;
    document.getElementById(`step-${currentStep}`).classList.add('active');
    document.getElementById(`step-nav-${currentStep}`).classList.add('active');
    updateProgress();
  }
}

function prevStep() {
  document.getElementById(`step-${currentStep}`).classList.remove('active');
  document.getElementById(`step-nav-${currentStep}`).classList.remove('active');
  document.getElementById(`step-nav-${currentStep}`).classList.remove('completed');
  currentStep--;
  document.getElementById(`step-${currentStep}`).classList.add('active');
  document.getElementById(`step-nav-${currentStep}`).classList.add('active');
  updateProgress();
}

function updateProgress() {
  const percent = ((currentStep - 1) / (totalSteps - 1)) * 100;
  const progressBar = document.querySelector('.progress-bar-fill');
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
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
      alert('Please agree to the Terms & Conditions to continue.');
      return false;
    }
  }
  
  requiredFields.forEach(field => {
    if (!field.value || field.value.trim() === '') {
      field.reportValidity();
      isValid = false;
    }
  });
  
  // Special validation for Instructor courses
  if (currentStep === 1) {
    const appType = document.getElementById('applicationType');
    if (appType && appType.value === 'Instructor') {
      const checkedCourses = document.querySelectorAll('input[name="courses"]:checked');
      if (checkedCourses.length === 0) {
        alert('Please select at least one course you can teach.');
        isValid = false;
      }
    }
  }
  
  return isValid;
}

// ============================================
// DYNAMIC FORM FIELDS
// ============================================

function initDynamicFields() {
  const appTypeSelect = document.getElementById('applicationType');
  const trackContainer = document.getElementById('track-options-container');
  const trackLabel = document.getElementById('trackLabel');
  const referralSection = document.getElementById('referralSection');
  
  if (!appTypeSelect) return;
  
  appTypeSelect.addEventListener('change', function() {
    const value = this.value;
    trackContainer.innerHTML = '';
    
    // Show referral section for Student and Others
    if (value === 'Student' || value === 'Others') {
      referralSection.style.display = 'block';
    } else {
      referralSection.style.display = 'none';
      const refInput = document.getElementById('referralCode');
      if (refInput) refInput.value = '';
    }
    
    if (value === 'Student') {
      trackLabel.textContent = 'Select Track *';
      trackLabel.style.display = 'block';
      const select = document.createElement('select');
      select.className = 'input-field';
      select.name = 'track';
      select.id = 'modeSelect';
      select.required = true;
      select.innerHTML = `
        <option value="" disabled selected>-- Select Track --</option>
        <option value="media_track">🎬 Media Track (Video/Audio Production)</option>
        <option value="design_track">🎨 Design Track (Graphics/UI/UX)</option>
        <option value="tech_track">💻 Tech Track (Programming/Web)</option>
      `;
      trackContainer.appendChild(select);
      
    } else if (value === 'Instructor') {
      trackLabel.textContent = 'Select Courses to Teach *';
      trackLabel.style.display = 'block';
      
      const wrapper = document.createElement('div');
      wrapper.className = 'checkbox-group-container';
      
      const courses = [
        "Video Production", "Audio Production", "Animation", "Graphic Design",
        "UI/UX Design", "Web Development", "Programming (Python/JS)",
        "Cloud Computing", "Event Management", "Digital Marketing"
      ];
      
      courses.forEach((course, index) => {
        const item = document.createElement('div');
        item.className = 'checkbox-item';
        item.innerHTML = `
          <input type="checkbox" name="courses" id="course-${index}" value="${course}">
          <label for="course-${index}">${course}</label>
        `;
        wrapper.appendChild(item);
      });
      
      trackContainer.appendChild(wrapper);
      
    } else if (value === 'Others') {
      trackLabel.textContent = 'Specify Your Role';
      trackLabel.style.display = 'block';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'input-field';
      input.name = 'otherRole';
      input.id = 'otherRoleInput';
      input.placeholder = 'e.g. Parent, Partner, Vendor, Consultant...';
      input.required = true;
      trackContainer.appendChild(input);
    } else {
      trackLabel.style.display = 'none';
    }
  });
}

// ============================================
// FORM SUBMISSION
// ============================================

async function submitApplication() {
  // Check for existing application from this device
  if (checkExistingApplication()) {
    return;
  }
  
  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  
  // Collect form data
  const category = document.getElementById('applicationType').value;
  const formData = {
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    category: category,
    motivation: document.querySelector('textarea[name="motivation"]').value,
    source: document.querySelector('select[name="source"]').value,
    referralCode: document.getElementById('referralCode')?.value || null,
    fingerprint: getDeviceFingerprint(),
    timestamp: new Date().toISOString()
  };
  
  // Handle track based on category
  if (category === 'Instructor') {
    const checkboxes = document.querySelectorAll('input[name="courses"]:checked');
    formData.courses = Array.from(checkboxes).map(cb => cb.value);
    formData.track = null;
    formData.otherRole = null;
  } else if (category === 'Others') {
    const roleInput = document.getElementById('otherRoleInput');
    formData.otherRole = roleInput ? roleInput.value.trim() : null;
    formData.track = 'others';
    formData.courses = [];
  } else {
    formData.track = document.getElementById('modeSelect')?.value || null;
    formData.courses = [];
    formData.otherRole = null;
  }
  
  // Generate username and passcode
  const timestamp = Date.now();
  const randomNum = Math.floor(Math.random() * 1000);
  formData.generatedUsername = `${formData.firstName}_${formData.lastName}_${timestamp.toString().slice(-4)}`.toUpperCase();
  formData.generatedPasscode = `GLI-${timestamp.toString().slice(-6)}-${randomNum}`;
  
  // Store in localStorage (mock backend)
  const applications = JSON.parse(localStorage.getItem('gliimu_applications') || '[]');
  applications.push(formData);
  localStorage.setItem('gliimu_applications', JSON.stringify(applications));
  
  // Record fingerprint to prevent duplicate
  recordApplicationSubmission();
  
  // Show success modal
  showSuccessModal(formData);
  
  btn.disabled = false;
  btn.innerHTML = originalText;
}

function showSuccessModal(data) {
  const modal = document.getElementById('successModal');
  const usernameSpan = document.getElementById('generatedUsername');
  const passcodeSpan = document.getElementById('generatedPasscode');
  
  if (usernameSpan) usernameSpan.textContent = data.generatedUsername;
  if (passcodeSpan) passcodeSpan.textContent = data.generatedPasscode;
  
  if (modal) modal.classList.add('is-visible');
  
  // Reset form after modal is shown
  document.getElementById('applicationForm').reset();
  resetFormSteps();
}

function resetFormSteps() {
  currentStep = 1;
  document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
  document.querySelectorAll('.step-item').forEach(step => {
    step.classList.remove('active', 'completed');
  });
  document.getElementById('step-1').classList.add('active');
  document.getElementById('step-nav-1').classList.add('active');
  
  // Reset dynamic fields
  const trackContainer = document.getElementById('track-options-container');
  if (trackContainer) {
    trackContainer.innerHTML = `
      <select class="input-field disabled-input" name="track" id="modeSelect" disabled>
        <option value="" disabled selected>Please select an application type first</option>
      </select>
    `;
  }
  const referralSection = document.getElementById('referralSection');
  if (referralSection) referralSection.style.display = 'none';
}

function closeSuccessModal() {
  const modal = document.getElementById('successModal');
  if (modal) modal.classList.remove('is-visible');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initDynamicFields();
  
  // Make functions global for onclick
  window.nextStep = nextStep;
  window.prevStep = prevStep;
  window.submitApplication = submitApplication;
  window.closeSuccessModal = closeSuccessModal;
});