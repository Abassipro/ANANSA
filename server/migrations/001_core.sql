CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY CHECK (telegram_id ~ '^[0-9]{1,20}$'),
  username TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 256),
  photo_url TEXT,
  referral_code TEXT NOT NULL UNIQUE CHECK (referral_code ~ '^[A-Fa-f0-9]{16}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS point_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (
    entry_type IN ('daily_checkin', 'social_task', 'rewarded_ad', 'welcome_bonus', 'share_bonus', 'admin_adjustment')
  ),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS point_ledger_user_created_idx
  ON point_ledger(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_check_ins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  checkin_date DATE NOT NULL,
  awarded_points INTEGER NOT NULL CHECK (awarded_points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, checkin_date)
);

CREATE INDEX IF NOT EXISTS daily_check_ins_user_date_idx
  ON daily_check_ins(telegram_id, checkin_date DESC);

CREATE TABLE IF NOT EXISTS task_completions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'approved', 'rejected')),
  provider TEXT,
  provider_event_id TEXT UNIQUE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewer_id TEXT,
  UNIQUE (telegram_id, task_id)
);

CREATE INDEX IF NOT EXISTS task_completions_user_status_idx
  ON task_completions(telegram_id, status);

CREATE TABLE IF NOT EXISTS referrals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  referrer_telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  referred_telegram_id TEXT NOT NULL UNIQUE REFERENCES users(telegram_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at TIMESTAMPTZ,
  CHECK (referrer_telegram_id <> referred_telegram_id),
  CHECK (
    (status = 'qualified' AND qualified_at IS NOT NULL)
    OR (status <> 'qualified' AND qualified_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS referrals_referrer_status_idx
  ON referrals(referrer_telegram_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_reward_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  credited_points INTEGER NOT NULL CHECK (credited_points >= 0),
  verification_status TEXT NOT NULL
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  payload_digest TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS reward_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'dry_run'
    CHECK (status IN ('dry_run', 'pending_review', 'approved', 'settled', 'cancelled')),
  policy_version TEXT NOT NULL,
  distributable_pool_minor_units BIGINT NOT NULL DEFAULT 0
    CHECK (distributable_pool_minor_units >= 0),
  currency_code TEXT NOT NULL DEFAULT 'UNCONFIGURED',
  dry_run_only BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (dry_run_only OR status NOT IN ('settled'))
);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES reward_cycles(id) ON DELETE RESTRICT,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  eligible_weight BIGINT NOT NULL CHECK (eligible_weight >= 0),
  allocated_minor_units BIGINT NOT NULL CHECK (allocated_minor_units >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, telegram_id)
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units > 0),
  asset_code TEXT NOT NULL,
  network TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'submitted', 'confirmed', 'failed', 'cancelled')),
  transaction_hash TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS withdrawal_requests_user_created_idx
  ON withdrawal_requests(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  withdrawal_id UUID NOT NULL REFERENCES withdrawal_requests(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status TEXT NOT NULL
    CHECK (new_status IN ('pending', 'processing', 'submitted', 'confirmed', 'failed', 'cancelled')),
  actor_id TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS withdrawal_history_request_created_idx
  ON withdrawal_status_history(withdrawal_id, created_at);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx
  ON admin_audit_events(created_at DESC);

CREATE OR REPLACE FUNCTION reject_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Append-only records cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS point_ledger_no_mutation ON point_ledger;
CREATE TRIGGER point_ledger_no_mutation
  BEFORE UPDATE OR DELETE ON point_ledger
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

DROP TRIGGER IF EXISTS provider_reward_events_no_mutation ON provider_reward_events;
CREATE TRIGGER provider_reward_events_no_mutation
  BEFORE UPDATE OR DELETE ON provider_reward_events
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

DROP TRIGGER IF EXISTS withdrawal_history_no_mutation ON withdrawal_status_history;
CREATE TRIGGER withdrawal_history_no_mutation
  BEFORE UPDATE OR DELETE ON withdrawal_status_history
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

DROP TRIGGER IF EXISTS admin_audit_events_no_mutation ON admin_audit_events;
CREATE TRIGGER admin_audit_events_no_mutation
  BEFORE UPDATE OR DELETE ON admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
