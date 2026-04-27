export interface WebhookVerificationLog {
  timestamp: string;
  provider: string;
  signature: string;
  requestTimestamp: string;
  result: 'success' | 'failure';
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

// In-memory log store (replace with persistent logging in production)
const verificationLogs: WebhookVerificationLog[] = [];
const MAX_LOGS = 10000; // Prevent memory overflow

/**
 * Log a webhook verification attempt
 */
export function logWebhookVerification(log: WebhookVerificationLog): void {
  verificationLogs.push(log);

  // Trim old logs if exceeding max
  if (verificationLogs.length > MAX_LOGS) {
    verificationLogs.splice(0, verificationLogs.length - MAX_LOGS);
  }

  const logLevel = log.result === 'success' ? 'info' : 'warn';
  console[logLevel](
    `[Webhook Verification] ${log.result.toUpperCase()} - Provider: ${log.provider}, Reason: ${log.reason || 'N/A'}`
  );
}

/**
 * Get verification logs, optionally filtered
 */
export function getVerificationLogs(params?: {
  provider?: string;
  result?: 'success' | 'failure';
  limit?: number;
}): WebhookVerificationLog[] {
  let logs = [...verificationLogs];

  if (params?.provider) {
    logs = logs.filter((log) => log.provider === params.provider);
  }

  if (params?.result) {
    logs = logs.filter((log) => log.result === params.result);
  }

  if (params?.limit) {
    logs = logs.slice(-params.limit);
  }

  return logs.reverse(); // Most recent first
}

/**
 * Get verification statistics
 */
export function getVerificationStats(provider?: string) {
  const logs = provider
    ? verificationLogs.filter((log) => log.provider === provider)
    : verificationLogs;

  const total = logs.length;
  const successful = logs.filter((log) => log.result === 'success').length;
  const failed = logs.filter((log) => log.result === 'failure').length;

  return {
    total,
    successful,
    failed,
    successRate: total > 0 ? (successful / total) * 100 : 0,
  };
}

/**
 * Clear old logs (for maintenance)
 */
export function clearOldLogs(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs;
  const initialLength = verificationLogs.length;

  const filtered = verificationLogs.filter((log) => {
    const logTime = new Date(log.timestamp).getTime();
    return logTime >= cutoff;
  });

  verificationLogs.length = 0;
  verificationLogs.push(...filtered);

  return initialLength - verificationLogs.length;
}
