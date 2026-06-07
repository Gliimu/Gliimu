// ============================================
// VARIABLE BONUS SYSTEM
// Run this on the 1st of every month
// ============================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // Use service role for cron jobs
);

// Bonus probabilities (weighted)
const BONUS_POSSIBILITIES = [
    { amount: 0, weight: 30 },      // 30% chance of nothing
    { amount: 1500, weight: 15 },    // 15% chance
    { amount: 1800, weight: 15 },    // 15% chance
    { amount: 2000, weight: 20 },    // 20% chance
    { amount: 2200, weight: 10 },    // 10% chance
    { amount: 2500, weight: 10 }     // 10% chance
];

// Calculate weighted random bonus
function getRandomBonus() {
    const totalWeight = BONUS_POSSIBILITIES.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of BONUS_POSSIBILITIES) {
        if (random < item.weight) {
            return item.amount;
        }
        random -= item.weight;
    }
    return 0;
}

// Award bonuses to all premium users
async function awardMonthlyBonuses() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Get all premium users
    const { data: users, error } = await supabase
        .from('users')
        .select('id')
        .eq('subscription_tier', 'premium');
    
    if (error) {
        console.error('Error fetching premium users:', error);
        return;
    }
    
    let awarded = 0;
    let totalAmount = 0;
    
    for (const user of users) {
        // Check if already awarded this month
        const { data: existing } = await supabase
            .from('bonus_log')
            .select('id')
            .eq('user_id', user.id)
            .eq('month', currentMonth)
            .eq('year', currentYear)
            .single();
        
        if (existing) continue; // Skip if already awarded
        
        const bonusAmount = getRandomBonus();
        
        if (bonusAmount > 0) {
            // Get current balance
            const { data: wallet } = await supabase
                .from('users')
                .select('wallet_balance')
                .eq('id', user.id)
                .single();
            
            const newBalance = (wallet?.wallet_balance || 0) + bonusAmount;
            
            // Update wallet
            await supabase
                .from('users')
                .update({ wallet_balance: newBalance })
                .eq('id', user.id);
            
            // Record transaction
            await supabase
                .from('transactions')
                .insert([{
                    user_id: user.id,
                    amount: bonusAmount,
                    type: 'bonus',
                    description: `🎉 SURPRISE BONUS! You received ₦${bonusAmount.toLocaleString()}`,
                    created_at: new Date().toISOString()
                }]);
            
            // Log bonus
            await supabase
                .from('bonus_log')
                .insert([{
                    user_id: user.id,
                    amount: bonusAmount,
                    month: currentMonth,
                    year: currentYear,
                    awarded_at: new Date().toISOString()
                }]);
            
            awarded++;
            totalAmount += bonusAmount;
            console.log(`Awarded ₦${bonusAmount} to user ${user.id}`);
        } else {
            // Log zero bonus
            await supabase
                .from('bonus_log')
                .insert([{
                    user_id: user.id,
                    amount: 0,
                    month: currentMonth,
                    year: currentYear,
                    awarded_at: new Date().toISOString()
                }]);
        }
    }
    
    console.log(`Bonus distribution complete: ${awarded} users received total ₦${totalAmount.toLocaleString()}`);
}

// Run the function
awardMonthlyBonuses();
