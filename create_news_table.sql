-- Create news table
CREATE TABLE IF NOT EXISTS public.news (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'flood', 'weather', 'advisory', 'emergency'
    image_url TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read active news
CREATE POLICY "Anyone can read active news"
    ON public.news
    FOR SELECT
    USING (is_active = TRUE);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_news_published_at ON public.news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_category ON public.news(category);

-- Insert sample news
INSERT INTO public.news (title, description, category, image_url) VALUES
('Heavy Rainfall Expected This Week', 'PAGASA forecasts continuous heavy rainfall in Cebu City from June 15-18. Residents in low-lying areas are advised to monitor water levels closely.', 'weather', NULL),
('Flood Advisory: Lahug Area', 'Moderate flooding reported in Lahug district. Motorists advised to take alternate routes. Emergency response teams are on standby.', 'flood', NULL),
('Community Evacuation Drill Success', 'Over 500 families participated in the quarterly evacuation drill last Saturday. Thank you for your cooperation and preparedness.', 'advisory', NULL);

COMMENT ON TABLE public.news IS 'News and announcements for FloodWatch Cebu users';
