// ============================================
// HANDLE LOGOUT - FIXED
// ============================================
async function handleLogout() {
    console.log('Logging out...');
    
    try {
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Supabase sign out error:', error);
            showToast(error.message || 'Failed to sign out', 'error');
            return;
        }
        
        // Clear all localStorage items
        localStorage.removeItem('glimu_user');
        localStorage.removeItem('supabase_token');
        localStorage.removeItem('glimu_wallet');
        localStorage.removeItem('glimu_transactions');
        localStorage.removeItem('glimu_pending_payments');
        localStorage.removeItem('savedLibraryItems');
        localStorage.removeItem('recentlyViewed');
        
        showToast('Signed out successfully', 'success');
        
        // Redirect to home page
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1000);
        
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to sign out', 'error');
    }
}
