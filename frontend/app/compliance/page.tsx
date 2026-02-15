"use client";

import { useState } from "react";
import {
  Search,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { complianceHistory } from "@/lib/mock-data";

export default function Compliance() {
  const [searchAddr, setSearchAddr] = useState("");
  const [result, setResult] = useState<null | {
    address: string;
    sanctioned: boolean;
    riskScore: number;
    confidence: number;
  }>(null);

  const handleScreen = () => {
    if (!searchAddr) return;
    const isFlagged = Math.random() > 0.8;
    setResult({
      address: searchAddr,
      sanctioned: isFlagged,
      riskScore: isFlagged
        ? 78 + Math.floor(Math.random() * 15)
        : Math.floor(Math.random() * 20),
      confidence: +(0.85 + Math.random() * 0.14).toFixed(2),
    });
  };

  const approved = complianceHistory.filter(
    (c) => c.status === "approved",
  ).length;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const total = complianceHistory.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Compliance Screening
          </h1>
          <p className="text-sm text-muted-foreground">
            AML/CFT address screening powered by Chainalysis
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Screened", value: "247", icon: ShieldCheck },
            { label: "Flagged", value: "3", icon: ShieldAlert },
            { label: "Approval Rate", value: "98.8%", icon: CheckCircle },
          ].map((s, i) => (
            <div
              key={i}
              className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <s.icon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {s.label}
                </span>
              </div>
              <span className="text-2xl font-bold text-foreground">
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Search */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Screen Address
          </h3>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchAddr}
                onChange={(e) => setSearchAddr(e.target.value)}
                placeholder="Enter ETH address (0x...)"
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
            <Button
              onClick={handleScreen}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground border-0"
            >
              Screen
            </Button>
          </div>

          {result && (
            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 animate-fade-in">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p className="font-mono text-sm text-foreground truncate">
                    {result.address}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <StatusBadge
                    status={result.sanctioned ? "flagged" : "approved"}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Risk Score</p>
                  <p className="text-lg font-bold text-foreground">
                    {result.riskScore}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className="text-lg font-bold text-foreground">
                    {(result.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History Table */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "400ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Screening History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3">Address</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Risk Score</th>
                  <th className="pb-3">Date</th>
                  <th className="pb-3">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {complianceHistory.map((c, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="py-3 font-mono text-foreground">
                      {c.address}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 font-semibold text-foreground">
                      {c.riskScore}
                    </td>
                    <td className="py-3 text-muted-foreground">{c.date}</td>
                    <td className="py-3">
                      <a
                        href="#"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {c.ipfsHash} <ExternalLink className="h-3 w-3" />
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
