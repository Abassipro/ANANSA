import { useState } from "react";
import { CircleHelp } from "lucide-react";

const cryptoAssetLogos: Record<string, { name: string; src: string }> = {
  BTC: { name: "Bitcoin", src: "/crypto-icons/btc.svg" },
  ETH: { name: "Ethereum", src: "/crypto-icons/eth.svg" },
  TRX: { name: "TRON", src: "/crypto-icons/trx.svg" },
  USDT: { name: "Tether", src: "/crypto-icons/usdt.svg" },
  SOL: { name: "Solana", src: "/crypto-icons/sol.svg" },
};

export function CryptoAssetIcon({ asset, size = "md" }: { asset: string; size?: "sm" | "md" | "lg" }) {
  const code = asset.trim().toUpperCase();
  const logo = cryptoAssetLogos[code];
  const [failedSource, setFailedSource] = useState<string | null>(null);

  return (
    <span
      className={`crypto-asset-icon crypto-asset-icon--${size}`}
      role="img"
      aria-label={logo ? `${logo.name} (${code}) logo` : `${code || "Unknown"} asset`}
      title={logo ? `${logo.name} (${code})` : code || "Unknown asset"}
    >
      {logo && failedSource !== logo.src
        ? <img src={logo.src} alt="" onError={() => setFailedSource(logo.src)} />
        : <CircleHelp size={size === "sm" ? 14 : size === "lg" ? 22 : 18} aria-hidden="true" />}
    </span>
  );
}
