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
import { portfolioAllocation, rebalancingHistory } from "@/lib/mock-data";

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
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Rebalancing Advisor
          </h1>
          <p className="text-sm text-muted-foreground">
            AI-powered portfolio rebalancing recommendations
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Donut */}
          <div className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Current Allocation
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={portfolioAllocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={4}
                  stroke="none"
                >
                  {portfolioAllocation.map((entry, i) => (
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
              {portfolioAllocation.map((a, i) => (
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
                ) => [typeof value === "number" ? `${value}%` : `${value}`, name || ""]}
              />
              <Scatter data={scatterData} fill="hsl(217, 91%, 60%)" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* History */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
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
