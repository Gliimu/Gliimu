// frontend/index.js - Smart redirect for root page
(function() {
    // Check if user is logged in
    const checkAuth = async () => {
        // Check localStorage for existing session
        const gliimuUser = localStorage.getItem('gliimu_user');
        const supabaseSession = localStorage.getItem('sb-vsgvscemqtqgolrindcx-auth-token');
        
        if (gliimuUser || supabaseSession) {
            // User is logged in, redirect to hub
            window.location.replace('/hub');
            return true;
        }
        
        // Optional: Check with Supabase for valid session
        try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
                window.location.replace('/hub');
                return true;
            }
        } catch (e) {
            // No valid session, stay on marketing page
        }
        
        return false;
    };
    
    // Only run on root path
    if (window.location.pathname === '/' || window.location.pathname === '/index') {
        checkAuth();
    }
})();
