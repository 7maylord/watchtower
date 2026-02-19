// firebase.ts
// Firebase/Firestore integration for storing workflow reports.
// Uses CRE HTTP capability to interact with Firebase REST APIs.
// Pattern adapted from lien-markets project.

import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";
import { StructuredLogger } from "./utils";

/*********************************
 * Firebase Types
 *********************************/

export interface SignupNewUserResponse {
  kind: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

export interface FirestoreWriteResponse {
  name: string;
  fields: Record<string, any>;
  createTime: string;
  updateTime: string;
}

export interface FirestoreWriteResult {
  documentId: string;
  documentPath: string;
  timestamp: number;
}

/*********************************
 * Firebase Client
 *********************************/

export class FirebaseClient {
  private logger: StructuredLogger;
  private apiKey: string;
  private projectId: string;

  constructor(runtime: Runtime<any>, apiKey: string, projectId: string) {
    this.logger = new StructuredLogger(runtime);
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  /**
   * Write a JSON document to Firestore
   */
  writeDocument(
    runtime: Runtime<any>,
    collection: string,
    data: Record<string, any>,
    documentId?: string,
  ): FirestoreWriteResult {
    this.logger.info("Firebase: Writing to Firestore", {
      collection,
      documentId: documentId || "auto",
    });

    const httpClient = new cre.capabilities.HTTPClient();

    // Step 1: Get anonymous auth token
    const tokenResult: SignupNewUserResponse = httpClient
      .sendRequest(runtime, this.buildAuthRequest(), consensusIdenticalAggregation<SignupNewUserResponse>())(runtime.config)
      .result();

    // Step 2: Write document to Firestore
    const fields = this.convertToFirestoreFields(data);
    const docIdParam = documentId ? `?documentId=${documentId}` : "";

    const writeResult: FirestoreWriteResponse = httpClient
      .sendRequest(
        runtime,
        this.buildWriteRequest(
          tokenResult.idToken,
          collection,
          fields,
          docIdParam,
        ),
        consensusIdenticalAggregation<FirestoreWriteResponse>(),
      )(runtime.config)
      .result();

    const result: FirestoreWriteResult = {
      documentId: documentId || writeResult.name?.split("/").pop() || "unknown",
      documentPath: writeResult.name || "",
      timestamp: Date.now(),
    };

    this.logger.success("Firebase: Document written", {
      documentId: result.documentId,
      collection,
    });

    return result;
  }

  /**
   * Upload a risk report to Firestore
   */
  uploadRiskReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      riskScore: number;
      totalAssets: string;
      analysis: string;
      recommendations: string[];
    },
  ): string {
    const docId = `risk-report-${Date.now()}`;
    const result = this.writeDocument(
      runtime,
      "risk-reports",
      {
        ...report,
        recommendations: report.recommendations.join(" | "),
        type: "risk_assessment",
      },
      docId,
    );
    return result.documentId;
  }

  /**
   * Upload a compliance report to Firestore
   */
  uploadComplianceReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      address: string;
      status: string;
      riskScore: number;
      screeningDetails: string;
    },
  ): string {
    const docId = `compliance-report-${Date.now()}`;
    const result = this.writeDocument(
      runtime,
      "compliance-reports",
      {
        ...report,
        type: "compliance_screening",
      },
      docId,
    );
    return result.documentId;
  }

  /**
   * Upload a reserve report to Firestore
   */
  uploadReserveReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      totalReserves: string;
      actualBalance: string;
      reserveRatio: string;
      attestation: string;
    },
  ): string {
    const docId = `reserve-report-${Date.now()}`;
    const result = this.writeDocument(
      runtime,
      "reserve-reports",
      {
        ...report,
        type: "proof_of_reserve",
      },
      docId,
    );
    return result.documentId;
  }

  /**
   * Upload a rebalancing report to Firestore
   */
  uploadRebalancingReport(
    runtime: Runtime<any>,
    report: {
      timestamp: number;
      riskScore: number;
      totalAssets: string;
      recommendations: string[];
      analysis: string;
    },
  ): string {
    const docId = `rebalancing-report-${Date.now()}`;
    const result = this.writeDocument(
      runtime,
      "rebalancing-reports",
      {
        ...report,
        recommendations: report.recommendations.join(" | "),
        type: "rebalancing_advisory",
      },
      docId,
    );
    return result.documentId;
  }

  /*********************************
   * Private Helpers
   *********************************/

  /**
   * Convert a flat JS object to Firestore typed fields format
   */
  private convertToFirestoreFields(
    data: Record<string, any>,
  ): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string") {
        fields[key] = { stringValue: value };
      } else if (typeof value === "number") {
        if (Number.isInteger(value)) {
          fields[key] = { integerValue: value };
        } else {
          fields[key] = { doubleValue: value };
        }
      } else if (typeof value === "boolean") {
        fields[key] = { booleanValue: value };
      } else {
        // Fallback: stringify complex types
        fields[key] = { stringValue: JSON.stringify(value) };
      }
    }
    return fields;
  }

  /**
   * Build anonymous auth request (Firebase Identity Toolkit)
   */
  private buildAuthRequest() {
    const apiKey = this.apiKey;
    return (
      sendRequester: HTTPSendRequester,
      _config: any,
    ): SignupNewUserResponse => {
      const dataToSend = { returnSecureToken: true };
      const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
      const body = Buffer.from(bodyBytes).toString("base64");

      const req = {
        url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
        method: "POST" as const,
        body,
        headers: { "Content-Type": "application/json" },
      };

      const resp = sendRequester.sendRequest(req).result();
      if (!ok(resp)) {
        const errText = new TextDecoder().decode(resp.body);
        throw new Error(
          `Firebase auth failed (${resp.statusCode}): ${errText}`,
        );
      }

      return JSON.parse(
        new TextDecoder().decode(resp.body),
      ) as SignupNewUserResponse;
    };
  }

  /**
   * Build Firestore document write request
   */
  private buildWriteRequest(
    idToken: string,
    collection: string,
    fields: Record<string, any>,
    docIdParam: string,
  ) {
    const projectId = this.projectId;
    return (
      sendRequester: HTTPSendRequester,
      _config: any,
    ): FirestoreWriteResponse => {
      const dataToSend = { fields };
      const bodyBytes = new TextEncoder().encode(JSON.stringify(dataToSend));
      const body = Buffer.from(bodyBytes).toString("base64");

      const req = {
        url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docIdParam}`,
        method: "POST" as const,
        body,
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      };

      const resp = sendRequester.sendRequest(req).result();
      if (!ok(resp)) {
        const errText = new TextDecoder().decode(resp.body);
        throw new Error(
          `Firestore write failed (${resp.statusCode}): ${errText}`,
        );
      }

      return JSON.parse(
        new TextDecoder().decode(resp.body),
      ) as FirestoreWriteResponse;
    };
  }
}
