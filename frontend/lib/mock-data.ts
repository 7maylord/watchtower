// Generate 30 days of historical data
const generateDays = (n: number) => {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  }
  return days;
};

const days30 = generateDays(30);

export const riskScoreHistory = days30.map((day, i) => ({
  date: day,
  score: Math.round(25 + Math.sin(i / 4) * 15 + Math.random() * 10),
}));

export const reserveRatioHistory = days30.map((day, i) => ({
  date: day,
  ratio: +(99.5 + Math.sin(i / 5) * 0.5 + Math.random() * 0.3).toFixed(2),
}));

export const recentActivity = [
  { id: 1, workflow: "Portfolio Health Analysis", status: "success" as const, time: "2 min ago", details: "Risk score: 32/100" },
  { id: 2, workflow: "Compliance Screening", status: "success" as const, time: "15 min ago", details: "0xab3...f1c2 - Approved" },
  { id: 3, workflow: "Proof of Reserve", status: "warning" as const, time: "1 hr ago", details: "Reserve ratio: 99.8%" },
  { id: 4, workflow: "Rebalancing Check", status: "success" as const, time: "2 hrs ago", details: "HOLD recommendation" },
  { id: 5, workflow: "Compliance Screening", status: "error" as const, time: "3 hrs ago", details: "0x7f2...9a3b - FLAGGED" },
  { id: 6, workflow: "Portfolio Health Analysis", status: "success" as const, time: "6 hrs ago", details: "Risk score: 28/100" },
  { id: 7, workflow: "Proof of Reserve", status: "success" as const, time: "12 hrs ago", details: "Reserve ratio: 100.1%" },
  { id: 8, workflow: "Compliance Screening", status: "success" as const, time: "1 day ago", details: "0xc4d...8e7f - Approved" },
];

export const complianceHistory = [
  { address: "0xab3d...f1c2", status: "approved" as const, riskScore: 12, date: "Feb 15, 2026", ipfsHash: "QmXoypiz..." },
  { address: "0x7f2e...9a3b", status: "flagged" as const, riskScore: 87, date: "Feb 15, 2026", ipfsHash: "QmYzAbc1..." },
  { address: "0xc4d1...8e7f", status: "approved" as const, riskScore: 5, date: "Feb 14, 2026", ipfsHash: "QmPqrDef..." },
  { address: "0x91a5...2b6c", status: "approved" as const, riskScore: 18, date: "Feb 14, 2026", ipfsHash: "QmLmNop3..." },
  { address: "0xd8f3...4c9e", status: "approved" as const, riskScore: 8, date: "Feb 13, 2026", ipfsHash: "QmStUvw4..." },
  { address: "0xe2b7...1d5a", status: "flagged" as const, riskScore: 92, date: "Feb 12, 2026", ipfsHash: "QmAbcXyz..." },
];

export const riskBreakdown = [
  { factor: "Market Risk", value: 35, color: "hsl(217, 91%, 60%)" },
  { factor: "Liquidity Risk", value: 22, color: "hsl(260, 60%, 55%)" },
  { factor: "Concentration Risk", value: 45, color: "hsl(38, 92%, 50%)" },
  { factor: "Counterparty Risk", value: 18, color: "hsl(142, 71%, 45%)" },
  { factor: "Smart Contract Risk", value: 28, color: "hsl(0, 84%, 60%)" },
];

export const portfolioAllocation = [
  { name: "Stablecoins", value: 60, color: "hsl(217, 91%, 60%)" },
  { name: "Lending", value: 30, color: "hsl(260, 60%, 55%)" },
  { name: "Liquidity", value: 10, color: "hsl(142, 71%, 45%)" },
];

export const rebalancingHistory = [
  { date: "Feb 10, 2026", action: "Increased Stablecoins 5%", confidence: 0.89, status: "executed" as const },
  { date: "Feb 3, 2026", action: "Reduced Liquidity 3%", confidence: 0.76, status: "executed" as const },
  { date: "Jan 28, 2026", action: "HOLD", confidence: 0.92, status: "skipped" as const },
  { date: "Jan 21, 2026", action: "Increased Lending 7%", confidence: 0.84, status: "executed" as const },
];

export const healthAssessments = [
  { date: "Feb 15, 2026", score: 32, status: "healthy" as const, ipfsHash: "QmRisk001..." },
  { date: "Feb 14, 2026", score: 28, status: "healthy" as const, ipfsHash: "QmRisk002..." },
  { date: "Feb 13, 2026", score: 41, status: "moderate" as const, ipfsHash: "QmRisk003..." },
  { date: "Feb 12, 2026", score: 35, status: "healthy" as const, ipfsHash: "QmRisk004..." },
  { date: "Feb 11, 2026", score: 52, status: "moderate" as const, ipfsHash: "QmRisk005..." },
];
