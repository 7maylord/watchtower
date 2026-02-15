"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";
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
import { reserveRatioHistory } from "@/lib/mock-data";

const currentRatio = 99.8;
const reported = 2_400_000;
const onChain = 2_395_200;

export default function ProofOfReserve() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Proof of Reserve
          </h1>
          <p className="text-sm text-muted-foreground">
            On-chain reserve verification and attestation
          </p>
        </div>

        {currentRatio < 100 && (
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 animate-fade-in">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <p className="text-sm text-warning">
              Reserve ratio is below 100%. Current ratio: {currentRatio}%
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Big ratio */}
          <div className="glass-card rounded-xl p-6 flex flex-col items-center justify-center opacity-0 animate-fade-in-up">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Reserve Ratio
            </p>
            <span
              className={`text-5xl font-bold ${
                currentRatio >= 100 ? "text-success" : "text-warning"
              }`}
            >
              {currentRatio.toFixed(2)}%
            </span>
            <div className="mt-4 flex items-center gap-1">
              {currentRatio >= 100 ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
              <span className="text-xs text-muted-foreground">
                {currentRatio >= 100
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
                Reported Reserves
              </p>
              <p className="text-3xl font-bold text-foreground">
                ${(reported / 1e6).toFixed(2)}M
              </p>
              <p className="mt-1 text-sm text-muted-foreground">USDC</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                On-Chain Balance
              </p>
              <p className="text-3xl font-bold text-primary">
                ${(onChain / 1e6).toFixed(2)}M
              </p>
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
              ["Attestor", "Watchtower Risk Oracle"],
              ["Last Attestation", "Feb 15, 2026 14:32 UTC"],
              ["Vault Address", "0x7a3B...9f2E"],
              ["Chain", "Ethereum Sepolia"],
              ["IPFS Report", "QmReserve001..."],
              ["Block Number", "19,847,293"],
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
