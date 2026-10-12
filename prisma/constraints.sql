-- Run after `prisma db push` on PostgreSQL. Enforces no overlaps, including concurrent requests.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_no_time_overlap;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_time_overlap
  EXCLUDE USING gist (
    laboratory_id WITH =,
    reservation_date WITH =,
    int4range(
      split_part(start_time, ':', 1)::integer * 60 + split_part(start_time, ':', 2)::integer,
      split_part(end_time, ':', 1)::integer * 60 + split_part(end_time, ':', 2)::integer,
      '[)'
    ) WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'));

ALTER TABLE equipment_reservations
  DROP CONSTRAINT IF EXISTS equipment_reservations_no_time_overlap;

ALTER TABLE equipment_reservations
  ADD CONSTRAINT equipment_reservations_no_time_overlap
  EXCLUDE USING gist (
    equipment_id WITH =,
    reservation_date WITH =,
    int4range(
      split_part(start_time, ':', 1)::integer * 60 + split_part(start_time, ':', 2)::integer,
      split_part(end_time, ':', 1)::integer * 60 + split_part(end_time, ':', 2)::integer,
      '[)'
    ) WITH &&
  ) WHERE (status IN ('PENDING', 'CONFIRMED'));
