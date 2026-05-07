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
