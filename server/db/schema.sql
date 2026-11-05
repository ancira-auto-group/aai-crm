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
  rooftop_id            integer REFERENCES rooftops(id),
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

-- One row per generation request. rooftop_id is copied from the user at request time,
-- so moving a user to another rooftop doesn't rewrite history.
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
