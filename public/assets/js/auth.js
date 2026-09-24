import { supabase } from '../../shared/js/config.js';

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.auth-tab');
  const forms = document.querySelectorAll('.auth-form');

  // Tab Switching Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      forms.forEach(form => {
        form.classList.remove('active');
        if (form.id === `${targetTab}-form`) {
          form.classList.add('active');
        }
      });
    });
  });

  // Handle Log In
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert('Error logging in: ' + error.message);
    } else {
      // Redirect to dashboard on success
      window.location.href = '/dashboard/index.html';
    }
  });

  // Handle Join Us (Sign Up)
  const joinForm = document.getElementById('join-form');
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('join-email').value;
    const password = document.getElementById('join-password').value;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert('Error signing up: ' + error.message);
    } else {
      alert('Success! Check your email for the verification link.');
      // If you turn off email verification in Supabase,
      // you can automatically log them in here instead.
    }
  });
});
