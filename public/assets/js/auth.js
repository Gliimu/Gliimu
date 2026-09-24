// Auth tab switching and Supabase logic
// Tab Switching Logic
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update active states for tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Show corresponding form
      forms.forEach(form => {
        form.classList.remove('active');
        if (form.id === `${targetTab}-form`) {
          form.classList.add('active');
        }
      });
    });
  });

  // Handle Form Submits (We will wire this to Supabase later)
  const loginForm = document.getElementById('login-form');
  const joinForm = document.getElementById('join-form');

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('Login Submitted - Wire to Supabase next.');
    // window.location.href = '/dashboard/index.html'; 
  });

  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    console.log('Join Submitted - Wire to Supabase next.');
    // window.location.href = '/dashboard/index.html'; 
  });
});
