import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, BadgeCheck, CalendarClock, CircleHelp, Clock3, FileText, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import { PageHeading } from "../components/PageHeading";
import { CryptoAssetIcon } from "../components/CryptoAssetIcon";
import { useAppContext } from "../context/AppContext";
import { ApiError, loadPointsHistory, loadRewards, type PointsHistoryEntry, type RewardOverview } from "../api";

export function RewardsPage() {
  const { account, accountState, telegram, config } = useAppContext();
  const [overview, setOverview] = useState<RewardOverview | null>(null);
  const [pointEntries, setPointEntries] = useState<PointsHistoryEntry[]>([]);
  const [nextPointCursor, setNextPointCursor] = useState<string | null>(null);
  const [loadingMorePoints, setLoadingMorePoints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (accountState !== "authenticated") {
      setOverview(null);
      setPointEntries([]);
      setNextPointCursor(null);
      setError(null);
      return () => { mounted = false; };
    }

    setLoading(true);
    void Promise.all([loadRewards(telegram), loadPointsHistory(telegram)])
      .then(([rewards, points]) => {
        if (mounted) {
          setOverview(rewards);
          setPointEntries(points.entries);
          setNextPointCursor(points.nextBefore);
        }
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setError(reason instanceof ApiError ? reason.message : "Reward history is temporarily unavailable.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [accountState, telegram]);

  const loadMorePoints = async () => {
    if (!nextPointCursor || loadingMorePoints) return;
    setLoadingMorePoints(true);
    try {
      const page = await loadPointsHistory(telegram, nextPointCursor);
      setPointEntries((current) => [...current, ...page.entries]);
      setNextPointCursor(page.nextBefore);
    } catch (reason: unknown) {
      setError(reason instanceof ApiError ? reason.message : "Points history is temporarily unavailable.");
    } finally {
      setLoadingMorePoints(false);
    }
  };

  const rank = account?.referrals.rank;

  return (
    <div className="page-stack">
      <PageHeading kicker="REWARD INFORMATION" title="Clear terms." accent="Thoughtful rewards." description="Review lifetime points, proposed eligibility rules, and your verified withdrawal history. Points and monetary rewards are different things." />

      {error && <section className="notice-panel notice-panel--warning" role="status"><div className="notice-icon"><CircleHelp size={17} /></div><div><strong>Reward history is unavailable</strong><p>{error}</p></div></section>}

      <section className="reward-balances-grid" aria-label="Reward account balances">
        <article className="balance-card balance-card--points">
          <div className="balance-card-top"><span className="balance-icon"><FileText size={17} /></span><span>Points balance</span><span className="proposed-label">{account ? "Server ledger" : "Not signed in"}</span></div>
          <strong>{account ? account.user.points.toLocaleString() : "—"}<small> pts</small></strong>
          <p>Points are non-monetary until an approved programme says otherwise.</p>
        </article>
        <article className="balance-card">
          <div className="balance-card-top"><span className="balance-icon balance-icon--amber"><Wallet size={17} /></span><span>Claimable balance</span><span className="proposed-label">Unavailable</span></div>
          <strong>—<small> not configured</small></strong>
          <p>No confirmed pool, asset, treasury or payout terms are connected.</p>
        </article>
      </section>

      <section className="notice-panel notice-panel--warning payout-safety">
        <div className="notice-icon"><LockKeyhole size={17} /></div>
        <div>
          <strong>No withdrawal or token transfer is available.</strong>
          <p>The weekly 30% revenue-share concept is proposed, not a guaranteed income. Payouts remain disabled until the revenue policy, asset, network, funding and withdrawal rules are verified.</p>
        </div>
      </section>

      <section className="panel withdrawal-history" aria-labelledby="points-history-title">
        <div className="panel-heading">
          <div><p className="eyebrow">AUDITABLE POINTS</p><h2 id="points-history-title">Points ledger history.</h2></div>
          <span className="history-count">{loading ? "Loading…" : account ? `${account.user.points.toLocaleString()} current points` : "Sign in to view"}</span>
        </div>
        {loading ? (
          <div className="empty-history"><span className="loading-indicator" />Loading ledger entries…</div>
        ) : pointEntries.length > 0 ? (
          <>
            <div className="withdrawal-list">
              {pointEntries.map((entry) => (
                <div className="withdrawal-row" key={entry.id}>
                  <span className="withdrawal-icon"><FileText size={16} /></span>
                  <div>
                    <strong>{entry.type.replaceAll("_", " ")}</strong>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                  <span className={`withdrawal-status ${entry.delta > 0 ? "withdrawal-status--confirmed" : "withdrawal-status--failed"}`}>
                    {entry.delta > 0 ? "+" : ""}{entry.delta.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
            {nextPointCursor && (
              <button className="quiet-button" type="button" disabled={loadingMorePoints} onClick={() => void loadMorePoints()}>
                {loadingMorePoints ? "Loading…" : <>Load older entries <ArrowUpRight size={13} /></>}
              </button>
            )}
          </>
        ) : (
          <div className="empty-history"><FileText size={20} /><span>{account ? "No points have been recorded in the ledger." : "Sign in to view your account’s ledger."}</span></div>
        )}
        <p className="history-disclaimer"><ShieldCheck size={14} />History is scoped to your verified Telegram account and comes directly from the append-only points ledger.</p>
      </section>

      <section className="section-row rewards-information-grid">
        <article className="panel eligibility-detail-panel" aria-labelledby="weekly-title">
          <div className="panel-heading">
            <div><p className="eyebrow">WEEKLY REWARD PREVIEW</p><h2 id="weekly-title">Eligibility is not calculated.</h2></div>
            <span className="panel-icon panel-icon--amber"><CalendarClock size={18} /></span>
          </div>
          <div className="eligibility-preview">
            <div><span>Qualified-referral threshold</span><strong>{account ? `${account.referrals.qualified} / 10` : "— / 10"}</strong></div>
            <div><span>This UTC week’s check-ins</span><strong>{account ? `${account.currentWeekCheckIns} / 7` : "— / 7"}</strong></div>
            <div><span>Campaign calculation</span><strong className="text-amber">Pending policy approval</strong></div>
          </div>
          <div className="eligibility-preview-footer"><CircleHelp size={15} /><p>These counters do not determine qualification. The cycle definition, completion criteria, point weights, allocation, rounding and funding rules are not configured.</p></div>
        </article>

        <article className="panel earning-policy-panel" aria-labelledby="earning-title">
          <div className="panel-heading">
            <div><p className="eyebrow">HOW POINTS WORK</p><h2 id="earning-title">Verified, never guessed.</h2></div>
            <span className="panel-icon"><BadgeCheck size={18} /></span>
          </div>
          <div className="earning-policy-rows">
            <div><span className="policy-check"><BadgeCheck size={14} /></span><span>Server-confirmed daily check-in</span><span>{config.checkInEnabled ? "Enabled by policy" : "Paused"}</span></div>
            <div><span className="policy-pending"><Clock3 size={14} /></span><span>Social task completion</span><span>Provider needed</span></div>
            <div><span className="policy-pending"><Clock3 size={14} /></span><span>Rewarded advertisements</span><span>{config.adsConfigured ? "Provider configured · no rewards issued" : "Not configured"}</span></div>
            <div><span className="policy-pending"><Clock3 size={14} /></span><span>Share-to-earn bonus</span><span>Not verified</span></div>
          </div>
          <p className="policy-footnote">A link tap, ad-view timer, wallet address or share-sheet opening never creates points.</p>
        </article>
      </section>

      <section className="panel withdrawal-history" aria-labelledby="withdrawal-title">
        <div className="panel-heading">
          <div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2 id="withdrawal-title">Withdrawal history.</h2></div>
          <span className="history-count">{loading ? "Loading…" : overview ? `${overview.withdrawals.length} records` : "Sign in to view"}</span>
        </div>
        {loading ? (
          <div className="empty-history"><span className="loading-indicator" />Loading server-recorded withdrawals…</div>
        ) : overview && overview.withdrawals.length > 0 ? (
          <div className="withdrawal-list">
            {overview.withdrawals.map((withdrawal) => (
              <div className="withdrawal-row" key={withdrawal.id}>
                <span className="withdrawal-icon"><CryptoAssetIcon asset={withdrawal.asset} size="sm" /></span>
                <div><strong>{withdrawal.amountMinorUnits} base units · {withdrawal.asset}</strong><span>{new Date(withdrawal.createdAt).toLocaleString()}</span></div>
                <span className={`withdrawal-status withdrawal-status--${withdrawal.status}`}>{withdrawal.status}</span>
                {withdrawal.transactionHash && <span className="withdrawal-hash">{withdrawal.transactionHash}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-history"><ArrowDownToLine size={20} /><span>{overview ? "No withdrawal records have been created." : "Sign in to see records confirmed by the server."}</span></div>
        )}
        <p className="history-disclaimer"><ShieldCheck size={14} />No transaction hashes or payout history are fabricated. All transfers are disabled in this build.</p>
      </section>

      <section className="proposed-reward-callout">
        <span className="reward-callout-mark"><CalendarClock size={19} /></span>
        <div><p className="eyebrow">A PROPOSED MODEL · NOT A GUARANTEE</p><h2>A path to shared value.</h2><p>The project’s brief proposes a 30% revenue pool for eligible community members. No revenue is currently reported, and no allocation, asset or payment is confirmed.</p></div>
        <span className="callout-chip">{rank?.weeklyPoolMinimumMet ? "Minimum referrals met · still not eligible" : "Formula pending"}</span>
      </section>
    </div>
  );
}
