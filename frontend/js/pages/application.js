// application.js - Privacy-first application form

let generatedPasskey = '';
let currentStep = 1;

// ============================================
// GENERATE RANDOM PASSKEY (SENSELESS PHRASE)
// ============================================

function generatePasskey() {
  const words = [
    'MOON', 'SUN', 'STAR', 'CLOUD', 'WIND', 'RAIN', 'FIRE', 'WATER',
    'EARTH', 'SKY', 'BLUE', 'RED', 'GOLD', 'SILVER', 'BRIGHT', 'DARK',
    'PEACE', 'HOPE', 'JOY', 'LOVE', 'KIND', 'WISE', 'BOLD', 'CALM',
    'EAGLE', 'LION', 'WOLF', 'FOX', 'BEAR', 'HAWK', 'OWL', 'DEER'
  ];
  const numbers = Math.floor(Math.random() * 9000 + 1000);
  const word1 = words[Math.floor(Math.random() * words.length)];
  const word2 = words[Math.floor(Math.random() * words.length)];
  const word3 = words[Math.floor(Math.random() * words.length)];
  
  return `${word1}-${word2}-${word3}-${numbers}`;
}

// ============================================
// STEP NAVIGATION
// ============================================

function nextStep() {
  if (currentStep === 1 && validateStep1()) {
    document.getElementById('step-1').classList.remove('active');
    document.querySelector('.step[data-step="1"]').classList.remove('active');
    document.querySelector('.step[data-step="1"]').classList.add('completed');
    currentStep = 2;
    document.getElementById('step-2').classList.add('active');
    document.querySelector('.step[data-step="2"]').classList.add('active');
  } else if (currentStep === 2 && validateStep2()) {
    document.getElementById('step-2').classList.remove('active');
    document.querySelector('.step[data-step="2"]').classList.remove('active');
    document.querySelector('.step[data-step="2"]').classList.add('completed');
    currentStep = 3;
    document.getElementById('step-3').classList.add('active');
    document.querySelector('.step[data-step="3"]').classList.add('active');
    updateReviewData();
  }
}

function prevStep() {
  if (currentStep === 2) {
    document.getElementById('step-2').classList.remove('active');
    document.querySelector('.step[data-step="2"]').classList.remove('active');
    document.querySelector('.step[data-step="2"]').classList.remove('completed');
    currentStep = 1;
    document.getElementById('step-1').classList.add('active');
    document.querySelector('.step[data-step="1"]').classList.add('active');
  } else if (currentStep === 3) {
    document.getElementById('step-3').classList.remove('active');
    document.querySelector('.step[data-step="3"]').classList.remove('active');
    document.querySelector('.step[data-step="3"]').classList.remove('completed');
    currentStep = 2;
    document.getElementById('step-2').classList.add('active');
    document.querySelector('.step[data-step="2"]').classList.add('active');
  }
}

// ============================================
// VALIDATION
// ============================================

function validateStep1() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const username = document.getElementById('username').value.trim();
  const birthMonth = document.getElementById('birthMonth').value;
  const birthDay = document.getElementById('birthDay').value;
  const ageRange = document.getElementById('ageRange').value;
  const applicationType = document.getElementById('applicationType').value;
  
  if (!firstName || !lastName) {
    alert('Please enter your full name.');
    return false;
  }
  
  if (!username) {
    alert('Please choose a username.');
    return false;
  }
  
  if (username.length < 3) {
    alert('Username must be at least 3 characters.');
    return false;
  }
  
  if (!birthMonth || !birthDay) {
    alert('Please select your birth month and day.');
    return false;
  }
  
  if (!ageRange) {
    alert('Please select your age range.');
    return false;
  }
  
  if (!applicationType) {
    alert('Please select how you want to apply.');
    return false;
  }
  
  // Check username availability (mock)
  const existingUsers = JSON.parse(localStorage.getItem('gliimu_users') || '[]');
  if (existingUsers.some(u => u.username === username)) {
    alert('This username is already taken. Please choose another.');
    return false;
  }
  
  return true;
}

function validateStep2() {
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  
  if (!password) {
    alert('Please create a password.');
    return false;
  }
  
  if (password.length < 6) {
    alert('Password must be at least 6 characters.');
    return false;
  }
  
  if (password !== confirmPassword) {
    alert('Passwords do not match.');
    return false;
  }
  
  // Generate passkey on successful validation
  if (!generatedPasskey) {
    generatedPasskey = generatePasskey();
    document.getElementById('passkeyPhrase').textContent = generatedPasskey;
    document.getElementById('passkeySection').style.display = 'block';
  }
  
  return true;
}

// ============================================
// UPDATE REVIEW DATA
// ============================================

function updateReviewData() {
  const firstName = document.getElementById('firstName').value;
  const lastName = document.getElementById('lastName').value;
  document.getElementById('reviewName').textContent = `${firstName} ${lastName}`;
  document.getElementById('reviewUsername').textContent = document.getElementById('username').value;
  
  const month = document.getElementById('birthMonth').options[document.getElementById('birthMonth').selectedIndex]?.text || '';
  const day = document.getElementById('birthDay').value;
  document.getElementById('reviewBirthday').textContent = `${month} ${day}`;
  
  const ageRangeSelect = document.getElementById('ageRange');
  document.getElementById('reviewAgeRange').textContent = ageRangeSelect.options[ageRangeSelect.selectedIndex]?.text || '';
  
  const appTypeSelect = document.getElementById('applicationType');
  const appTypeText = appTypeSelect.options[appTypeSelect.selectedIndex]?.text || '';
  document.getElementById('reviewAppType').textContent = appTypeText;
  
  document.getElementById('reviewPasskeyPreview').textContent = generatedPasskey || 'Will be generated';
}

// ============================================
// DOWNLOAD PASSKEY AS PDF
// ============================================

function downloadPasskey() {
  const username = document.getElementById('username').value || 'User';
  const passkey = generatedPasskey;
  
  const content = `
    GLIIMU ACCOUNT RECOVERY PASSKEY
    ===============================
    
    Username: ${username}
    Passkey: ${passkey}
    Generated: ${new Date().toLocaleString()}
    
    INSTRUCTIONS:
    Keep this passkey in a safe place.
    Use it to recover your account if you forget your password.
    
    Never share this passkey with anyone.
    
    Gliimu Institute of Media Technologies
  `;
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gliimu_passkey_${username}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  alert('Passkey saved! Keep this file safe. You\'ll need it to recover your account.');
}

// ============================================
// FORM SUBMISSION
// ============================================

async function submitApplication() {
  const termsCheckbox = document.getElementById('termsCheckbox');
  if (!termsCheckbox || !termsCheckbox.checked) {
    alert('Please agree to the Terms & Conditions.');
    return;
  }
  
  const btn = document.getElementById('submitBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
  
  // Collect form data
  const userData = {
    id: 'user_' + Date.now(),
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    passkey: generatedPasskey,
    birthMonth: document.getElementById('birthMonth').value,
    birthDay: document.getElementById('birthDay').value,
    ageRange: document.getElementById('ageRange').value,
    applicationType: document.getElementById('applicationType').value,
    role: mapApplicationTypeToRole(document.getElementById('applicationType').value),
    createdAt: new Date().toISOString(),
    status: 'active'
  };
  
  try {
    // Save to localStorage (mock backend)
    const users = JSON.parse(localStorage.getItem('gliimu_users') || '[]');
    users.push(userData);
    localStorage.setItem('gliimu_users', JSON.stringify(users));
    
    // Auto-login
    localStorage.setItem('gliimu_user', JSON.stringify({
      id: userData.id,
      username: userData.username,
      name: `${userData.firstName} ${userData.lastName}`,
      role: userData.role,
      avatar: `https://ui-avatars.com/api/?name=${userData.firstName}+${userData.lastName}&background=random&color=fff`
    }));
    
    // Show success modal
    showSuccessModal(userData);
    
  } catch (error) {
    console.error('Submission error:', error);
    alert('There was an error creating your account. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function mapApplicationTypeToRole(type) {
  const roleMap = {
    'student': 'Student',
    'partner': 'Partner',
    'instructor': 'Instructor',
    'other': 'Other'
  };
  return roleMap[type] || 'Other';
}

function showSuccessModal(userData) {
  const modal = document.getElementById('successModal');
  document.getElementById('successUsername').textContent = userData.username;
  document.getElementById('successPasskey').textContent = userData.passkey;
  
  if (modal) {
    modal.classList.add('is-visible');
  }
}

function goToDashboard() {
  window.location.href = 'dashboard.html';
}

// ============================================
// EXPOSE GLOBALLY
// ============================================
window.nextStep = nextStep;
window.prevStep = prevStep;
window.submitApplication = submitApplication;
window.downloadPasskey = downloadPasskey;
window.goToDashboard = goToDashboard;
window.showForgotPasskey = showForgotPasskey;
window.resetPasswordWithPasskey = resetPasswordWithPasskey;
