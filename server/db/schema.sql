-- AAI for CRM server schema. Safe to run repeatedly (npm run migrate).

CREATE TABLE IF NOT EXISTS rooftops (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                    serial PRIMARY KEY,
  email                 text NOT NULL UNIQUE,          -- stored lowercase
  name                  text NOT NULL DEFAULT '',
  password_hash         text NOT NULL,
  role                  text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  rooftop_id            integer REFERENCES rooftops(id),  -- deprecated: see user_rooftops
  model                 text,                          -- NULL = server default model
  active                boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT true,
  failed_logins         integer NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_active_at        timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,                  -- sha256 of the bearer token; the token itself is never stored
  client        text NOT NULL CHECK (client IN ('extension', 'web')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- One row per generation request. Rooftop attribution is in usage_event_rooftops (below);
-- rooftop_id here is only set on requests made before v3.1.
CREATE TABLE IF NOT EXISTS usage_events (
  id             bigserial PRIMARY KEY,
  user_id        integer REFERENCES users(id) ON DELETE SET NULL,
  rooftop_id     integer REFERENCES rooftops(id) ON DELETE SET NULL,
  mode           text NOT NULL,                        -- 'enhance' | 'response'
  model          text NOT NULL,
  input_tokens   integer NOT NULL DEFAULT 0,
  output_tokens  integer NOT NULL DEFAULT 0,
  cost_usd       numeric(12, 6) NOT NULL DEFAULT 0,    -- estimate from list prices
  status         text NOT NULL DEFAULT 'ok',           -- 'ok' | 'error' | 'cancelled'
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events (created_at);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS usage_events_rooftop_idx ON usage_events (rooftop_id, created_at);

-- System prompts, edited on the admin page
CREATE TABLE IF NOT EXISTS prompts (
  mode        text PRIMARY KEY CHECK (mode IN ('enhance', 'response')),
  content     text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer REFERENCES users(id) ON DELETE SET NULL
);

-- Rooftop assignments (v3.1: a user can belong to several rooftops).
-- users.rooftop_id is the old single-rooftop column; it is copied here once and then cleared.
CREATE TABLE IF NOT EXISTS user_rooftops (
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rooftop_id  integer NOT NULL REFERENCES rooftops(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rooftop_id)
);
CREATE INDEX IF NOT EXISTS user_rooftops_rooftop_idx ON user_rooftops (rooftop_id);

INSERT INTO user_rooftops (user_id, rooftop_id)
  SELECT id, rooftop_id FROM users WHERE rooftop_id IS NOT NULL
  ON CONFLICT DO NOTHING;
UPDATE users SET rooftop_id = NULL WHERE rooftop_id IS NOT NULL;

-- Which rooftops each request counts toward. A request from a user with N active rooftops
-- gets N rows with share 1/N, so rooftop totals add up to the overall total.
-- usage_events.rooftop_id is the old single-rooftop column, kept for history and copied here once.
CREATE TABLE IF NOT EXISTS usage_event_rooftops (
  event_id    bigint NOT NULL REFERENCES usage_events(id) ON DELETE CASCADE,
  rooftop_id  integer NOT NULL REFERENCES rooftops(id) ON DELETE CASCADE,
  share       numeric(9, 8) NOT NULL CHECK (share > 0 AND share <= 1),
  PRIMARY KEY (event_id, rooftop_id)
);
CREATE INDEX IF NOT EXISTS usage_event_rooftops_rooftop_idx ON usage_event_rooftops (rooftop_id);

INSERT INTO usage_event_rooftops (event_id, rooftop_id, share)
  SELECT id, rooftop_id, 1 FROM usage_events WHERE rooftop_id IS NOT NULL
  ON CONFLICT DO NOTHING;
