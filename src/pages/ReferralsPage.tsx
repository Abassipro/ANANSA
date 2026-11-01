import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Copy, Crown, ExternalLink, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeading } from "../components/PageHeading";
import { useAppContext } from "../context/AppContext";

export function ReferralsPage() {
  const { account, config, announce } = useAppContext();
  const [copied, setCopied] = useState(false);
  const referralUrl = useMemo(() => {
    if (!account || !config.botUsername) return null;
    const username = config.botUsername.replace(/^@/, "");
    return `https://t.me/${username}?startapp=${encodeURIComponent(`ref_${account.user.referralCode}`)}`;
  }, [account, config.botUsername]);

  const copyReferralLink = async () => {
    if (!referralUrl) {
      announce("Referral links are available after verified Telegram sign-in and bot configuration.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      announce("Your Telegram referral link has been copied.", "success");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      announce("Clipboard access was denied. Check your browser or Telegram permissions and try again.", "error");
    }
  };

  const rank = account?.referrals.rank;
  const invited = account?.referrals.invited ?? null;
  const qualified = account?.referrals.qualified ?? null;
  const progress = rank?.progressPercent ?? (qualified === null ? 0 : Math.min(100, qualified * 10));

  return (
    <div className="page-stack">
      <PageHeading kicker="YOUR COMMUNITY" title="Good people" accent="bring good energy." description="Invite people using your verified Telegram link. Only genuine sign-ups can be attributed; clicks and unverified accounts do not qualify." />

      <section className="referral-hero-panel">
        <div className="referral-hero-copy">
          <p className="eyebrow">BETTER TOGETHER</p>
          <h2>Your circle.<br /><span>A wider horizon.</span></h2>
          <p>Share one link with the people who should discover ABASSI. We only count an invitation once a new person signs in through Telegram.</p>
          <div className="referral-actions">
            <button className="button button-primary" disabled={!referralUrl} onClick={() => void copyReferralLink()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy your invite link"}</button>
            {referralUrl ? <a className="button button-secondary" href={`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${encodeURIComponent("Join me in discovering the ABASSI community.")}`} target="_blank" rel="noopener noreferrer">Share in Telegram <ArrowUpRight size={14} /></a> : <button className="button button-secondary" disabled title="Telegram bot and verified account setup are required">Share in Telegram <ArrowUpRight size={14} /></button>}
          </div>
          {!config.telegramConfigured && <p className="referral-unavailable"><CircleHelp size={13} /> Bot identity is not configured; no referral link will be invented.</p>}
        </div>
        <div className="referral-hero-art" aria-hidden="true">
          <div className="community-orbit orbit-one" /><div className="community-orbit orbit-two" />
          <span className="community-node node-one"><UsersRound size={15} /></span>
          <span className="community-node node-two"><Sparkles size={15} /></span>
          <span className="community-node node-three"><UsersRound size={15} /></span>
          <span className="community-core"><img src="/abassi-mark.png" alt="" width="48" height="48" /></span>
          <span className="community-label">COMMUNITY<br />GROWS HERE</span>
        </div>
      </section>

      <section className="referral-stats-grid" aria-label="Referral totals">
        <article className="stat-card"><div className="stat-card-heading"><span className="stat-icon stat-icon--blue"><UsersRound size={17} /></span><span>Total invited</span></div><strong className="stat-value">{invited?.toLocaleString() ?? "—"}</strong><span className="stat-caption">{account ? "Attributed Telegram sign-ups" : "Connect a verified account"}</span></article>
        <article className="stat-card"><div className="stat-card-heading"><span className="stat-icon"><ShieldCheck size={17} /></span><span>Qualified referrals</span></div><strong className="stat-value">{qualified?.toLocaleString() ?? "—"}</strong><span className="stat-caption">{account ? "Qualification rules are still pending" : "Unverified clicks are not counted"}</span></article>
        <article className="stat-card"><div className="stat-card-heading"><span className="stat-icon stat-icon--amber"><Crown size={17} /></span><span>Current rank</span></div><strong className="stat-value stat-value--rank">{rank?.rangeDefinitionPending ? "Unconfirmed" : rank?.name ?? "—"}</strong><span className="stat-caption">{rank?.rangeDefinitionPending ? "500–999 referral range needs confirmation" : rank?.category ?? "Qualified counts only"}</span></article>
      </section>

      <section className="panel rank-panel" aria-labelledby="rank-title">
        <div className="panel-heading">
          <div><p className="eyebrow">COMMUNITY MILESTONES</p><h2 id="rank-title">{rank?.nextTier ? `On the way to ${rank.nextTier}.` : rank?.name === "Global Apex" ? "Global Apex reached." : "A path shaped together."}</h2></div>
          <span className="panel-icon panel-icon--blue"><Crown size={17} /></span>
        </div>
        <p className="rank-description">Ranks are based on qualified referrals, not referral-link clicks. The point at which an invitation becomes qualified has not been approved; no rank or weekly reward is confirmed yet.</p>
        <div className="rank-progress-meta"><span>{rank?.rangeDefinitionPending ? "Rank unconfirmed · threshold overlap" : rank?.name ?? "Current rank unavailable"}</span><span>{rank?.nextTierThreshold ? `${Math.max(0, rank.nextTierThreshold - (qualified ?? 0)).toLocaleString()} verified referrals to ${rank.nextTier}` : "Next rank not defined"}</span></div>
        <div className="progress-track" role="progressbar" aria-label="Referral rank progress preview" aria-valuemin={0} aria-valuemax={100} aria-valuenow={account && rank ? progress : 0}><span style={{ width: `${account && rank ? progress : 0}%` }} /></div>
        <div className="rank-range-disclaimer">{rank?.rangeDefinitionPending && <CircleHelp size={15} />}<p>{rank?.rangeDefinitionPending ? "The provided Diamond and Elite Bronze thresholds overlap. The current rank in this interval is not assumed." : "Progress is indicative only and does not calculate eligibility or earnings."}</p></div>
      </section>

      <section className="tiers-section" aria-labelledby="tiers-title">
        <div className="section-label-row"><div><p className="eyebrow">PROPOSED RANKS</p><h2 id="tiers-title">Community milestones.</h2></div><span>Using the provided invite thresholds</span></div>
        <div className="tier-lists">
          <TierList title="Micro-influencer" ranks={[["Bronze", "10–49"], ["Silver", "50–99"], ["Gold", "100–299"], ["Platinum", "300–499"], ["Diamond", "500+"]]} />
          <TierList title="Influencer" ranks={[["Elite Bronze", "1,000–2,499"], ["Elite Silver", "2,500–3,999"], ["Elite Gold", "4,000–5,999"], ["Elite Platinum", "6,000–9,999"], ["Global Apex", "10,000+"]]} note="The 500–999 interval does not have a confirmed influencer rank." />
        </div>
        <p className="tier-footnote"><ShieldCheck size={14} /> A proposed weekly reward pool requires at least 10 qualified referrals. Neither qualification rules nor payouts are enabled.</p>
      </section>

      <section className="referral-next-step"><span className="next-step-icon"><UsersRound size={18} /></span><div><strong>How does attribution work?</strong><p>When the bot, database and Telegram sign-in are configured, the signed Telegram start parameter links a new account to its inviter exactly once.</p></div><Link className="quiet-link" to="/profile">View profile<ChevronRight size={14} /></Link></section>
    </div>
  );
}

function TierList({ title, ranks, note }: { title: string; ranks: [string, string][]; note?: string }) {
  return (
    <article className="tier-card">
      <h3>{title}</h3>
      <div>{ranks.map(([name, count], index) => <div key={name} className="tier-row"><span className={`tier-marker tier-marker--${index + 1}`} /><span>{name}</span><span className="tier-count">{count} invites</span><ArrowRight size={13} aria-hidden="true" /></div>)}</div>
      {note && <p className="tier-clarification"><ExternalLink size={13} />{note}</p>}
    </article>
  );
}
