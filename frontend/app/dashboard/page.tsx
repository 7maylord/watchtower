"use client";

import {
  HeartPulse,
  ShieldCheck,
  Landmark,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  Clock,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import RiskGauge from "@/components/RiskGauge";
import {
  useRiskScore,
  useReserveData,
  useShouldLiquidate,
  useRiskReports,
  useComplianceHistory,
  useRebalancingHistory,
  formatTimeAgo,
} from "@/hooks/useContractData";

const StatCard = ({
  icon: Icon,
  title,
  children,
  delay,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
  delay: number;
}) => (
  <div
    className="glass-card-hover rounded-xl p-5 opacity-0 animate-fade-in-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="mb-3 flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span className="text-xs font-semibold uppercase tracking-wider">
        {title}
      </span>
    </div>
    {children}
  </div>
);

const LoadingSkeleton = () => (
  <div className="flex items-center gap-2">
    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    <span className="text-xs text-muted-foreground">Loading…</span>
  </div>
);

export default function DashboardPage() {
  const { score, timestamp, isLoading: riskLoading } = useRiskScore();
  const {
    reserveRatio,
    onChainReserves,
    custodianReserves,
    isHealthy,
    isLoading: reserveLoading,
  } = useReserveData();
  const { shouldLiquidate } = useShouldLiquidate();

  // Firestore data
  const { reports: riskReports, isLoading: riskReportsLoading } = useRiskReports();
  const { history: complianceHistory } = useComplianceHistory();
  const { history: rebalancingHistory } = useRebalancingHistory();

  // Build risk score history chart from Firestore
  const riskScoreHistory = riskReports.map((r) => ({
    date: r.date,
    score: r.score,
  }));

  // Build recent activity from all Firestore sources
  const recentActivity = [
    ...riskReports.slice(0, 3).map((r, i) => ({
      id: i + 1,
      workflow: "Portfolio Health Analysis",
      status: (r.status === "critical" ? "error" : r.status === "moderate" ? "warning" : "success") as "success" | "warning" | "error",
      time: r.date,
      details: `Risk score: ${r.score}/100`,
    })),
    ...complianceHistory.slice(0, 3).map((c, i) => ({
      id: i + 100,
      workflow: "Compliance Screening",
      status: (c.status === "flagged" ? "error" : "success") as "success" | "warning" | "error",
      time: c.date,
      details: `${c.address} - ${c.status === "flagged" ? "FLAGGED" : "Approved"}`,
    })),
    ...rebalancingHistory.slice(0, 2).map((r, i) => ({
      id: i + 200,
      workflow: "Rebalancing Check",
      status: "success" as const,
      time: r.date,
      details: r.action,
    })),
  ].slice(0, 8);

  // Latest rebalancing recommendation
  const latestRebalance = rebalancingHistory[0];

  const displayScore = score ?? 0;
  const displayRatio = reserveRatio ?? 0;
  const displayOnChain = onChainReserves ?? 0;
  const displayCustodian = custodianReserves ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Institutional DeFi fund overview
            {score !== undefined && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20">
                ● Live from Sepolia
              </span>
            )}
          </p>
        </div>

        {/* Liquidation Warning */}
        {shouldLiquidate && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive animate-pulse">
            ⚠️ Auto-liquidation triggered — risk score has exceeded the
            threshold (≥ 85).
          </div>
        )}

        {/* Status Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={HeartPulse} title="Portfolio Health" delay={0}>
            {riskLoading ? (
              <LoadingSkeleton />
            ) : (
              <div className="flex items-center justify-between">
                <RiskGauge
                  score={displayScore}
                  size={90}
                  strokeWidth={8}
                  label=""
                />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Last updated</p>
                  <p className="text-xs text-foreground">
                    {formatTimeAgo(timestamp)}
                  </p>
                </div>
              </div>
            )}
          </StatCard>

          <StatCard icon={ShieldCheck} title="Compliance" delay={100}>
            <StatusBadge status="approved" />
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">
                {complianceHistory.length}
              </span>
              <span className="text-xs text-muted-foreground">
                addresses screened
              </span>
            </div>
          </StatCard>

          <StatCard icon={Landmark} title="Reserve Ratio" delay={200}>
            {reserveLoading ? (
              <LoadingSkeleton />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-3xl font-bold ${
                      isHealthy !== false ? "text-success" : "text-destructive"
                    }`}
                  >
                    {displayRatio.toFixed(1)}%
                  </span>
                  {isHealthy !== false ? (
                    <TrendingUp className="h-4 w-4 text-success" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span>
                    {displayOnChain >= 1e3
                      ? `$${(displayOnChain / 1e3).toFixed(1)}K`
                      : `$${displayOnChain.toFixed(2)}`}
                  </span>{" "}
                  /{" "}
                  <span>
                    {displayCustodian >= 1e3
                      ? `$${(displayCustodian / 1e3).toFixed(1)}K`
                      : `$${displayCustodian.toFixed(2)}`}{" "}
                    reported
                  </span>
                </div>
              </>
            )}
          </StatCard>

          <StatCard icon={ArrowLeftRight} title="Rebalancing" delay={300}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success border border-success/20">
                {latestRebalance?.action ?? "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <span className="text-sm font-semibold text-foreground">
                {latestRebalance
                  ? `${(latestRebalance.confidence * 100).toFixed(0)}%`
                  : "—"}
              </span>
            </div>
          </StatCard>
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div
            className="glass-card rounded-xl p-5 lg:col-span-2 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "400ms" }}
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Risk Score History
            </h3>
            {riskReportsLoading ? (
              <div className="flex items-center justify-center h-[260px]">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : riskScoreHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
                No risk reports yet — run a Portfolio Health workflow
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={riskScoreHistory}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(215, 28%, 17%)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(224, 71%, 6%)",
                      border: "1px solid hsl(215, 28%, 20%)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "hsl(213, 31%, 91%)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "500ms" }}
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Activity
            </h3>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No activity yet — run a CRE workflow
                </p>
              ) : (
                recentActivity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg bg-muted/30 p-3"
                  >
                    <StatusBadge status={item.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.workflow}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.details}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {item.time}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
