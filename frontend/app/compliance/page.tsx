"use client";

import { useState } from "react";
import {
  Search,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  Loader2,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import StatusBadge from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { complianceHistory } from "@/lib/mock-data";
import { useComplianceStatus, formatTimeAgo } from "@/hooks/useContractData";
import { type Address, isAddress } from "viem";

export default function Compliance() {
  const [searchAddr, setSearchAddr] = useState("");
  const [queryAddr, setQueryAddr] = useState<Address | undefined>(undefined);
  const [addrError, setAddrError] = useState("");

  const {
    hasKYC,
    sanctioned,
    lastUpdated,
    isLoading: complianceLoading,
    isError,
  } = useComplianceStatus(queryAddr);

  const handleScreen = () => {
    if (!searchAddr) return;
    if (!isAddress(searchAddr)) {
      setAddrError("Invalid Ethereum address");
      setQueryAddr(undefined);
      return;
    }
    setAddrError("");
    setQueryAddr(searchAddr as Address);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleScreen();
  };

  const isLive = queryAddr !== undefined && hasKYC !== undefined;

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
            {isLive && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success border border-success/20 normal-case">
                ● Live on-chain query
              </span>
            )}
          </h3>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchAddr}
                onChange={(e) => {
                  setSearchAddr(e.target.value);
                  setAddrError("");
                }}
                onKeyDown={handleKeyDown}
                placeholder="Enter ETH address (0x...)"
                className="pl-10 bg-muted/50 border-border"
              />
            </div>
            <Button
              onClick={handleScreen}
              disabled={complianceLoading}
              className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground border-0"
            >
              {complianceLoading && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Screen
            </Button>
          </div>

          {addrError && (
            <p className="mt-2 text-sm text-destructive">{addrError}</p>
          )}

          {queryAddr &&
            !complianceLoading &&
            !isError &&
            hasKYC !== undefined && (
              <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 animate-fade-in">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="font-mono text-sm text-foreground truncate">
                      {queryAddr}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">KYC Status</p>
                    <StatusBadge status={hasKYC ? "approved" : "pending"} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Sanctions Status
                    </p>
                    <StatusBadge status={sanctioned ? "flagged" : "approved"} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Last Updated
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {lastUpdated && lastUpdated > 0
                        ? formatTimeAgo(lastUpdated)
                        : "Never checked"}
                    </p>
                  </div>
                </div>

                {/* Overall status summary */}
                <div className="mt-3 pt-3 border-t border-border/50">
                  {hasKYC && !sanctioned ? (
                    <div className="flex items-center gap-2 text-success">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        ✅ Address is compliant — KYC passed, not sanctioned
                      </span>
                    </div>
                  ) : sanctioned ? (
                    <div className="flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        🚫 Address is SANCTIONED — all vault operations blocked
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-warning">
                      <ShieldAlert className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        ⚠️ Address has not completed KYC
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {isError && queryAddr && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                Failed to read from ComplianceRegistry. Make sure your wallet is
                connected to Sepolia.
              </p>
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
