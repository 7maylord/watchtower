"use client";

import {
  Shield,
  ArrowRight,
  HeartPulse,
  ShieldCheck,
  Landmark,
  ArrowLeftRight,
  Zap,
  Lock,
  Eye,
  Github,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  useTotalAssets,
  useReserveData,
  useComplianceHistory,
} from "@/hooks/useContractData";

const features = [
  {
    icon: HeartPulse,
    title: "Portfolio Health Monitoring",
    description:
      "AI-powered risk analysis using Gemini to continuously assess your DeFi portfolio health and generate actionable recommendations.",
    color: "from-blue-500 to-cyan-400",
    delay: 100,
  },
  {
    icon: ShieldCheck,
    title: "Compliance Screening",
    description:
      "Automated KYC/AML screening with Chainalysis integration. On-chain compliance registry updates in real-time.",
    color: "from-emerald-500 to-green-400",
    delay: 200,
  },
  {
    icon: Landmark,
    title: "Proof of Reserve",
    description:
      "Cryptographic verification of on-chain reserves against reported balances. Transparent and verifiable attestations.",
    color: "from-violet-500 to-purple-400",
    delay: 300,
  },
  {
    icon: ArrowLeftRight,
    title: "Rebalancing Advisor",
    description:
      "AI-driven portfolio rebalancing recommendations. Automated analysis of market conditions and position sizing.",
    color: "from-amber-500 to-orange-400",
    delay: 400,
  },
];

export default function LandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const { totalAssets } = useTotalAssets();
  const { reserveRatio } = useReserveData();
  const { history: complianceHistory } = useComplianceHistory();

  const displayAssets = totalAssets
    ? totalAssets >= 1e6
      ? `$${(totalAssets / 1e6).toFixed(1)}M`
      : totalAssets >= 1e3
        ? `$${(totalAssets / 1e3).toFixed(1)}K`
        : `$${totalAssets.toFixed(2)}`
    : "$0";

  const stats = [
    { value: displayAssets, label: "Assets Monitored" },
    { value: reserveRatio ? `${reserveRatio.toFixed(1)}%` : "—", label: "Reserve Ratio" },
    { value: String(complianceHistory.length), label: "Addresses Screened" },
    { value: "<15min", label: "Update Interval" },
  ];

  useEffect(() => {
    if (isConnected) {
      router.push("/dashboard");
    }
  }, [isConnected, router]);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/5 blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-primary/3 blur-[160px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12 border-b border-glass-border/20 backdrop-blur-xl bg-background/50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">
            Watchtower
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a
            href="#features"
            className="hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hover:text-foreground transition-colors"
          >
            How It Works
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
        <ConnectButton showBalance={false} />
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 pt-20 pb-24 lg:pt-32 lg:pb-36 text-center">
        <div
          className="opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0ms" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-8">
            <Zap className="h-3.5 w-3.5" />
            Powered by Chainlink CRE
          </div>
        </div>

        <h1
          className="max-w-4xl text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-7xl opacity-0 animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          Institutional-Grade{" "}
          <span className="bg-gradient-to-r from-primary via-blue-400 to-accent bg-clip-text text-transparent">
            DeFi Risk
          </span>{" "}
          Management
        </h1>

        <p
          className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed opacity-0 animate-fade-in-up"
          style={{ animationDelay: "200ms" }}
        >
          Monitor portfolio health, automate compliance screening, verify
          reserves, and get AI-powered rebalancing advice — all secured by
          Chainlink&apos;s decentralized oracle network.
        </p>

        <div
          className="mt-10 flex flex-col sm:flex-row items-center gap-4 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "300ms" }}
        >
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                onClick={openConnectModal}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-8 py-4 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.03] active:scale-[0.98]"
              >
                <span className="relative flex items-center gap-2">
                  Launch Console
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            )}
          </ConnectButton.Custom>
          <a
            href="#features"
            className="flex items-center gap-2 rounded-xl border border-glass-border/50 bg-card/40 px-8 py-4 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-card/70 hover:text-foreground hover:border-glass-border"
          >
            Learn More
          </a>
        </div>

        {/* Stats bar */}
        <div
          className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 lg:gap-12 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "500ms" }}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl lg:text-3xl font-bold text-foreground">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 px-6 py-24 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Four Automated{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Workflows
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
              Each workflow runs autonomously on the Chainlink Runtime
              Environment, providing institutional-grade monitoring 24/7.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group glass-card-hover rounded-2xl p-8 opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${feature.delay}ms` }}
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg`}
                >
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 px-6 py-24 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-muted-foreground">
              Decentralized, automated, and trustless risk management in three
              steps.
            </p>
          </div>

          <div className="space-y-8">
            {[
              {
                step: "01",
                icon: Lock,
                title: "Connect Your Wallet",
                description:
                  "Connect via MetaMask or WalletConnect. Your wallet address is used to identify your fund vault on-chain.",
              },
              {
                step: "02",
                icon: Eye,
                title: "Monitor in Real-Time",
                description:
                  "Four CRE workflows continuously monitor your portfolio health, compliance status, reserves, and market conditions.",
              },
              {
                step: "03",
                icon: Zap,
                title: "Automated Actions",
                description:
                  "When thresholds are breached, workflows automatically update on-chain oracles, trigger alerts, and store reports to Firebase.",
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className="glass-card rounded-2xl p-6 flex items-start gap-6 opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-bold text-lg">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                    <item.icon className="h-5 w-5 text-primary" />
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 py-24 lg:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="glass-card rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5" />
            <div className="relative">
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Ready to Secure Your DeFi Portfolio?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                Get started in seconds. Connect your wallet and start monitoring
                your fund with institutional-grade tools.
              </p>
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button
                    onClick={openConnectModal}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-10 py-4 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/35 hover:scale-[1.03] active:scale-[0.98]"
                  >
                    <span className="relative flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Connect & Launch
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-glass-border/20 px-6 py-8 lg:px-12">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>Watchtower DeFi Console</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span>Built with Chainlink CRE</span>
            <span>•</span>
            <span>Sepolia Testnet</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
