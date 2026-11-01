import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowDownToLine, CircleUserRound, Compass, House, ListChecks, Plus, UsersRound } from "lucide-react";
import { AppFooter } from "./AppFooter";
import { useAppContext } from "../context/AppContext";

const navigation = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/referrals", label: "Referrals", icon: UsersRound },
  { to: "/rewards", label: "Rewards", icon: ArrowDownToLine },
  { to: "/profile", label: "Profile", icon: CircleUserRound },
];

export function AppShell() {
  const { accountState, telegram } = useAppContext();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const title = navigation.find((item) => item.to === location.pathname)?.label ?? "Home";

  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-background">
      <div className="ambient-coins" aria-hidden="true">
        <span className="ambient-coin ambient-coin--one"><img src="/abassi-mark.png" alt="" /></span>
        <span className="ambient-coin ambient-coin--two"><img src="/abassi-mark.png" alt="" /></span>
      </div>
      <div className="app-shell">
        <header className="app-header">
          <NavLink to="/" className="brand" aria-label="ABASSI home">
            <span className="brand-mark"><img src="/abassi-mark.png" alt="" width="38" height="38" /></span>
            <span className="brand-name">ABASSI</span>
            <span className="brand-divider" aria-hidden="true" />
            <span className="brand-app">COMMUNITY</span>
          </NavLink>
          <div className="header-actions">
            <div className={`header-identity${accountState === "authenticated" ? " is-verified" : ""}`}>
              <span className="identity-dot" />
              <span>{accountState === "authenticated" ? "Verified account" : telegram.isTelegram ? "Connecting" : "Preview mode"}</span>
            </div>
          </div>
        </header>

        <main className="main-content" id="main">
          <div className="mobile-page-context">
            <Compass size={13} strokeWidth={1.8} aria-hidden="true" />
            <span>{title}</span>
          </div>
          <Outlet />
          <AppFooter />
        </main>

        <div className="bottom-navigation-wrap">
          <nav className="bottom-navigation" aria-label="Primary app navigation">
            {navigation.slice(0, 4).map((item) => (
              <NavLink
                end={item.end}
                key={item.to}
                to={item.to}
                className={({ isActive }) => isActive ? "bottom-link is-active" : "bottom-link"}
                aria-label={item.label}
                aria-current={location.pathname === item.to ? "page" : undefined}
              >
                <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className={`bottom-more-trigger${location.pathname === "/profile" ? " is-active" : ""}`}
            aria-label={isMoreOpen ? "Close more navigation" : "More navigation"}
            aria-expanded={isMoreOpen}
            aria-controls="bottom-more-navigation"
            onClick={() => setIsMoreOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsMoreOpen(false);
            }}
          >
            <Plus size={21} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div
            className="bottom-more-menu"
            id="bottom-more-navigation"
            aria-label="More app destinations"
            hidden={!isMoreOpen}
          >
            <NavLink
              to="/profile"
              className={({ isActive }) => isActive ? "bottom-more-link is-active" : "bottom-more-link"}
              aria-current={location.pathname === "/profile" ? "page" : undefined}
              onClick={() => setIsMoreOpen(false)}
            >
              <CircleUserRound size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Profile</span>
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}
