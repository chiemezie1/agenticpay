import crypto from 'crypto';

export interface FailedWebhook {
  id: string;
  provider: string;
  signature: string;
  timestamp: string;
  payload: string;
  failureReason: string;
  failedAt: string;
  retryCount: number;
  lastRetryAt?: string;
  status: 'pending' | 'retrying' | 'failed' | 'resolved';
}

// In-memory store (replace with database in production)
const failedWebhooks = new Map<string, FailedWebhook>();

/**
 * Queue a failed webhook for manual review and retry
 */
export function queueFailedWebhook(params: {
  provider: string;
  signature: string;
  timestamp: string;
  payload: string;
  failureReason: string;
}): FailedWebhook {
  const webhook: FailedWebhook = {
    id: crypto.randomUUID(),
    provider: params.provider,
    signature: params.signature,
    timestamp: params.timestamp,
    payload: params.payload,
    failureReason: params.failureReason,
    failedAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  failedWebhooks.set(webhook.id, webhook);
  console.warn(`[Webhook Queue] Failed webhook queued: ${webhook.id} - ${params.failureReason}`);
  
  return webhook;
}

/**
 * Get a failed webhook by ID
 */
export function getFailedWebhook(id: string): FailedWebhook | undefined {
  return failedWebhooks.get(id);
}

/**
 * List all failed webhooks, optionally filtered by status
 */
export function listFailedWebhooks(status?: FailedWebhook['status']): FailedWebhook[] {
  const webhooks = Array.from(failedWebhooks.values());
  if (status) {
    return webhooks.filter((w) => w.status === status);
  }
  return webhooks;
}

/**
 * Update webhook status
 */
export function updateWebhookStatus(
  id: string,
  status: FailedWebhook['status'],
  incrementRetry = false
): FailedWebhook | undefined {
  const webhook = failedWebhooks.get(id);
  if (!webhook) {
    return undefined;
  }

  webhook.status = status;
  if (incrementRetry) {
    webhook.retryCount += 1;
    webhook.lastRetryAt = new Date().toISOString();
  }

  failedWebhooks.set(id, webhook);
  return webhook;
}

/**
 * Delete a failed webhook from the queue
 */
export function deleteFailedWebhook(id: string): boolean {
  return failedWebhooks.delete(id);
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  const webhooks = Array.from(failedWebhooks.values());
  return {
    total: webhooks.length,
    pending: webhooks.filter((w) => w.status === 'pending').length,
    retrying: webhooks.filter((w) => w.status === 'retrying').length,
    failed: webhooks.filter((w) => w.status === 'failed').length,
    resolved: webhooks.filter((w) => w.status === 'resolved').length,
  };
}
