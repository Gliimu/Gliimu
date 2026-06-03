// contact.js - Modern Contact Page

// ============================================
// FORM SUBMISSION HANDLER
// ============================================

async function handleContactSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const btn = form.querySelector('.submit-btn-modern');
  const originalText = btn.innerHTML;
  
  // Get form values
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('contactEmail').value.trim();
  const phone = document.getElementById('phone')?.value.trim() || '';
  const subject = document.getElementById('subject').value;
  const message = document.getElementById('message').value.trim();
  
  // Validation
  if (!name || !email || !subject || !message) {
    showNotification('Please fill in all required fields.', 'error');
    return;
  }
  
  if (!isValidEmail(email)) {
    showNotification('Please enter a valid email address.', 'error');
    return;
  }
  
  // Disable button and show loading
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
  
  // Prepare data
  const formData = {
    name: name,
    email: email,
    phone: phone,
    subject: subject,
    message: message,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  };
  
  try {
    // Store in localStorage (mock backend)
    const messages = JSON.parse(localStorage.getItem('gliimu_contact_messages') || '[]');
    messages.unshift({ ...formData, id: Date.now(), status: 'unread' });
    localStorage.setItem('gliimu_contact_messages', JSON.stringify(messages.slice(0, 100)));
    
    // Show success
    showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
    form.reset();
    
    // Optional: Scroll to top of form
    document.querySelector('.form-side').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (error) {
    console.error('Error:', error);
    showNotification('Something went wrong. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ============================================
// EMAIL VALIDATION
// ============================================

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ============================================
// CUSTOM NOTIFICATION (Toast)
// ============================================

function showNotification(message, type = 'success') {
  // Remove existing notification
  const existingNotification = document.querySelector('.contact-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `contact-notification ${type}`;
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    <span>${message}</span>
  `;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 1000;
    background: ${type === 'success' ? 'var(--success)' : 'var(--danger)'};
    color: white;
    padding: 14px 24px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.9rem;
    font-weight: 500;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'all 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// Add animation style if not exists
if (!document.querySelector('#contact-notification-style')) {
  const style = document.createElement('style');
  style.id = 'contact-notification-style';
  style.textContent = `
    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================
// GOOGLE MAPS DIRECTIONS
// ============================================

function getDirections() {
  const address = encodeURIComponent('2 Sanusi Street, Gwarinpa, Abuja, Nigeria');
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${address}`, '_blank');
}

// ============================================
// INITIALIZATION
// ============================================

function initContactPage() {
  console.log('Modern contact page initialized');
  
  // Set up form submission
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.removeEventListener('submit', handleContactSubmit);
    contactForm.addEventListener('submit', handleContactSubmit);
  }
  
  // Set up directions button
  const directionsBtn = document.getElementById('getDirectionsBtn');
  if (directionsBtn) {
    directionsBtn.addEventListener('click', getDirections);
  }
  
  // Animate cards on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe info cards
  document.querySelectorAll('.info-card-modern').forEach((card, index) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(card);
  });
}

// Make functions global
window.getDirections = getDirections;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initContactPage);