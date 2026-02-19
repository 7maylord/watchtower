"use client";

import { Play, ExternalLink, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import RiskGauge from "@/components/RiskGauge";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { riskBreakdown, healthAssessments } from "@/lib/mock-data";
import {
  useRiskScore,
  useFundVaultStats,
  formatTimeAgo,
} from "@/hooks/useContractData";

const aiRecommendations = [
  {
    title: "Reduce Concentration",
    text: "Consider diversifying lending positions across 2-3 additional protocols to reduce single-protocol exposure.",
  },
  {
    title: "Hedge Market Risk",
    text: "Current market volatility suggests acquiring put options on ETH to hedge downside exposure.",
  },
  {
    title: "Increase Stablecoin Buffer",
    text: "Maintain a minimum 65% stablecoin allocation during high-volatility periods.",
  },
];

export default function PortfolioHealth() {
  const { score, timestamp, ipfsHash, isLoading: riskLoading } = useRiskScore();
  const {
    totalSupply,
    sharePrice,
    isLoading: vaultLoading,
  } = useFundVaultStats();

  const displayScore = score ?? 32;
  const displaySharePrice = sharePrice ?? 1.02;
  const displayTotalAssets =
    totalSupply && sharePrice ? (totalSupply * sharePrice) / 1e6 : 2.4;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Portfolio Health
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered risk analysis and recommendations
              {score !== undefined && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20">
                  ● Live
                </span>
              )}
            </p>
          </div>
          <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground border-0">
            <Play className="h-4 w-4" />
            Run Analysis
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Gauge */}
          <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center opacity-0 animate-fade-in-up">
            {riskLoading ? (
              <div className="flex flex-col items-center gap-2 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Reading on-chain…
                </span>
              </div>
            ) : (
              <>
                <RiskGauge score={displayScore} size={200} strokeWidth={14} />
                {timestamp && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Updated {formatTimeAgo(timestamp)}
                  </p>
                )}
              </>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4 w-full text-center">
              <div>
                <p className="text-lg font-bold text-foreground">
                  {vaultLoading ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    `$${displayTotalAssets.toFixed(1)}M`
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Total Assets</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">
                  {vaultLoading ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    `$${displaySharePrice.toFixed(2)}`
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Share Price</p>
              </div>
            </div>
          </div>

          {/* AI Recommendations */}
          <div
            className="glass-card rounded-xl p-5 lg:col-span-2 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              AI Recommendations
            </h3>
            <div className="space-y-3">
              {aiRecommendations.map((rec, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-primary/20 bg-primary/5 p-4"
                >
                  <h4 className="text-sm font-semibold text-primary">
                    {rec.title}
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {rec.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* IPFS Hash display */}
        {ipfsHash && ipfsHash !== "" && (
          <div
            className="glass-card rounded-xl p-4 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "150ms" }}
          >
            <p className="text-xs text-muted-foreground mb-1">
              Latest IPFS Report
            </p>
            <a
              href={`https://gateway.pinata.cloud/ipfs/${ipfsHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-mono"
            >
              {ipfsHash.length > 20
                ? `${ipfsHash.slice(0, 10)}…${ipfsHash.slice(-10)}`
                : ipfsHash}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Risk Breakdown */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Risk Factor Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={riskBreakdown} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(215, 28%, 17%)"
                horizontal={false}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="factor"
                type="category"
                tick={{ fontSize: 12, fill: "hsl(215, 20%, 55%)" }}
                tickLine={false}
                axisLine={false}
                width={140}
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
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {riskBreakdown.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Historical Assessments */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Historical Assessments
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Score</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">IPFS Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {healthAssessments.map((a, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 text-foreground">{a.date}</td>
                    <td className="py-3 font-mono font-semibold text-foreground">
                      {a.score}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="py-3">
                      <a
                        href="#"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {a.ipfsHash} <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
