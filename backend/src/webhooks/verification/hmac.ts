import crypto from 'crypto';

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

export interface WebhookVerificationOptions {
  secret: string;
  signature: string;
  payload: string;
  timestamp: string;
  toleranceSeconds?: number;
}

/**
 * Verifies a webhook signature using HMAC-SHA256 and timestamp for replay protection.
 */
export function verifyWebhookSignature({
  secret,
  signature,
  payload,
  timestamp,
  toleranceSeconds = 300, // 5 minutes default
}: WebhookVerificationOptions): WebhookVerificationResult {
  // 1. Timestamp verification (replay protection)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > toleranceSeconds) {
    return { valid: false, reason: 'Invalid or expired timestamp' };
  }

  // 2. HMAC-SHA256 signature verification
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.${payload}`);
  const expected = hmac.digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false, reason: 'Invalid signature' };
  }

  return { valid: true };
}
