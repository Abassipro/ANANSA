export type WalletChain = "ton" | "solana";

export class WalletNetworkNotConfiguredError extends Error {
  constructor() {
    super("Wallet connections are disabled until ABASSI's supported chain and network are confirmed.");
    this.name = "WalletNetworkNotConfiguredError";
  }
}

export interface WalletAdapter {
  readonly chain: WalletChain;
  readonly network: string;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
}

export function createWalletAdapter(): WalletAdapter {
  throw new WalletNetworkNotConfiguredError();
}
