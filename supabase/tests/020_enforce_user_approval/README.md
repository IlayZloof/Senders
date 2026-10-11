Offline test for migration 020 (local Postgres 17, stubbed Supabase auth/storage).
Never run against the live project.

  createdb t
  psql -d t -f 00_stub.sql -f 01_live.sql -f 02_live_funcs.sql   # live-like schema (from live export)
  psql -d t -f ../../migrations/020_enforce_user_approval.sql
  ./run_tests.sh        # edit P= at the top for your connection
