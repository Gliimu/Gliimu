import { store } from '../store.js';

export default {
  title: 'Settings',
  template: `
    <div class="card">
      <h2>Account Settings</h2>
      <p>Manage your profile, password, and preferences.</p>
      <br>
      <button id="logout-btn" class="btn-primary">Log Out</button>
    </div>
  `,
  init() {
    document.getElementById('logout-btn').addEventListener('click', () => {
      store.signOut();
    });
  }
};
