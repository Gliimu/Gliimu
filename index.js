// frontend/index.js - Smart redirect for root page

// Import Supabase client
import { supabase } from './js/modules/supabase.js';

(function() {
    // Check if user is logged in
    const checkAuth = async () => {
        // Check localStorage for existing session
        const gliimuUser = localStorage.getItem('gliimu_user');
        
        if (gliimuUser) {
            // User is logged in, redirect to hub
            window.location.replace('/hub');
            return true;
        }
        
        // Check with Supabase for valid session
        try {
            const { data } = await supabase.auth.getSession();
            if (data?.session) {
                window.location.replace('/hub');
                return true;
            }
        } catch (e) {
            console.log('No active session:', e);
        }
        
        return false;
    };
    
    // Only run on root path
    if (window.location.pathname === '/' || window.location.pathname === '/index') {
        checkAuth();
    }
})();
