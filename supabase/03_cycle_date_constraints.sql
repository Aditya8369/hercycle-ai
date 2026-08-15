ALTER TABLE public.cycles
  ADD CONSTRAINT check_end_date_after_start
  CHECK (end_date IS NULL OR end_date >= start_date);

ALTER TABLE public.cycles
  ADD CONSTRAINT check_cycle_length_bounds
  CHECK (cycle_length IS NULL OR (cycle_length >= 10 AND cycle_length <= 120));