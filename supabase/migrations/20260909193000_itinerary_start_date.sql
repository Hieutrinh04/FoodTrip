alter table public.itineraries
  add column if not exists start_date date;

comment on column public.itineraries.start_date is
  'Local departure date selected by the itinerary owner; used for weather guidance.';
