"use client";

import { useState } from "react";
import LinkNext from "next/link"; // For navigation
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  HeartPulse,
  ShieldCheck,
  Landmark,
  ArrowLeftRight,
  Settings,
  Menu,
  Shield,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useDisconnect } from "wagmi";
import WalletGate from "@/components/WalletGate";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Portfolio Health", href: "/portfolio", icon: HeartPulse },
  { name: "Compliance", href: "/compliance", icon: ShieldCheck },
  { name: "Proof of Reserve", href: "/reserves", icon: Landmark },
  { name: "Rebalancing", href: "/rebalancing", icon: ArrowLeftRight },
  { name: "Settings", href: "/settings", icon: Settings },
];

const Sidebar = ({ className }: { className?: string }) => {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar border-r border-sidebar-border",
        className,
      )}
    >
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <Shield className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
          Watchtower
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <LinkNext
                key={item.name}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-inset ring-sidebar-ring/10"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive
                      ? "text-sidebar-primary"
                      : "text-muted-foreground group-hover:text-sidebar-foreground",
                  )}
                />
                {item.name}
              </LinkNext>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-sidebar-border">
        <WalletFooter />
      </div>
    </div>
  );
};

const WalletFooter = () => {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <div className="rounded-lg bg-sidebar-accent/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <span className="text-xs font-bold">⬡</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-sidebar-foreground truncate">
              {truncated}
            </span>
            <span className="text-[10px] text-muted-foreground">Connected</span>
          </div>
        </div>
        <button
          onClick={() => disconnect()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
          title="Disconnect"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <WalletGate>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden w-64 md:block">
          <Sidebar className="h-full" />
        </div>

        {/* Mobile Sidebar */}
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetContent side="left" className="w-64 p-0 border-sidebar-border">
            <Sidebar />
          </SheetContent>

          {/* Main Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <header className="flex h-16 items-center justify-between border-b bg-background/50 px-6 backdrop-blur-xl">
              <div className="flex items-center gap-4 md:hidden">
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="-ml-2">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <span className="text-lg font-bold">Watchtower</span>
              </div>

              <div className="ml-auto flex items-center gap-4">
                <div className="hidden items-center gap-2 rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground sm:flex">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                  </span>
                  System Operational
                </div>
                <div className="flex items-center">
                  <ConnectButton showBalance={false} />
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="mx-auto max-w-6xl animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </Sheet>
        <Toaster />
      </div>
    </WalletGate>
  );
}
