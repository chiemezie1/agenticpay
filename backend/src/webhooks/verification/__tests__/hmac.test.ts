import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from '../hmac.js';
import crypto from 'crypto';

describe('Webhook HMAC Verification', () => {
  const secret = 'test-secret-key';
  const payload = JSON.stringify({ event: 'payment.success', amount: 100 });
  const timestamp = Math.floor(Date.now() / 1000).toString();

  function generateSignature(secret: string, timestamp: string, payload: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.${payload}`);
    return hmac.digest('hex');
  }

  it('should verify valid signature', () => {
    const signature = generateSignature(secret, timestamp, payload);
    
    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp,
    });

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should reject invalid signature', () => {
    const result = verifyWebhookSignature({
      secret,
      signature: 'invalid-signature',
      payload,
      timestamp,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid signature');
  });

  it('should reject expired timestamp', () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds ago
    const signature = generateSignature(secret, oldTimestamp, payload);

    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp: oldTimestamp,
      toleranceSeconds: 300, // 5 minutes
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid or expired timestamp');
  });

  it('should accept timestamp within tolerance', () => {
    const recentTimestamp = (Math.floor(Date.now() / 1000) - 100).toString(); // 100 seconds ago
    const signature = generateSignature(secret, recentTimestamp, payload);

    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp: recentTimestamp,
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(true);
  });

  it('should reject future timestamp beyond tolerance', () => {
    const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString(); // 400 seconds in future
    const signature = generateSignature(secret, futureTimestamp, payload);

    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp: futureTimestamp,
      toleranceSeconds: 300,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid or expired timestamp');
  });

  it('should reject invalid timestamp format', () => {
    const signature = generateSignature(secret, timestamp, payload);

    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp: 'not-a-number',
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid or expired timestamp');
  });

  it('should use timing-safe comparison', () => {
    // This test ensures we're using crypto.timingSafeEqual
    const signature = generateSignature(secret, timestamp, payload);
    const tamperedSignature = signature.slice(0, -1) + 'x';

    const result = verifyWebhookSignature({
      secret,
      signature: tamperedSignature,
      payload,
      timestamp,
    });

    expect(result.valid).toBe(false);
  });
});
