"use client";

import { Save, Wifi, WifiOff } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const integrations = [
  { name: "Gemini AI", status: true, desc: "Risk analysis & recommendations" },
  { name: "Chainalysis", status: true, desc: "AML/CFT compliance screening" },
  { name: "Pinata IPFS", status: false, desc: "Decentralized report storage" },
];

const workflows = [
  { name: "Portfolio Health", interval: "5 min" },
  { name: "Compliance Screening", interval: "On-demand" },
  { name: "Proof of Reserve", interval: "15 min" },
  { name: "Rebalancing Check", interval: "1 hr" },
];

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure workflows, integrations, and notifications
          </p>
        </div>

        {/* Workflow Config */}
        <div className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Workflow Schedules
          </h3>
          <div className="space-y-4">
            {workflows.map((w) => (
              <div key={w.name} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{w.name}</span>
                <Input
                  defaultValue={w.interval}
                  className="w-32 bg-muted/50 border-border text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Contract Addresses */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Contract Addresses
          </h3>
          <div className="space-y-4">
            {[
              ["Fund Vault", "0x7a3B...9f2E"],
              ["Risk Oracle", "0x4c1D...3a8F"],
              ["Compliance Registry", "0x9e5A...7b4C"],
            ].map(([label, addr]) => (
              <div key={label}>
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  defaultValue={addr}
                  className="mt-1 font-mono bg-muted/50 border-border text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Integrations */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            API Integrations
          </h3>
          <div className="space-y-4">
            {integrations.map((intg) => (
              <div
                key={intg.name}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4"
              >
                <div className="flex items-center gap-3">
                  {intg.status ? (
                    <Wifi className="h-4 w-4 text-success" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {intg.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{intg.desc}</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    intg.status ? "text-success" : "text-destructive"
                  }`}
                >
                  {intg.status ? "Connected" : "Disconnected"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div
          className="glass-card rounded-xl p-5 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Notification Preferences
          </h3>
          <div className="space-y-4">
            {[
              "Email alerts for flagged addresses",
              "Reserve ratio below 100% alerts",
              "Rebalancing recommendations",
              "Weekly portfolio summary",
            ].map((pref) => (
              <div key={pref} className="flex items-center justify-between">
                <span className="text-sm text-foreground">{pref}</span>
                <Switch defaultChecked />
              </div>
            ))}
          </div>
        </div>

        <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-primary-foreground border-0">
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </DashboardLayout>
  );
}
