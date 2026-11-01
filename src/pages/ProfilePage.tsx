import { useState } from "react";
import { BadgeCheck, Bell, ChevronRight, CircleHelp, Copy, ExternalLink, Fingerprint, Info, KeyRound, Languages, Shield, ShieldCheck, UsersRound, Wallet } from "lucide-react";
import { PageHeading } from "../components/PageHeading";
import { useAppContext } from "../context/AppContext";

export function ProfilePage() {
  const { account, accountState, telegram, config, announce } = useAppContext();
  const [copied, setCopied] = useState(false);

  const copyTelegramId = async () => {
    if (!account) {
      announce("Telegram account information is available after verified sign-in.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(account.user.id);
      setCopied(true);
      announce("Your Telegram account ID has been copied.", "success");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      announce("Clipboard access was denied. Check browser permissions and try again.", "error");
    }
  };

  return (
    <div className="page-stack">
      <PageHeading kicker="YOUR ACCOUNT" title="A little about" accent="you." description="Your Telegram identity is verified server-side before any account or reward data is displayed." />

      {accountState === "authenticated" && account ? (
        <section className="profile-hero-panel">
          <div className="profile-avatar">
            {account.user.photoUrl
              ? <img src={account.user.photoUrl} alt={`${account.user.displayName}'s Telegram profile`} width="76" height="76" referrerPolicy="no-referrer" />
              : <span aria-hidden="true">{account.user.displayName.trim().charAt(0).toUpperCase()}</span>}
            <span className="avatar-verified"><BadgeCheck size={14} fill="currentColor" /></span>
          </div>
          <div className="profile-identity-copy"><span className="verified-label"><ShieldCheck size={14} /> TELEGRAM-VERIFIED ACCOUNT</span><h2>{account.user.displayName}</h2><p>{account.user.username ? `@${account.user.username}` : "Telegram username not shared"}</p></div>
          <button className="button button-secondary profile-copy" onClick={() => void copyTelegramId()}>{copied ? <BadgeCheck size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy account ID"}</button>
        </section>
      ) : (
        <section className="profile-hero-panel profile-hero-panel--preview">
          <div className="profile-avatar"><img src="/abassi-mark.png" alt="" width="76" height="76" /></div>
          <div className="profile-identity-copy"><span className="verified-label verified-label--pending"><Fingerprint size={14} /> {telegram.isTelegram ? "AWAITING SERVER VERIFICATION" : "LOCAL PREVIEW"}</span><h2>{accountState === "loading" ? "Verifying your account…" : "Your ABASSI profile"}</h2><p>{accountState === "error" ? "Telegram could not verify this account." : "No profile or Telegram account data is loaded in preview mode."}</p></div>
        </section>
      )}

      <section className="profile-details-grid" aria-label="Account and connected-service settings">
        <article className="panel profile-detail-card">
          <div className="panel-heading"><div><p className="eyebrow">ACCOUNT DETAILS</p><h2>Your information.</h2></div><span className="panel-icon"><Fingerprint size={17} /></span></div>
          <div className="profile-detail-list">
            <div><span><ShieldCheck size={15} /> Telegram identity</span><strong>{accountState === "authenticated" ? "Verified" : accountState === "loading" ? "Checking…" : "Not connected"}</strong></div>
            <div><span><KeyRound size={15} /> Account ID</span><strong>{account ? account.user.id : "Hidden until verified"}</strong></div>
            <div><span><UsersRound size={15} /> Referral code</span><strong className="monospace-value">{account ? account.user.referralCode : "Not yet created"}</strong></div>
            <div><span><Info size={15} /> Account since</span><strong>{account ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(account.user.createdAt)) : "—"}</strong></div>
          </div>
        </article>

        <article className="panel profile-detail-card">
          <div className="panel-heading"><div><p className="eyebrow">CONNECTED SERVICES</p><h2>Your connections.</h2></div><span className="panel-icon panel-icon--muted"><Wallet size={17} /></span></div>
          <div className="connection-row"><span className="connection-logo">S</span><span><strong>Blockchain wallet</strong><small>{config.walletConfigured ? `${config.chain} · ${config.network}` : "Wallet network awaits confirmation"}</small></span><span className="connection-status">{config.walletConfigured ? "Not connected" : "Not configured"}</span></div>
          <div className="wallet-notice"><CircleHelp size={14} /><p>ABASSI’s chain has not been confirmed. No wallet connector, wallet address, seed phrase or signature request is enabled.</p></div>
          <button className="button button-secondary profile-wallet-button" disabled title="Wallet connection stays disabled until the project confirms its chain and network">Connect wallet <ChevronRight size={14} /></button>
        </article>
      </section>

      <section className="panel account-preferences" aria-labelledby="preferences-title">
        <div className="panel-heading"><div><p className="eyebrow">APP INFORMATION</p><h2 id="preferences-title">Your settings &amp; privacy.</h2></div><span className="panel-icon panel-icon--blue"><Bell size={17} /></span></div>
        <a className="preference-row" href="https://core.telegram.org/bots/webapps" target="_blank" rel="noopener noreferrer"><span><Languages size={16} /><strong>Telegram Mini Apps</strong></span><span>Official platform information <ExternalLink size={14} /></span></a>
        <a className="preference-row" href="https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app" target="_blank" rel="noopener noreferrer"><span><Shield size={16} /><strong>Account verification</strong></span><span>How signed Telegram data works <ExternalLink size={14} /></span></a>
        <div className="privacy-note"><ShieldCheck size={15} /><p>We only store the Telegram account details necessary for identity and referral attribution. No local wallet state, seed phrase, or payment credentials are requested.</p></div>
      </section>
    </div>
  );
}
