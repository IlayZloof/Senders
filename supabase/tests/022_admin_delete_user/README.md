Offline test for migration 022 (admin_delete_user against the live-like schema).
Never run against the live project.

Uses the live-schema fixtures from ../020_enforce_user_approval (worst case: no
ON DELETE CASCADE on comments/likes/saves/spots/notifications) + migration 020,
plus 03_extra.sql (old-style storage.objects.owner FK, unknown FK tables).

  PGPORT=55433 ./run_tests.sh    # local PG17, superuser "postgres", socket /tmp
