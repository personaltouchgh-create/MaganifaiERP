BEGIN;

CREATE TABLE IF NOT EXISTS seed_marker (
  id integer PRIMARY KEY,
  seeded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO seed_marker (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMIT;