import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, loadAccount, loadPublicConfig, submitDailyCheckIn } from "../api";
import { PROPOSED_TASKS } from "../data/tasks";
import type { TelegramRuntime } from "../main";
import type { AccountSnapshot, PublicConfig } from "../types";

export interface ToastMessage {
  text: string;
  tone: "info" | "success" | "error";
}

export type AccountState = "preview" | "loading" | "authenticated" | "error";

interface AppContextValue {
  telegram: TelegramRuntime;
  config: PublicConfig;
  account: AccountSnapshot | null;
  accountState: AccountState;
  accountError: string | null;
  configLoading: boolean;
  checkingIn: boolean;
  toast: ToastMessage | null;
  announce: (text: string, tone?: ToastMessage["tone"]) => void;
  dismissToast: () => void;
  refreshAccount: () => Promise<AccountSnapshot | null>;
  checkIn: () => Promise<void>;
}

const initialConfig: PublicConfig = {
  telegramConfigured: false,
  botUsername: null,
  databaseConfigured: false,
  checkInEnabled: false,
  checkInPoints: 50,
  chain: "unconfigured",
  network: "unconfigured",
  walletConfigured: false,
  adsConfigured: false,
  payoutsEnabled: false,
  revenueShareEnabled: false,
  shareRewardEnabled: false,
  taskDestinations: {},
  socialLinks: {
    x: null,
    telegram: null,
    discord: null,
    facebook: null,
    instagram: null,
    youtube: null,
    announcements: null,
    website: null,
  },
  tasks: PROPOSED_TASKS,
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  telegram,
  children,
}: {
  telegram: TelegramRuntime;
  children: ReactNode;
}) {
  const [config, setConfig] = useState(initialConfig);
  const [configLoading, setConfigLoading] = useState(true);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [accountState, setAccountState] = useState<AccountState>(
    telegram.initData ? "loading" : "preview",
  );
  const [accountError, setAccountError] = useState<string | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const checkInPending = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const announce = useCallback((text: string, tone: ToastMessage["tone"] = "info") => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 4800);
  }, []);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadPublicConfig(telegram)
      .then((publicSettings) => {
        if (mounted) setConfig(publicSettings);
      })
      .catch(() => {
        if (mounted) {
          setConfig((current) => ({
            ...current,
            tasks: PROPOSED_TASKS,
          }));
        }
      })
      .finally(() => {
        if (mounted) setConfigLoading(false);
      });

    return () => {
      mounted = false;
      window.clearTimeout(toastTimer.current);
    };
  }, [telegram]);

  const refreshAccount = useCallback(async (): Promise<AccountSnapshot | null> => {
    if (!telegram.initData) {
      setAccount(null);
      setAccountState("preview");
      setAccountError(null);
      return null;
    }

    setAccountState("loading");
    setAccountError(null);
    try {
      const snapshot = await loadAccount(telegram);
      setAccount(snapshot);
      setAccountState("authenticated");
      return snapshot;
    } catch (error) {
      setAccount(null);
      setAccountState("error");
      const message = error instanceof ApiError
        ? error.message
        : "Account details are temporarily unavailable. Try again shortly.";
      setAccountError(message);
      return null;
    }
  }, [telegram]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  const checkIn = useCallback(async () => {
    if (checkInPending.current) return;
    if (!telegram.initData || !account) {
      announce("Open ABASSI in Telegram to record a verified check-in.", "error");
      return;
    }
    if (!config.checkInEnabled) {
      announce("Check-in points are not enabled until the reward rules are approved.", "info");
      return;
    }

    checkInPending.current = true;
    setCheckingIn(true);
    try {
      const result = await submitDailyCheckIn(telegram);
      announce(`${result.awardedPoints} points have been added to your verified ledger.`, "success");
      await refreshAccount();
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
    } catch (error) {
      announce(
        error instanceof ApiError
          ? error.message
          : "The check-in could not be confirmed. No points were added.",
        error instanceof ApiError && error.status === 409 ? "info" : "error",
      );
      if (error instanceof ApiError && error.status === 409) await refreshAccount();
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("error");
    } finally {
      checkInPending.current = false;
      setCheckingIn(false);
    }
  }, [account, announce, config.checkInEnabled, refreshAccount, telegram]);

  const value = useMemo<AppContextValue>(
    () => ({
      telegram,
      config,
      account,
      accountState,
      accountError,
      configLoading,
      checkingIn,
      toast,
      announce,
      dismissToast,
      refreshAccount,
      checkIn,
    }),
    [
      telegram,
      config,
      account,
      accountState,
      accountError,
      configLoading,
      checkingIn,
      toast,
      announce,
      dismissToast,
      refreshAccount,
      checkIn,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider.");
  return context;
}
