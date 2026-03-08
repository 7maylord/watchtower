"use client";

import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import { useReserveData, useReserveReports, formatTimeAgo } from "@/hooks/useContractData";
import { CONTRACTS } from "@/lib/contracts";

export default function ProofOfReserve() {
  const {
    reserveRatio,
    onChainReserves,
    custodianReserves,
    isHealthy,
    lastVerified,
    isLoading,
  } = useReserveData();

  const { reports: reserveReports, isLoading: reportsLoading } = useReserveReports();

  // Build chart data from Firestore reserve reports
  const reserveRatioHistory = reserveReports.map((r) => ({
    date: r.date,
    ratio: parseFloat(r.reserveRatio) || 100,
  }));

  const displayRatio = reserveRatio ?? 0;
  const displayOnChain = onChainReserves ?? 0;
  const displayCustodian = custodianReserves ?? 0;
  const displayHealthy = isHealthy ?? true;

  // Format for display: if values from contract are in USDC (6 decimals already formatted),
  // they might be small numbers or large depending on actual reserves
  const onChainDisplay =
    displayOnChain >= 1e6
      ? `$${(displayOnChain / 1e6).toFixed(2)}M`
      : displayOnChain >= 1e3
        ? `$${(displayOnChain / 1e3).toFixed(1)}K`
        : `$${displayOnChain.toFixed(2)}`;

  const custodianDisplay =
    displayCustodian >= 1e6
      ? `$${(displayCustodian / 1e6).toFixed(2)}M`
      : displayCustodian >= 1e3
        ? `$${(displayCustodian / 1e3).toFixed(1)}K`
        : `$${displayCustodian.toFixed(2)}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Proof of Reserve
          </h1>
          <p className="text-sm text-muted-foreground">
            On-chain reserve verification and attestation
            {reserveRatio !== undefined && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20">
                ● Live from Sepolia
              </span>
            )}
          </p>
        </div>

        {displayRatio < 100 && (
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 animate-fade-in">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <p className="text-sm text-warning">
              Reserve ratio is below 100%. Current ratio:{" "}
              {displayRatio.toFixed(1)}%
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Big ratio */}
          <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center opacity-0 animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Reserve Ratio
            </p>
            {isLoading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground my-4" />
            ) : (
              <span
                className={`text-5xl font-bold ${
                  displayRatio >= 100 ? "text-success" : "text-warning"
                }`}
              >
                {displayRatio.toFixed(2)}%
              </span>
            )}
            <div className="mt-4 flex items-center gap-1">
              {displayHealthy ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              <span className="text-xs text-muted-foreground">
                {displayHealthy
                  ? "Fully collateralized"
                  : "Under-collateralized"}
              </span>
            </div>
          </div>

          {/* Comparison */}
          <div
            className="glass-card rounded-xl p-6 lg:col-span-2 grid sm:grid-cols-2 gap-6 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Custodian Reserves
              </p>
              {isLoading ? (
                <Loader2 className="inline h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {custodianDisplay}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">USDC</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                On-Chain Balance
              </p>
              {isLoading ? (
                <Loader2 className="inline h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-3xl font-bold text-primary">
                  {onChainDisplay}
                </p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">USDC</p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Reserve Ratio History (30 Days)
          </h3>
          {reportsLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reserveRatioHistory.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              No reserve reports yet — run a Proof of Reserve workflow
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={reserveRatioHistory}>
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
                  domain={[99, 101]}
                  tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine
                  y={100}
                  stroke="hsl(142, 71%, 45%)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
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
                  dataKey="ratio"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Attestation Details */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Attestation Details
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            {[
              ["Attestor", "Watchtower PoR Oracle"],
              [
                "Last Attestation",
                lastVerified
                  ? formatTimeAgo(lastVerified)
                  : "Never",
              ],
              [
                "Oracle Address",
                `${CONTRACTS.proofOfReserveOracle.slice(0, 6)}…${CONTRACTS.proofOfReserveOracle.slice(-4)}`,
              ],
              ["Chain", "Ethereum Sepolia"],
              [
                "Vault Address",
                `${CONTRACTS.fundVault.slice(0, 6)}…${CONTRACTS.fundVault.slice(-4)}`,
              ],
              [
                "Health Status",
                displayHealthy ? "✅ Sufficient" : "⚠️ Insufficient",
              ],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between border-b border-border/50 pb-2"
              >
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono text-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
