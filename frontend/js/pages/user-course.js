-- ============================================
-- REFERRAL SYSTEM TABLES
-- ============================================

-- Add referral_code column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Create referral_events table
CREATE TABLE IF NOT EXISTS referral_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create referral_clicks table
CREATE TABLE IF NOT EXISTS referral_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referral_code TEXT NOT NULL,
    platform TEXT,
    clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create referral_signups table
CREATE TABLE IF NOT EXISTS referral_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code TEXT NOT NULL,
    new_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create function to add GP
CREATE OR REPLACE FUNCTION add_gp(user_id UUID, amount INT, reason TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE users 
    SET gp_points = COALESCE(gp_points, 0) + amount
    WHERE id = user_id;
    
    INSERT INTO user_activities (user_id, activity_type, gp_earned, description)
    VALUES (user_id, 'referral', amount, reason);
END;
$$ LANGUAGE plpgsql;

-- RLS Policies
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own referral events" ON referral_events
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own referral clicks" ON referral_clicks
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all referral data" ON referral_events
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can view all referral clicks" ON referral_clicks
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can view all referral signups" ON referral_signups
FOR SELECT USING (auth.role() = 'authenticated');

GRANT ALL ON referral_events TO authenticated;
GRANT ALL ON referral_clicks TO authenticated;
GRANT ALL ON referral_signups TO authenticated;
