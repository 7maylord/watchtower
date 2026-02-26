// Firestore REST API client for reading CRE workflow reports
// Reads from the same Firestore collections the CRE workflows write to

const FIREBASE_API_KEY = "AIzaSyAByz16WVkCora7xwobOJMqVepNCfs8iO8";
const FIREBASE_PROJECT_ID = "watchtower-bdfa8";

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// ============================================================
// Types
// ============================================================
interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
}

interface FirestoreDocument {
  name: string;
  fields: Record<string, FirestoreValue>;
  createTime: string;
  updateTime: string;
}

interface FirestoreListResponse {
  documents?: FirestoreDocument[];
}

// ============================================================
// Extract typed value from Firestore field
// ============================================================
function extractValue(
  field: FirestoreValue | undefined,
): string | number | boolean | null {
  if (!field) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.integerValue !== undefined) return Number(field.integerValue);
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  return null;
}

// ============================================================
// Get anonymous auth token
// ============================================================
async function getAnonymousToken(): Promise<string> {
  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  );

  if (!resp.ok) {
    throw new Error(`Firebase auth failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data.idToken;
}

// ============================================================
// Read all documents from a collection
// ============================================================
async function readCollection(
  collection: string,
): Promise<FirestoreDocument[]> {
  const token = await getAnonymousToken();

  const resp = await fetch(
    `${FIRESTORE_BASE}/${collection}?orderBy=timestamp desc&pageSize=50`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!resp.ok) {
    console.error(`Firestore read failed for ${collection}: ${resp.status}`);
    return [];
  }

  const data: FirestoreListResponse = await resp.json();
  return data.documents ?? [];
}

// ============================================================
// Public API: Fetch compliance reports
// ============================================================
export interface ComplianceReport {
  address: string;
  status: "approved" | "flagged";
  riskScore: number;
  date: string;
  screeningDetails: string;
  documentId: string;
}

export async function fetchComplianceReports(): Promise<ComplianceReport[]> {
  const docs = await readCollection("compliance-reports");

  return docs.map((doc) => {
    const address = (extractValue(doc.fields.address) as string) || "Unknown";
    const status = (extractValue(doc.fields.status) as string) || "UNKNOWN";
    const riskScore = (extractValue(doc.fields.riskScore) as number) || 0;
    const timestamp = (extractValue(doc.fields.timestamp) as number) || 0;
    const screeningDetails =
      (extractValue(doc.fields.screeningDetails) as string) || "";
    const docId = doc.name.split("/").pop() || "";

    const d = new Date(timestamp);
    const shortAddr =
      address.length > 10
        ? `${address.slice(0, 6)}...${address.slice(-4)}`
        : address;

    return {
      address: shortAddr,
      status: status === "APPROVED" ? "approved" : "flagged",
      riskScore,
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      screeningDetails,
      documentId: docId,
    };
  });
}

// ============================================================
// Public API: Fetch rebalancing reports
// ============================================================
export interface RebalancingReport {
  date: string;
  action: string;
  confidence: number;
  status: "executed" | "skipped";
  analysis: string;
  documentId: string;
}

export async function fetchRebalancingReports(): Promise<RebalancingReport[]> {
  const docs = await readCollection("rebalancing-reports");

  return docs.map((doc) => {
    const timestamp = (extractValue(doc.fields.timestamp) as number) || 0;
    const riskScore = (extractValue(doc.fields.riskScore) as number) || 0;
    const totalAssets = (extractValue(doc.fields.totalAssets) as string) || "";
    const recommendations =
      (extractValue(doc.fields.recommendations) as string) || "";
    const analysis = (extractValue(doc.fields.analysis) as string) || "";
    const docId = doc.name.split("/").pop() || "";

    const d = new Date(timestamp);

    return {
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      action: recommendations
        ? recommendations.split(" | ")[0]
        : `Risk ${riskScore}, Assets: ${totalAssets}`,
      confidence: riskScore > 0 ? Math.max(0.5, 1 - riskScore / 100) : 1.0,
      status: "executed" as const,
      analysis,
      documentId: docId,
    };
  });
}

// ============================================================
// Public API: Fetch reserve reports
// ============================================================
export interface ReserveReport {
  date: string;
  totalReserves: string;
  actualBalance: string;
  reserveRatio: string;
  attestation: string;
  documentId: string;
}

export async function fetchReserveReports(): Promise<ReserveReport[]> {
  const docs = await readCollection("reserve-reports");

  return docs.map((doc) => {
    const timestamp = (extractValue(doc.fields.timestamp) as number) || 0;
    const totalReserves =
      (extractValue(doc.fields.totalReserves) as string) || "";
    const actualBalance =
      (extractValue(doc.fields.actualBalance) as string) || "";
    const reserveRatio =
      (extractValue(doc.fields.reserveRatio) as string) || "";
    const attestation = (extractValue(doc.fields.attestation) as string) || "";
    const docId = doc.name.split("/").pop() || "";

    const d = new Date(timestamp);

    return {
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      totalReserves,
      actualBalance,
      reserveRatio,
      attestation,
      documentId: docId,
    };
  });
}

// ============================================================
// Public API: Fetch risk reports (portfolio health)
// ============================================================
export interface RiskReport {
  date: string;
  score: number;
  status: "healthy" | "moderate" | "critical";
  analysis: string;
  documentId: string;
}

export async function fetchRiskReports(): Promise<RiskReport[]> {
  const docs = await readCollection("risk-reports");

  return docs.map((doc) => {
    const timestamp = (extractValue(doc.fields.timestamp) as number) || 0;
    const riskScore = (extractValue(doc.fields.riskScore) as number) || 0;
    const analysis = (extractValue(doc.fields.analysis) as string) || "";
    const docId = doc.name.split("/").pop() || "";

    const d = new Date(timestamp);

    return {
      date: d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      score: riskScore,
      status:
        riskScore < 40 ? "healthy" : riskScore < 70 ? "moderate" : "critical",
      analysis,
      documentId: docId,
    };
  });
}
