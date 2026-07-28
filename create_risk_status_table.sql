-- Create flood_risk_status table
CREATE TABLE flood_risk_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('Low', 'Moderate', 'High')),
  alert_level INTEGER NOT NULL CHECK (alert_level BETWEEN 1 AND 3),
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE flood_risk_status ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read flood risk status
CREATE POLICY "Anyone can read flood_risk_status"
ON flood_risk_status FOR SELECT
USING (true);

-- Add sample risk status
INSERT INTO flood_risk_status (risk_level, alert_level, location, description)
VALUES (
  'High',
  3,
  'Buaya, Lapu-Lapu City',
  'Immediate evacuation advised for low-lying areas due to rising water levels.'
);

-- Add more sample data
INSERT INTO flood_risk_status (risk_level, alert_level, location, description)
VALUES (
  'Moderate',
  2,
  'Cebu City',
  'Monitor weather updates and prepare emergency supplies.'
);

INSERT INTO flood_risk_status (risk_level, alert_level, location, description)
VALUES (
  'Low',
  1,
  'Mandaue City',
  'No immediate threat. Continue normal activities with caution.'
);
