import { useCallback, useEffect, useMemo, useState } from "react";
import { FaArrowRotateRight } from "react-icons/fa6";
import { competitionLabel, type Competition, type Sport } from "@fiveaside/shared";
import { AppHeader } from "../components/AppHeader";
import { useAuth } from "../hooks/useAuth";
import { getAdminDashboard, type AdminDashboardData, type AdminUsageRow } from "../utils/authApi";

const MODE_LABELS: Record<string, string> = {
  "ai-casual": "Casual AI",
  "ai-competitive": "Competitive AI",
  "ai-expert": "Expert AI",
  daily: "Daily challenge",
  "online-random": "Online random",
  "online-private": "Online private",
  challenge: "Shared challenge",
  local: "Couch draft",
};

function formatDate(value: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatRelative(value: number): string {
  const elapsed = Math.max(0, Date.now() - value);
  const days = Math.floor(elapsed / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

function poolName(key: string): string {
  const separator = key.indexOf(":");
  const sport = key.slice(0, separator) as Sport;
  const competition = key.slice(separator + 1) as Competition;
  if ((sport !== "basketball" && sport !== "soccer") || !competition) return key;
  return competitionLabel(sport, competition);
}

function UsageList({ rows, label }: { rows: AdminUsageRow[]; label: (key: string) => string }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  if (rows.length === 0) return <p className="admin-empty">Completed signed-in games will appear here.</p>;
  return (
    <div className="admin-usage-list">
      {rows.map((row) => (
        <div className="admin-usage-row" key={row.key}>
          <div><span>{label(row.key)}</span><strong>{row.count}</strong></div>
          <span className="admin-usage-track"><span style={{ width: `${Math.max(4, row.count / maximum * 100)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

export function AdminPage() {
  const auth = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!auth.user?.isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminDashboard());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, [auth.user?.isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const averageGames = useMemo(() => {
    if (!data?.totals.users) return "0.0";
    return (data.totals.gamesCompleted / data.totals.users).toFixed(1);
  }, [data]);

  return (
    <main className="game-page admin-page">
      <AppHeader
        eyebrow="OWNER DASHBOARD"
        title="User analytics"
        detail={data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Private account and game activity"}
        showSportSwitch={false}
        actions={auth.user?.isAdmin ? (
          <button className="icon-button" onClick={() => void load()} disabled={loading} aria-label="Refresh dashboard" title="Refresh dashboard">
            <FaArrowRotateRight aria-hidden="true" />
          </button>
        ) : undefined}
      />

      {auth.status === "loading" ? (
        <div className="admin-state"><span className="search-pulse" /> Checking access</div>
      ) : !auth.user ? (
        <section className="admin-state"><h2>Sign in required</h2><p>Use the account button above and sign in with the owner Google account.</p></section>
      ) : !auth.user.isAdmin ? (
        <section className="admin-state"><h2>Access unavailable</h2><p>This dashboard is limited to the site owner.</p></section>
      ) : error ? (
        <section className="admin-state admin-state-error"><h2>Dashboard unavailable</h2><p>{error}</p><button className="secondary" onClick={() => void load()}>Try again</button></section>
      ) : !data ? (
        <div className="admin-state"><span className="search-pulse" /> Loading analytics</div>
      ) : (
        <div className="admin-dashboard">
          <section className="admin-metrics" aria-label="Account summary">
            <div><span>Registered</span><strong>{data.totals.users}</strong><small>all accounts</small></div>
            <div><span>New users</span><strong>{data.totals.signups7d}</strong><small>{data.totals.signups30d} in 30 days</small></div>
            <div><span>Active users</span><strong>{data.totals.active7d}</strong><small>{data.totals.active30d} in 30 days</small></div>
            <div><span>Games</span><strong>{data.totals.gamesCompleted}</strong><small>signed-in completions</small></div>
            <div><span>Games / user</span><strong>{averageGames}</strong><small>all time average</small></div>
          </section>

          <div className="admin-breakdowns">
            <section>
              <div className="admin-section-heading"><span className="page-eyebrow">PLAYER POOLS</span><h2>What people draft</h2></div>
              <UsageList rows={data.poolUsage} label={poolName} />
            </section>
            <section>
              <div className="admin-section-heading"><span className="page-eyebrow">GAME MODES</span><h2>How people play</h2></div>
              <UsageList rows={data.modeUsage} label={(key) => MODE_LABELS[key] ?? key} />
            </section>
          </div>

          <section className="admin-users">
            <div className="admin-section-heading"><span className="page-eyebrow">LATEST ACCOUNTS</span><h2>Registered users</h2><small>Most recent 100</small></div>
            {data.users.length === 0 ? <p className="admin-empty">Accounts will appear after their next visit.</p> : (
              <div className="admin-table-wrap">
                <table>
                  <thead><tr><th>User</th><th>Joined</th><th>Last active</th><th>Games</th><th>Basketball</th><th>Football</th></tr></thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.accountId}>
                        <td data-label="User"><strong>{user.displayName}</strong><small>{user.email}</small></td>
                        <td data-label="Joined">{formatDate(user.createdAt)}</td>
                        <td data-label="Last active">{formatRelative(user.lastActiveAt)}</td>
                        <td data-label="Games">{user.gamesCompleted}</td>
                        <td data-label="Basketball">{user.basketballGames}</td>
                        <td data-label="Football">{user.footballGames}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
