import {
  cre,
  ok,
  type Runtime,
  type HTTPSendRequester,
  consensusIdenticalAggregation,
} from "@chainlink/cre-sdk";

/**
 * CRE-compatible HTTP client utilities
 * Uses CRE SDK's HTTPClient capability for external API calls
 * Follows the exact pattern from the Chainlink CRE templates
 */

/**
 * Structured logging utility
 */
export class StructuredLogger {
  constructor(private runtime: Runtime<any>) {}

  info(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`ℹ️  ${log}`);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    const errorMsg = error ? `${message}: ${error.message}` : message;
    const log = context ? `${errorMsg} | ${JSON.stringify(context)}` : errorMsg;
    this.runtime.log(`❌ ${log}`);
  }

  warn(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`⚠️  ${log}`);
  }

  success(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`✅ ${log}`);
  }
}

/**
 * Safe JSON stringify for objects with bigints
 */
export function safeJsonStringify(obj: any): string {
  return JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

/**
 * Error handling wrapper with context
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: { operation: string; runtime: Runtime<any> },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const logger = new StructuredLogger(context.runtime);
    logger.error(`Failed: ${context.operation}`, error as Error);
    throw error;
  }
}

/**
 * Build a POST request handler for CRE HTTPClient
 * Returns a curried function compatible with httpClient.sendRequest()
 */
export const buildPostRequest =
  <TResponse>(url: string, body: any, headers: Record<string, string>) =>
  (sendRequester: HTTPSendRequester, _config: any): TResponse => {
    const bodyBytes = new TextEncoder().encode(JSON.stringify(body));
    const encodedBody = Buffer.from(bodyBytes).toString("base64");

    const req = {
      url,
      method: "POST" as const,
      body: encodedBody,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) {
      throw new Error(`HTTP ${resp.statusCode}: ${bodyText}`);
    }

    return JSON.parse(bodyText) as TResponse;
  };

/**
 * Build a GET request handler for CRE HTTPClient
 * Returns a curried function compatible with httpClient.sendRequest()
 */
export const buildGetRequest =
  <TResponse>(url: string, headers: Record<string, string>) =>
  (sendRequester: HTTPSendRequester, _config: any): TResponse => {
    const req = {
      url,
      method: "GET" as const,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const resp = sendRequester.sendRequest(req).result();
    const bodyText = new TextDecoder().decode(resp.body);

    if (!ok(resp)) {
      throw new Error(`HTTP ${resp.statusCode}: ${bodyText}`);
    }

    return JSON.parse(bodyText) as TResponse;
  };

/**
 * Make HTTP POST request using CRE HTTPClient
 * Follows the exact pattern from Chainlink CRE templates
 */
export function makeHttpPost<TResponse>(
  runtime: Runtime<any>,
  url: string,
  body: any,
  headers: Record<string, string>,
): TResponse {
  const httpClient = new cre.capabilities.HTTPClient();

  const result: TResponse = httpClient
    .sendRequest(
      runtime,
      buildPostRequest<TResponse>(url, body, headers),
      consensusIdenticalAggregation<TResponse>(),
    )(runtime.config)
    .result();

  return result;
}

/**
 * Make HTTP GET request using CRE HTTPClient
 * Follows the exact pattern from Chainlink CRE templates
 */
export function makeHttpGet<TResponse>(
  runtime: Runtime<any>,
  url: string,
  headers: Record<string, string>,
): TResponse {
  const httpClient = new cre.capabilities.HTTPClient();

  const result: TResponse = httpClient
    .sendRequest(runtime, buildGetRequest<TResponse>(
        url,
        headers,
      ), consensusIdenticalAggregation<TResponse>())(runtime.config)
    .result();

  return result;
}
