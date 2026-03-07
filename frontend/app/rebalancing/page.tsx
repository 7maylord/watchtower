"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  ZAxis,
} from "recharts";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import { portfolioAllocation as mockAllocation } from "@/lib/mock-data";
import {
  usePortfolioAllocation,
  useTotalAssets,
  useRiskScore,
  useRebalancingHistory,
  useActiveChainContracts,
} from "@/hooks/useContractData";
import {
  CONTRACTS,
  fundVaultAbi,
  SUPPORTED_CHAINS,
} from "@/lib/contracts";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { Loader2, ExternalLink, RefreshCw, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCCIPBridge } from "@/hooks/useCCIPBridge";
import { useState } from "react";
import { parseUnits, formatUnits, type Address } from "viem";

const scatterData = [
  { risk: 15, return: 4.2, name: "Stablecoins" },
  { risk: 35, return: 8.5, name: "Lending" },
  { risk: 55, return: 12.3, name: "Liquidity" },
  { risk: 25, return: 6.1, name: "Yield Farming" },
  { risk: 70, return: 18.5, name: "Leveraged" },
];

const suggestedActions = [
  "Increase USDC allocation from 40% → 45% to buffer against market downturn",
  "Reduce Aave V3 lending position by 3% to lower protocol concentration",
  "Maintain current Uniswap V3 LP position — within acceptable IL range",
  "Consider adding Compound V3 allocation for lending diversification",
];

export default function Rebalancing() {
  const { allocation, isLoading: allocLoading } = usePortfolioAllocation();
  const { totalAssets } = useTotalAssets();
  useRiskScore();
  const { history: rebalancingHistory, isLoading: historyLoading } =
    useRebalancingHistory();

  // Cross-chain bridge state
  const [bridgeAmount, setBridgeAmount] = useState("");
  const { address } = useAccount();
  const { chainId } = useActiveChainContracts();
  const parsedAmount =
    bridgeAmount && !isNaN(Number(bridgeAmount))
      ? parseUnits(bridgeAmount, 18)
      : BigInt(0);

  const {
    destChainName,
    bridgeFee,
    isFeeLoading,
    bridgeShares: doBridge,
    txHash: bridgeTxHash,
    isPending: isBridging,
    isSuccess: isBridgeSuccess,
    isWriteError: isBridgeError,
    writeError: bridgeWriteError,
    reset: resetBridge,
  } = useCCIPBridge(address as Address | undefined, parsedAmount);

  const displayAllocation = allocation ?? mockAllocation;
  const isLive = allocation !== undefined;
  const displayTotal = totalAssets ?? 2.4;

  const { isConnected } = useAccount();
  const {
    writeContract,
    data: txHash,
    isPending: isWriting,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  const handleRequestRebalance = () => {
    writeContract({
      address: CONTRACTS.fundVault,
      abi: fundVaultAbi,
      functionName: "requestRebalance",
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Rebalancing Advisor
            </h1>
            <p className="text-sm text-muted-foreground">
              AI-powered portfolio rebalancing recommendations
              {isLive && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20">
                  ● Live from Sepolia
                </span>
              )}
            </p>
          </div>
          <Button
            onClick={handleRequestRebalance}
            disabled={!isConnected || isWriting || isConfirming}
            className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground border-0"
          >
            {isWriting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isWriting
              ? "Confirm in wallet…"
              : isConfirming
                ? "Confirming…"
                : "Request Rebalance"}
          </Button>
        </div>

        {isTxSuccess && txHash && (
          <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 animate-fade-in">
            <span className="text-sm text-success font-medium">
              ✅ RebalanceRequested emitted!
            </span>
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-8)}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-xs text-muted-foreground">
              Copy tx hash → cre local simulate
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Donut */}
          <div className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Current Allocation
            </h3>
            {allocLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={displayAllocation}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={4}
                      stroke="none"
                    >
                      {displayAllocation.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(224, 71%, 6%)",
                        border: "1px solid hsl(215, 28%, 20%)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "hsl(213, 31%, 91%)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-2">
                  {displayAllocation.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: a.color }}
                      />
                      <span className="text-muted-foreground">
                        {a.name} {a.value}%
                      </span>
                    </div>
                  ))}
                </div>
                {isLive && (
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    Total: $
                    {displayTotal >= 1e6
                      ? `${(displayTotal / 1e6).toFixed(1)}M`
                      : displayTotal >= 1e3
                        ? `${(displayTotal / 1e3).toFixed(0)}K`
                        : displayTotal.toFixed(2)}{" "}
                    USDC
                  </p>
                )}
              </>
            )}
          </div>

          {/* Recommendation */}
          <div
            className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              AI Recommendation
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-4 py-2 text-lg font-bold text-success border border-success/20">
                HOLD
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Confidence</p>
                <p className="text-xl font-bold text-foreground">92%</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Current portfolio allocation is within optimal risk-adjusted
              parameters. No immediate rebalancing required. Monitor lending
              exposure for changes.
            </p>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Suggested Actions
            </h4>
            <ul className="space-y-2">
              {suggestedActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Scatter */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Risk vs Return
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(215, 28%, 17%)"
              />
              <XAxis
                dataKey="risk"
                name="Risk"
                unit="%"
                tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="return"
                name="Return"
                unit="%"
                tick={{ fontSize: 11, fill: "hsl(215, 20%, 55%)" }}
                tickLine={false}
                axisLine={false}
              />
              <ZAxis range={[80, 200]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(224, 71%, 6%)",
                  border: "1px solid hsl(215, 28%, 20%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(213, 31%, 91%)",
                }}
                formatter={(
                  value: string | number | (string | number)[],
                  name: string,
                ) => [
                  typeof value === "number" ? `${value}%` : `${value}`,
                  name || "",
                ]}
              />
              <Scatter data={scatterData} fill="hsl(217, 91%, 60%)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Cross-Chain Bridge */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Cross-Chain Bridge (CCIP)
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Source Chain
                </label>
                <p className="text-sm font-medium text-foreground">
                  {SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ??
                    "Unknown"}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Destination Chain
                </label>
                <p className="text-sm font-medium text-foreground">
                  {destChainName}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Amount (WRWA Shares)
                </label>
                <input
                  type="number"
                  placeholder="0.0"
                  value={bridgeAmount}
                  onChange={(e) => {
                    resetBridge();
                    setBridgeAmount(e.target.value);
                  }}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  Estimated CCIP Fee
                </label>
                <p className="text-sm font-medium text-foreground">
                  {isFeeLoading
                    ? "Estimating…"
                    : bridgeFee
                      ? `${formatUnits(bridgeFee, 18)} ETH`
                      : "Enter amount"}
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Receiver
                </label>
                <p className="text-xs font-mono text-muted-foreground truncate">
                  {address
                    ? `${address.slice(0, 10)}…${address.slice(-8)}`
                    : "Connect wallet"}
                </p>
              </div>

              <Button
                onClick={doBridge}
                disabled={
                  !isConnected ||
                  isBridging ||
                  !bridgeFee ||
                  parsedAmount === BigInt(0)
                }
                className="w-full gap-2 bg-gradient-to-r from-accent to-primary hover:opacity-90 text-primary-foreground border-0"
              >
                {isBridging ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                {isBridging ? "Confirm in wallet…" : "Bridge Shares"}
              </Button>

              {isBridgeSuccess && bridgeTxHash && (
                <div className="flex items-center gap-2 text-xs text-success">
                  <span>Bridged!</span>
                  <a
                    href={`https://ccip.chain.link/msg/${bridgeTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline font-mono"
                  >
                    Track on CCIP Explorer
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {isBridgeError && (
                <p className="text-xs text-destructive">
                  {bridgeWriteError?.message?.slice(0, 100) ?? "Bridge failed"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* History */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "400ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Rebalancing History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Confidence</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rebalancingHistory.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 text-muted-foreground">{r.date}</td>
                    <td className="py-3 text-foreground">{r.action}</td>
                    <td className="py-3 font-semibold text-foreground">
                      {(r.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-3">
                      <StatusBadge status={r.status} />
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
