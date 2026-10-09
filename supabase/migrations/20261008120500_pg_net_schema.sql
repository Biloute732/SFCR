-- pg_net hors du schéma public (avis de sécurité Supabase)
drop extension if exists pg_net;
create extension pg_net schema extensions;
