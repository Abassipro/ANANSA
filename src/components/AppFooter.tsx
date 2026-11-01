import { Activity, ExternalLink, LockKeyhole } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const socialLinkLabels = {
  x: "X",
  telegram: "Telegram",
  discord: "Discord",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  announcements: "Announcements",
  website: "Website",
} as const;

export function AppFooter() {
  const { telegram, config, accountState } = useAppContext();
  const socialLinks = Object.entries(config.socialLinks).filter(
    (entry): entry is [keyof typeof socialLinkLabels, string] => Boolean(entry[1]),
  );

  return (
    <footer className="page-footnote">
      <div className="page-footnote-status">
        <span className="footnote-icon"><LockKeyhole size={14} strokeWidth={1.8} aria-hidden="true" /></span>
        <p>
          {accountState === "authenticated"
            ? "Account identity verified by Telegram · rewards require server confirmation"
            : telegram.isTelegram
              ? "Telegram identity received · rewards load only after server verification"
              : "Local preview · account data is not connected to Telegram"}
          {config.walletConfigured ? ` · ${config.network}` : " · wallet network unconfigured"}
        </p>
        <Activity size={14} strokeWidth={1.8} aria-hidden="true" />
      </div>
      {socialLinks.length > 0 && (
        <nav className="public-social-links" aria-label="ABASSI external links">
          {socialLinks.map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noopener noreferrer">
              {socialLinkLabels[key]} <ExternalLink size={11} aria-hidden="true" />
            </a>
          ))}
        </nav>
      )}
    </footer>
  );
}
