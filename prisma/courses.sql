-- Additive setup for the administrator-managed course catalog.
-- Existing reservation.course text is deliberately left untouched.
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Start the selectable catalog from course names already recorded by users.
INSERT INTO courses (name)
SELECT DISTINCT trim(course)
FROM reservations
WHERE course IS NOT NULL AND trim(course) <> ''
ON CONFLICT (name) DO NOTHING;
