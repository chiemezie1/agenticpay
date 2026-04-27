import { verifyWebhookSignature } from './hmac.js';
import { getAllProviderSecrets } from './secrets.js';
import { getFailedWebhook, updateWebhookStatus, FailedWebhook } from './queue.js';
import { logWebhookVerification } from './logger.js';

export interface RetryResult {
  success: boolean;
  webhookId: string;
  reason?: string;
  retriedAt: string;
}

/**
 * Manually retry a failed webhook verification
 */
export async function retryFailedWebhook(webhookId: string): Promise<RetryResult> {
  const webhook = getFailedWebhook(webhookId);
  
  if (!webhook) {
    return {
      success: false,
      webhookId,
      reason: 'Webhook not found',
      retriedAt: new Date().toISOString(),
    };
  }

  if (webhook.status === 'resolved') {
    return {
      success: false,
      webhookId,
      reason: 'Webhook already resolved',
      retriedAt: new Date().toISOString(),
    };
  }

  // Update status to retrying
  updateWebhookStatus(webhookId, 'retrying', true);

  const secrets = await getAllProviderSecrets(webhook.provider);
  if (secrets.length === 0) {
    updateWebhookStatus(webhookId, 'failed');
    return {
      success: false,
      webhookId,
      reason: 'Unknown provider or no secrets configured',
      retriedAt: new Date().toISOString(),
    };
  }

  // Try verification with all available secrets
  let verificationResult = null;
  for (const secret of secrets) {
    const result = verifyWebhookSignature({
      secret,
      signature: webhook.signature,
      payload: webhook.payload,
      timestamp: webhook.timestamp,
    });

    if (result.valid) {
      verificationResult = result;
      break;
    }
  }

  const retriedAt = new Date().toISOString();

  if (verificationResult && verificationResult.valid) {
    // Verification succeeded
    updateWebhookStatus(webhookId, 'resolved');
    
    logWebhookVerification({
      timestamp: retriedAt,
      provider: webhook.provider,
      signature: webhook.signature,
      requestTimestamp: webhook.timestamp,
      result: 'success',
      reason: 'Manual retry successful',
    });

    return {
      success: true,
      webhookId,
      retriedAt,
    };
  } else {
    // Verification still failing
    const failureReason = verificationResult?.reason || 'Invalid signature';
    updateWebhookStatus(webhookId, 'failed');
    
    logWebhookVerification({
      timestamp: retriedAt,
      provider: webhook.provider,
      signature: webhook.signature,
      requestTimestamp: webhook.timestamp,
      result: 'failure',
      reason: `Manual retry failed: ${failureReason}`,
    });

    return {
      success: false,
      webhookId,
      reason: failureReason,
      retriedAt,
    };
  }
}

/**
 * Batch retry multiple failed webhooks
 */
export async function batchRetryWebhooks(webhookIds: string[]): Promise<RetryResult[]> {
  const results: RetryResult[] = [];

  for (const id of webhookIds) {
    const result = await retryFailedWebhook(id);
    results.push(result);
  }

  return results;
}

/**
 * Auto-retry webhooks that failed due to clock skew or temporary issues
 */
export async function autoRetryEligibleWebhooks(): Promise<RetryResult[]> {
  const { listFailedWebhooks } = await import('./queue.js');
  const failedWebhooks = listFailedWebhooks('pending');
  
  // Only retry webhooks that failed recently (within last hour) and haven't been retried too many times
  const eligible = failedWebhooks.filter((w) => {
    const failedAt = new Date(w.failedAt).getTime();
    const hourAgo = Date.now() - 60 * 60 * 1000;
    return failedAt > hourAgo && w.retryCount < 3;
  });

  const results: RetryResult[] = [];
  for (const webhook of eligible) {
    const result = await retryFailedWebhook(webhook.id);
    results.push(result);
  }

  return results;
}
