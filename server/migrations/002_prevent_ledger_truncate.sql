CREATE OR REPLACE FUNCTION reject_ledger_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Append-only records cannot be truncated'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS point_ledger_no_truncate ON point_ledger;
CREATE TRIGGER point_ledger_no_truncate
  BEFORE TRUNCATE ON point_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_truncate();

DROP TRIGGER IF EXISTS provider_reward_events_no_truncate ON provider_reward_events;
CREATE TRIGGER provider_reward_events_no_truncate
  BEFORE TRUNCATE ON provider_reward_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_truncate();

DROP TRIGGER IF EXISTS withdrawal_history_no_truncate ON withdrawal_status_history;
CREATE TRIGGER withdrawal_history_no_truncate
  BEFORE TRUNCATE ON withdrawal_status_history
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_truncate();

DROP TRIGGER IF EXISTS admin_audit_events_no_truncate ON admin_audit_events;
CREATE TRIGGER admin_audit_events_no_truncate
  BEFORE TRUNCATE ON admin_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_truncate();
