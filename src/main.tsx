import React from "react";
import ReactDOM from "react-dom/client";
import {
  backButton,
  init,
  miniApp,
  retrieveLaunchParams,
  retrieveRawInitData,
  viewport,
} from "@tma.js/sdk-react";
import App from "./App";
import "./styles.css";

export interface TelegramRuntime {
  isTelegram: boolean;
  initData: string | null;
  platform: string | null;
  sdkWarning: string | null;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready(): void;
        expand(): void;
        openTelegramLink?(url: string): void;
        openLink?(url: string, options?: { try_instant_view?: boolean }): void;
        HapticFeedback?: {
          impactOccurred(style: "light" | "medium" | "heavy"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
        };
      };
    };
  }
}

function initializeTelegram(): TelegramRuntime {
  try {
    const launchParams = retrieveLaunchParams();
    const initData = retrieveRawInitData() ?? null;
    if (!initData || !launchParams.tgWebAppData) {
      return { isTelegram: false, initData: null, platform: null, sdkWarning: null };
    }

    init({ acceptCustomStyles: true });
    miniApp.mount();
    try {
      if (miniApp.setBgColor.isSupported()) miniApp.setBgColor("#000000");
      if (miniApp.setHeaderColor.isSupported()) miniApp.setHeaderColor("#000000");
      if (miniApp.setBottomBarColor.isSupported()) miniApp.setBottomBarColor("#000000");
    } catch (error) {
      console.warn("The Telegram client did not accept the requested app colors.", error);
    }
    backButton.mount();
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();

    void viewport.mount()
      .then(() => {
        viewport.bindCssVars();
        viewport.expand();
      })
      .catch((error: unknown) => {
        console.warn("Telegram viewport data is unavailable; using safe-area CSS fallbacks.", error);
      });

    return {
      isTelegram: true,
      initData,
      platform: launchParams.tgWebAppPlatform,
      sdkWarning: null,
    };
  } catch (error) {
    return {
      isTelegram: false,
      initData: null,
      platform: null,
      sdkWarning: error instanceof Error ? error.message : "The Telegram SDK could not be initialized.",
    };
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App telegram={initializeTelegram()} />
  </React.StrictMode>,
);
