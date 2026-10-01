-- The guided tours a traveller put in an itinerary from the planner's tour
-- step: a copy of each departure (id, title, operator, times, meeting point,
-- quoted price) so saved and shared trips show them on their day. The seats
-- themselves live in tour_reservations; this copy is display only.
alter table public.itineraries add column if not exists tours jsonb not null default '[]';
