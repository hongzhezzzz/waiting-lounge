-- Waiting Lounge — Phase 6 schema (board posts only).
--
-- Chat sessions, queues, and rooms are still ephemeral / in-memory. Adding
-- those to Postgres is a Phase 7+ decision.
--
-- This file is idempotent: applying it twice is a no-op. Run via the helper
-- in src/db/index.ts on backend startup.

create extension if not exists "uuid-ossp";

create table if not exists board_posts (
  id            uuid primary key default uuid_generate_v4(),
  handle        text not null,
  tag           text not null,
  body          text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  report_count  integer not null default 0,
  hidden        boolean not null default false
);

create index if not exists board_posts_tag_created_idx
  on board_posts (tag, created_at desc)
  where hidden = false;

create index if not exists board_posts_expires_idx
  on board_posts (expires_at);

-- Phase 11 — accounts and points.

create table if not exists users (
  id              uuid primary key default uuid_generate_v4(),
  email           text not null unique,
  handle          text not null,
  points          integer not null default 1000,
  created_at      timestamptz not null default now(),
  last_refill_at  timestamptz
);

create index if not exists users_email_idx on users (email);

create table if not exists device_account_bindings (
  device_id       text primary key,
  user_id         uuid not null references users(id),
  bound_at        timestamptz not null default now()
);

create index if not exists device_account_bindings_user_idx
  on device_account_bindings (user_id);

create table if not exists game_rounds (
  id              uuid primary key default uuid_generate_v4(),
  game_type       text not null,
  round_subtype   text,
  duration_min    integer not null,
  ante            integer not null,
  player_a_id     uuid not null references users(id),
  player_b_id     uuid not null references users(id),
  winner_id       uuid references users(id),
  outcome         text not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index if not exists game_rounds_player_a_idx on game_rounds (player_a_id, started_at desc);
create index if not exists game_rounds_player_b_idx on game_rounds (player_b_id, started_at desc);

create table if not exists point_transactions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id),
  delta           integer not null,
  reason          text not null,
  game_round_id   uuid references game_rounds(id),
  created_at      timestamptz not null default now()
);

create index if not exists point_transactions_user_idx
  on point_transactions (user_id, created_at desc);

create table if not exists pending_refunds (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references users(id),
  amount          integer not null,
  reason          text not null,
  game_round_id   uuid references game_rounds(id),
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

create index if not exists pending_refunds_unprocessed_idx
  on pending_refunds (created_at)
  where processed_at is null;

-- Survives backend cold-starts so the lounge badge can still show the right
-- state when a friend opens the tab after Render's free-tier dyno slept.
create table if not exists device_last_status (
  device_id   text primary key,
  status      text not null,
  client      text not null,
  ts_ms       bigint not null,
  updated_at  timestamptz not null default now()
);
