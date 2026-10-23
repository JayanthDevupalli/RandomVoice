-- ==========================================================
-- YapClub Migration: 10-12 Seat Junction Capacity
-- Run this in your Supabase SQL Editor if you want existing
-- public rooms and default schema updated to 10 seats.
-- ==========================================================

-- 1. Update column default to 10
ALTER TABLE junctions 
ALTER COLUMN max_participants SET DEFAULT 10;

-- 2. Update existing default public junctions with 7 seats to 10 seats
UPDATE junctions
SET max_participants = 10
WHERE max_participants = 7;
