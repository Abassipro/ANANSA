import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, CalendarCheck, Check, CircleHelp, Clock3, Film, Globe2, Instagram, Search, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react";
import { PageHeading } from "../components/PageHeading";
import { useAppContext } from "../context/AppContext";
import type { TaskDefinition, TaskFilter } from "../types";
import { ApiError, submitSocialTask } from "../api";
import { showAdsgramRewardedAd } from "../adsgram";

const taskIcons: Record<string, typeof Sparkles> = {
  daily_checkin: CalendarCheck,
  follow_x: X,
  telegram_channel: UsersRound,
  join_discord: UsersRound,
  follow_facebook: Globe2,
  follow_instagram: Instagram,
  subscribe_youtube: Film,
  engage_x_post: Sparkles,
  rewarded_ad_5: Film,
  rewarded_ad_10: Film,
  rewarded_ad_15: Film,
  rewarded_ad_20: Film,
};

const filters: { key: TaskFilter; label: string }[] = [
  { key: "all", label: "All tasks" },
  { key: "daily", label: "Daily" },
  { key: "social", label: "Social" },
  { key: "ads", label: "Rewarded ads" },
];

export function TasksPage() {
  const { config, configLoading, account, accountState, checkingIn, checkIn, announce, refreshAccount, telegram } = useAppContext();
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");
  const [openedTaskIds, setOpenedTaskIds] = useState<Set<string>>(() => new Set());
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [activeAdTaskId, setActiveAdTaskId] = useState<string | null>(null);
  const adRequestPending = useRef(false);
  const tasks = config.tasks.length > 0 ? config.tasks : [];
  const matchingTasks = useMemo(() => tasks.filter((task) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "daily" && task.frequency === "daily" && task.kind !== "rewarded_ad") ||
      (filter === "social" && task.kind === "social") ||
      (filter === "ads" && task.kind === "rewarded_ad");
    const query = search.trim().toLowerCase();
    return matchesFilter && (!query || `${task.title} ${task.description}`.toLowerCase().includes(query));
  }), [filter, search, tasks]);

  const openDestination = (task: TaskDefinition) => {
    if (!task.destinationUrl) return;
    const target = new URL(task.destinationUrl);
    if (target.protocol !== "https:") {
      announce("Task destinations must use HTTPS.", "error");
      return;
    }
    try {
      if (window.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(target.toString());
      } else {
        const opened = window.open(target.toString(), "_blank", "noopener,noreferrer");
        if (!opened) {
          announce("The task link was blocked by the browser. Allow pop-ups and try again.", "error");
          return;
        }
      }
      setOpenedTaskIds((current) => new Set(current).add(task.id));
    } catch {
      announce("The task destination could not be opened.", "error");
      return;
    }
    announce("Task opened. Continue only after completing it; opening a link does not award points.");
  };

  const submitTaskForVerification = async (task: TaskDefinition) => {
    if (submittingTaskId) return;
    setSubmittingTaskId(task.id);
    try {
      const result = await submitSocialTask(telegram, task.id);
      announce(
        result.submitted
          ? "Your claim is stored as pending verification. Provider review is not configured; no points were awarded."
          : `This task is already ${result.status.replaceAll("_", " ")}. No additional reward was granted.`,
        result.status === "rejected" ? "info" : "success",
      );
      await refreshAccount();
    } catch (error) {
      announce(
        error instanceof ApiError
          ? error.message
          : "The task request could not be recorded. No points were awarded.",
        "error",
      );
    } finally {
      setSubmittingTaskId(null);
    }
  };

  const showRewardedAd = async (task: TaskDefinition) => {
    if (adRequestPending.current) return;
    if (!account || !config.adsgramBlockId) {
      announce("Rewarded ads are not configured for this account.", "error");
      return;
    }

    adRequestPending.current = true;
    setActiveAdTaskId(task.id);
    try {
      await showAdsgramRewardedAd(config.adsgramBlockId);
      announce(
        "Ad completed. No points were awarded because AdsGram does not authenticate its server callback.",
        "info",
      );
    } catch {
      announce("The ad was skipped, unavailable, or failed. No points were awarded.", "error");
    } finally {
      adRequestPending.current = false;
      setActiveAdTaskId(null);
    }
  };

  return (
    <div className="page-stack">
      <PageHeading kicker="ACTIVITY & OPPORTUNITY" title="Small actions." accent="Real progress." description="Every reward is shown with its real verification status. Proposed points are not a promise or a claim." />

      <section className="task-summary-banner" aria-label="Points and task verification">
        <span className="task-summary-icon"><ShieldCheck size={19} /></span>
        <div><strong>{accountState === "authenticated" ? `${account?.user.points.toLocaleString() ?? "—"} verified points` : "Your verified points stay yours."}</strong><p>Every awarded point will be recorded on the server. Following or opening a link is never treated as proof.</p></div>
        <span className="task-summary-note">{account ? "Ledger-backed" : "Sign in required"}</span>
      </section>

      <section className="task-browser" aria-labelledby="task-list-title">
        <div className="task-browser-heading">
          <div><p className="eyebrow">THE TASK BOARD</p><h2 id="task-list-title">Find your next task.</h2><p>Rewards shown are proposed until official reward rules are approved.</p></div>
          <label className="task-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search tasks</span><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search tasks…" /></label>
        </div>

        <div className="task-filters" role="group" aria-label="Filter tasks">
          {filters.map((option) => (
            <button key={option.key} type="button" aria-pressed={filter === option.key} className={filter === option.key ? "task-filter is-active" : "task-filter"} onClick={() => setFilter(option.key)}>{option.label}</button>
          ))}
          <span className="filter-count">{matchingTasks.length} tasks</span>
        </div>

        <div className="task-column-head" aria-hidden="true"><span>Task</span><span>Proposed</span><span>Verification</span><span>Action</span></div>
        <div className="task-list">
          {configLoading ? <div className="empty-state"><span className="loading-indicator" />Loading approved task settings…</div> :
            matchingTasks.length > 0 ? matchingTasks.map((task) => {
              const Icon = taskIcons[task.id] ?? Sparkles;
              const isCheckIn = task.kind === "daily_checkin";
              const checkInToday = isCheckIn && Boolean(account?.todaysCheckIn);
              const completionStatus = account?.taskStatuses[task.id] ?? null;
              const isApproved = completionStatus === "approved";
              const isRejected = completionStatus === "rejected";
              const isRewardedAd = task.kind === "rewarded_ad";
              const actionAvailable = isCheckIn
                ? Boolean(account && config.checkInEnabled && !checkInToday)
                : isRewardedAd
                  ? Boolean(account && config.adsgramBlockId)
                  : !isApproved && !completionStatus && task.kind === "social" && Boolean(task.destinationUrl);
              return (
                <article className="task-row" key={task.id}>
                  <span className={`task-row-icon task-row-icon--${task.kind}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
                  <div className="task-row-main">
                    <h3>{task.title}</h3>
                    <p>{task.description}</p>
                    {task.kind === "social" && task.destinationUrl && <span className="task-external-label">Official destination configured · completion still requires verification</span>}
                  </div>
                  <div className="task-points"><strong>{task.proposedPoints}</strong><span>points · proposed</span></div>
                  <span className={`verification-pill ${checkInToday || isApproved ? "verification-pill--complete" : actionAvailable ? "verification-pill--open" : "verification-pill--pending"}`}>
                    {checkInToday || isApproved ? <Check size={12} /> : task.kind === "daily_checkin" ? <CalendarCheck size={12} /> : task.kind === "rewarded_ad" ? <Film size={12} /> : <Clock3 size={12} />}
                    {checkInToday ? "Checked in" : isApproved ? "Verified" : isRejected ? "Not verified" : completionStatus === "pending_verification" ? "Awaiting verification" : task.kind === "daily_checkin" ? config.checkInEnabled ? "Ready" : "Policy pending" : isRewardedAd ? config.adsgramBlockId ? "Ad available · no points" : "Provider setup required" : task.destinationUrl ? "Needs verification" : "Awaiting official URL"}
                  </span>
                  {isCheckIn && actionAvailable ? (
                    <button className="task-action" disabled={checkingIn} onClick={() => void checkIn()}>{checkingIn ? "Recording…" : "Check in"}</button>
                  ) : isRewardedAd && actionAvailable ? (
                    <button
                      className="task-action"
                      disabled={activeAdTaskId !== null}
                      onClick={() => void showRewardedAd(task)}
                    >
                      {activeAdTaskId === task.id ? "Loading ad…" : "Watch ad"}
                    </button>
                  ) : !isCheckIn && actionAvailable ? (
                    <button
                      className="task-action"
                      disabled={submittingTaskId === task.id}
                      onClick={() => openedTaskIds.has(task.id)
                        ? void submitTaskForVerification(task)
                        : openDestination(task)}
                    >
                      {submittingTaskId === task.id
                        ? "Submitting…"
                        : openedTaskIds.has(task.id)
                          ? "Record claim"
                          : <>Open link <ArrowUpRight size={13} /></>}
                    </button>
                  ) : (
                    <button className="task-action task-action--disabled" disabled aria-label={checkInToday ? "Already checked in today" : task.kind === "rewarded_ad" ? "Rewarded ads are not configured" : "Awaiting campaign configuration"}>
                      {checkInToday || isApproved ? "Done" : isRewardedAd ? "Unavailable" : "Not available"}
                    </button>
                  )}
                </article>
              );
            }) : (
              <div className="empty-state"><CircleHelp size={18} /><span>No tasks match this search.</span><button className="quiet-button" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button></div>
            )}
        </div>

        <div className="task-info-footer"><CircleHelp size={15} /><span>Points are earned only after server-verified completion. Social actions, ad views and test data cannot create a real reward.</span><ArrowDownToLine size={15} className="task-info-arrow" /></div>
      </section>

      <section className="social-task-reminder"><span className="reminder-icon"><ShieldCheck size={16} /></span><p><strong>No unofficial links.</strong> Social destinations remain empty until approved. Configure only genuine ABASSI accounts through the backend environment.</p></section>
    </div>
  );
}
