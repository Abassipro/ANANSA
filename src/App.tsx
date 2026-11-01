import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { backButton } from "@tma.js/sdk-react";
import { BadgeCheck, BellRing, CircleHelp } from "lucide-react";
import type { TelegramRuntime } from "./main";
import { AppProvider, useAppContext } from "./context/AppContext";
import { HomePage } from "./pages/HomePage";
import { TasksPage } from "./pages/TasksPage";
import { ReferralsPage } from "./pages/ReferralsPage";
import { RewardsPage } from "./pages/RewardsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AppShell } from "./components/AppShell";

export default function App({ telegram }: { telegram: TelegramRuntime }) {
  return (
    <AppProvider telegram={telegram}>
      <BrowserRouter>
        <TelegramBackButton />
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="referrals" element={<ReferralsPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <AppNotifications />
      </BrowserRouter>
    </AppProvider>
  );
}

function TelegramBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { telegram } = useAppContext();

  useEffect(() => {
    if (!telegram.isTelegram) return;
    try {
      if (!backButton.isSupported()) return;
      backButton.mount();
      if (location.pathname === "/") {
        backButton.hide();
        return;
      }
      backButton.show();
      const removeListener = backButton.onClick(() => navigate(-1));
      return () => {
        removeListener();
        backButton.hide();
      };
    } catch (error) {
      console.warn("The Telegram BackButton is unavailable on this client.", error);
    }
  }, [telegram.isTelegram, location.pathname, navigate]);

  return null;
}

function AppNotifications() {
  const { toast, dismissToast } = useAppContext();
  if (!toast) return null;

  const Icon = toast.tone === "success"
    ? BadgeCheck
    : toast.tone === "error"
      ? CircleHelp
      : BellRing;

  return (
    <div
      className={`toast toast--${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
      <span>{toast.text}</span>
      <button className="icon-button toast-dismiss" onClick={dismissToast} aria-label="Dismiss message">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
