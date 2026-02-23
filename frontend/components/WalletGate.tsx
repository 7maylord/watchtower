"use client";

import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Shield, Wallet, ArrowRight } from "lucide-react";

export default function WalletGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  if (isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="relative max-w-md w-full mx-4">
        {/* Background glow */}
        <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-2xl opacity-50" />

        <div className="relative glass-card rounded-2xl p-8 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25">
            <Shield className="h-8 w-8 text-white" />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
            Connect your wallet to access the Watchtower DeFi Console. Monitor
            your portfolio, manage compliance, and track reserves in real-time.
          </p>

          <button
            onClick={openConnectModal}
            className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="relative flex items-center justify-center gap-2">
              <Wallet className="h-4 w-4" />
              Connect Wallet
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          <p className="mt-4 text-xs text-muted-foreground">
            Supports MetaMask, WalletConnect, Coinbase Wallet & more
          </p>
        </div>
      </div>
    </div>
  );
}
