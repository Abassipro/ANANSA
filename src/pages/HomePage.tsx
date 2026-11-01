import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarCheck, Check, ChevronRight, CircleHelp, Clock3, Coins, Flame, Gift, ListChecks, ShieldCheck, Sparkles, Target, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { AbassiCoin } from "../components/AbassiCoin";
import { HomeFireHero } from "../components/HomeFireHero";
import { PageHeading } from "../components/PageHeading";
import { ApiError, loadPointsHistory, type PointsHistoryEntry } from "../api";

export function HomePage() {
  const { account, accountState, accountError, config, configLoading, telegram, refreshAccount, checkIn, checkingIn } = useAppContext();
  const [recentActivity, setRecentActivity] = useState<PointsHistoryEntry[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const points = account ? account.user.points.toLocaleString() : "—";
  const weekProgress = account?.currentWeekCheckIns ?? null;
  const todaysCheckIn = account?.todaysCheckIn ?? false;
  const referralCount = account?.referrals.invited.toLocaleString() ?? "—";

  useEffect(() => {
    let active = true;
    setRecentActivity(null);
    setActivityError(null);
    if (accountState !== "authenticated") {
      return () => { active = false; };
    }

    void loadPointsHistory(telegram)
      .then((page) => {
        if (active) setRecentActivity(page.entries.slice(0, 3));
      })
      .catch((error: unknown) => {
        if (!active) return;
        setActivityError(error instanceof ApiError ? error.message : "Recent points activity is temporarily unavailable.");
      });

    return () => { active = false; };
  }, [accountState, telegram]);

  return (
    <div className="page-stack">
      <PageHeading
        kicker="Your ABASSI overview"
        title="Every step"
        accent="moves you forward."
        description="Explore the community, track your verified activity, and see what is coming next."
      />

      <HomeFireHero />

      {accountState === "preview" && (
        <section className="notice-panel notice-panel--info" aria-label="Development preview">
          <div className="notice-icon"><CircleHelp size={17} strokeWidth={1.8} aria-hidden="true" /></div>
          <div>
            <strong>Preview mode · not connected to an account</strong>
            <p>Open the Mini App from the configured Telegram bot to load server-verified profile and reward data.</p>
          </div>
          <span className="notice-tag">No sample balance</span>
        </section>
      )}

      {accountState === "error" && (
        <section className="notice-panel notice-panel--warning" role="status">
          <div className="notice-icon"><CircleHelp size={17} strokeWidth={1.8} aria-hidden="true" /></div>
          <div>
            <strong>Account data could not be verified</strong>
            <p>{accountError ?? "Check Telegram and database configuration before retrying."}</p>
          </div>
          <button className="quiet-button" onClick={() => void refreshAccount()}>Try again</button>
        </section>
      )}

      {telegram.isTelegram && !config.telegramConfigured && (
        <section className="notice-panel notice-panel--warning" role="status">
          <div className="notice-icon"><ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" /></div>
          <div>
            <strong>Secure sign-in is not configured yet</strong>
            <p>Set the backend Telegram bot token and database connection to verify this Telegram account and load real points.</p>
          </div>
        </section>
      )}

      <section className="overview-hero" aria-labelledby="overview-title">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-topline">
            <p className="hero-section-tag"><span className="hero-status-mark"><Sparkles size={12} /></span> THE ABASSI COMMUNITY</p>
            <span className={`session-pill${accountState === "authenticated" ? " session-pill--verified" : ""}`}>
              <span />{accountState === "authenticated" ? "Telegram verified" : "Awaiting verification"}
            </span>
          </div>
          <div className="hero-main">
            <div className="hero-copy">
              <h2 id="overview-title">A more connected<br />kind of <span>opportunity.</span></h2>
              <p>Show up, explore the ecosystem, and follow your verified progress as the ABASSI community grows.</p>
              <div className="hero-quick-links">
                <Link to="/tasks" className="button button-primary">Explore tasks <ArrowRight size={16} /></Link>
                <Link to="/referrals" className="hero-text-link">Invite your circle <ArrowUpRight size={15} /></Link>
              </div>
            </div>
            <div className="hero-coin-wrap"><AbassiCoin /></div>
          </div>
          <div className="hero-footer">
            <div className="hero-footer-line" />
            <span>Illustrative artwork · $ABASSI is not shown as a live token balance</span>
          </div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Account overview">
        <article className="stat-card stat-card--points">
          <div className="stat-card-heading"><span className="stat-icon"><Coins size={17} /></span><span>Points balance</span><span className="stat-info">?</span></div>
          <strong className="stat-value">{accountState === "loading" && telegram.isTelegram ? <span className="loading-dash" aria-label="Loading points">···</span> : points}</strong>
          <span className="stat-caption">{account ? "Calculated from the server-side points ledger" : "Available after Telegram account verification"}</span>
        </article>
        <article className="stat-card">
          <div className="stat-card-heading"><span className="stat-icon stat-icon--amber"><Flame size={17} /></span><span>Current streak</span></div>
          <strong className="stat-value">{account ? `${account.streak} ${account.streak === 1 ? "day" : "days"}` : "—"}</strong>
          <span className="stat-caption">{account ? "Daily check-ins · reset at 00:00 UTC" : "A server-confirmed check-in starts your streak"}</span>
        </article>
        <article className="stat-card">
          <div className="stat-card-heading"><span className="stat-icon stat-icon--blue"><UsersRound size={17} /></span><span>Invited friends</span></div>
          <strong className="stat-value">{referralCount}</strong>
          <span className="stat-caption">{account ? "Qualified: " + account.referrals.qualified.toLocaleString() : "Verified invitations only"}</span>
        </article>
      </section>

      <section className="wallet-status-strip" aria-label="Wallet connection status">
        <span className="wallet-status-icon"><Coins size={17} aria-hidden="true" /></span>
        <div><strong>Wallet connection</strong><span>{config.walletConfigured ? `${config.chain} · ${config.network}` : "Network awaits confirmation"}</span></div>
        <span className="wallet-status-badge"><span /> Not connected</span>
        <button className="wallet-connect-disabled" disabled title="Wallet connection is disabled until ABASSI confirms its blockchain and network">Connect wallet <ArrowRight size={14} /></button>
      </section>

      {account?.streakBroken && (
        <section className="streak-warning" role="status">
          <span className="streak-warning-icon"><Flame size={17} /></span>
          <p>Your consecutive check-in streak was interrupted. Streaks currently track activity only; no streak bonus or revenue-share eligibility is enabled.</p>
        </section>
      )}

      <div className="section-row section-row--home">
        <section className="panel daily-panel" aria-labelledby="daily-title">
          <div className="panel-heading">
            <div><p className="eyebrow">YOUR WEEKLY RHYTHM</p><h2 id="daily-title">A little progress, every day.</h2></div>
            <span className="panel-icon"><CalendarCheck size={17} /></span>
          </div>
          <div className="week-status">
            <div className="week-count"><strong>{weekProgress ?? "—"}<span> / 7 days</span></strong><span>This UTC week</span></div>
            <span className="week-rule">Check in before 00:00 UTC</span>
          </div>
          <div
            className={`week-progress-track${weekProgress === null ? " is-unknown" : ""}`}
            role={weekProgress === null ? undefined : "progressbar"}
            aria-label={weekProgress === null ? "Sign in to see weekly check-in progress" : "Check-ins recorded this UTC week"}
            aria-valuemin={weekProgress === null ? undefined : 0}
            aria-valuemax={weekProgress === null ? undefined : 7}
            aria-valuenow={weekProgress ?? undefined}
          >
            <span style={{ width: `${weekProgress === null ? 0 : (weekProgress / 7) * 100}%` }} />
          </div>
          {account && config.checkInEnabled ? (
            <button className="button button-primary checkin-action" disabled={todaysCheckIn || checkingIn} onClick={() => void checkIn()}>
              {todaysCheckIn ? <><Check size={16} /> Checked in today</> : checkingIn ? "Recording check-in…" : <><CalendarCheck size={15} /> Check in · {config.checkInPoints} points</>}
            </button>
          ) : (
            <p className="inline-note"><Clock3 size={14} />{!account ? "Connect your verified Telegram account to view eligibility." : configLoading ? "Loading campaign settings…" : "Daily check-ins are paused until the reward rules are approved."}</p>
          )}
          <p className="weekly-disclaimer">Weekly reward-share eligibility, formulas and payouts are not enabled. Check-ins do not guarantee income.</p>
        </section>

        <section className="panel eligibility-panel" aria-labelledby="eligibility-title">
          <div className="panel-heading">
            <div><p className="eyebrow">REWARD STATUS</p><h2 id="eligibility-title">What you can expect.</h2></div>
            <span className="panel-icon panel-icon--muted"><Gift size={17} /></span>
          </div>
          <div className="eligibility-status"><span className="status-pulse" /> Rules need confirmation</div>
          <p className="eligibility-copy">Proposed reward programs are being reviewed. No tokens or revenue share are claimable today.</p>
          <div className="eligibility-checklist">
            <div><span className="small-status-icon"><Check size={12} /></span><span>Daily check-in</span><span className="checklist-points">{config.checkInEnabled ? "Available" : "Pending"}</span></div>
            <div><span className="small-status-icon"><Target size={12} /></span><span>Social verification</span><span className="checklist-points">Pending</span></div>
            <div><span className="small-status-icon"><UsersRound size={12} /></span><span>Weekly eligibility</span><span className="checklist-points">Not calculated</span></div>
          </div>
          <Link className="panel-link" to="/rewards">See reward information <ChevronRight size={15} /></Link>
        </section>
      </div>

      <section className="quick-actions-section" aria-labelledby="quick-actions-title">
        <div className="section-label-row">
          <div><p className="eyebrow">KEEP EXPLORING</p><h2 id="quick-actions-title">Your next step.</h2></div>
          <span>Made for your community</span>
        </div>
        <div className="quick-actions-grid">
          <Link className="quick-action-card" to="/tasks"><span className="quick-action-icon"><ListChecks size={18} /></span><span className="quick-action-copy"><strong>Browse tasks</strong><span>See points and verification status.</span></span><ArrowUpRight size={16} className="quick-action-arrow" /></Link>
          <Link className="quick-action-card" to="/referrals"><span className="quick-action-icon quick-action-icon--blue"><UsersRound size={18} /></span><span className="quick-action-copy"><strong>Invite your circle</strong><span>Share a verified referral link.</span></span><ArrowUpRight size={16} className="quick-action-arrow" /></Link>
          <Link className="quick-action-card" to="/rewards"><span className="quick-action-icon quick-action-icon--silver"><Gift size={18} /></span><span className="quick-action-copy"><strong>Explore rewards</strong><span>Review the current campaign rules.</span></span><ArrowUpRight size={16} className="quick-action-arrow" /></Link>
        </div>
      </section>

      <section className="panel recent-activity" aria-labelledby="recent-activity-title">
        <div className="panel-heading">
          <div><p className="eyebrow">YOUR ACCOUNT</p><h2 id="recent-activity-title">Recent points activity.</h2></div>
          <Link className="quiet-link" to="/rewards">Full history <ChevronRight size={14} /></Link>
        </div>
        {accountState !== "authenticated" ? (
          <div className="empty-history"><ShieldCheck size={18} /><span>Sign in to view your account’s verified activity.</span></div>
        ) : activityError ? (
          <div className="empty-history" role="status"><CircleHelp size={18} /><span>{activityError}</span></div>
        ) : recentActivity === null ? (
          <div className="empty-history"><span className="loading-indicator" />Loading ledger entries…</div>
        ) : recentActivity.length === 0 ? (
          <div className="empty-history"><Clock3 size={18} /><span>No points have been recorded in your ledger yet.</span></div>
        ) : (
          <div className="withdrawal-list">
            {recentActivity.map((entry) => (
              <div className="withdrawal-row" key={entry.id}>
                <span className="withdrawal-icon"><Coins size={15} /></span>
                <div><strong>{entry.type.replaceAll("_", " ")}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div>
                <span className={`withdrawal-status ${entry.delta > 0 ? "withdrawal-status--confirmed" : "withdrawal-status--failed"}`}>
                  {entry.delta > 0 ? "+" : ""}{entry.delta.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
