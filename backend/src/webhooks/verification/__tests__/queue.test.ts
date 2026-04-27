import { describe, it, expect, beforeEach } from 'vitest';
import {
  queueFailedWebhook,
  getFailedWebhook,
  listFailedWebhooks,
  updateWebhookStatus,
  deleteFailedWebhook,
  getQueueStats,
} from '../queue.js';

describe('Webhook Queue', () => {
  beforeEach(() => {
    // Clear queue before each test
    const webhooks = listFailedWebhooks();
    webhooks.forEach((w) => deleteFailedWebhook(w.id));
  });

  it('should queue a failed webhook', () => {
    const webhook = queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_123',
      timestamp: '1234567890',
      payload: '{"test": true}',
      failureReason: 'Invalid signature',
    });

    expect(webhook.id).toBeDefined();
    expect(webhook.provider).toBe('stripe');
    expect(webhook.status).toBe('pending');
    expect(webhook.retryCount).toBe(0);
  });

  it('should retrieve a failed webhook by ID', () => {
    const queued = queueFailedWebhook({
      provider: 'github',
      signature: 'sig_456',
      timestamp: '1234567890',
      payload: '{"event": "push"}',
      failureReason: 'Expired timestamp',
    });

    const retrieved = getFailedWebhook(queued.id);
    expect(retrieved).toEqual(queued);
  });

  it('should list all failed webhooks', () => {
    queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_1',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test 1',
    });

    queueFailedWebhook({
      provider: 'github',
      signature: 'sig_2',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test 2',
    });

    const webhooks = listFailedWebhooks();
    expect(webhooks).toHaveLength(2);
  });

  it('should filter webhooks by status', () => {
    const webhook1 = queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_1',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    queueFailedWebhook({
      provider: 'github',
      signature: 'sig_2',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    updateWebhookStatus(webhook1.id, 'resolved');

    const pending = listFailedWebhooks('pending');
    const resolved = listFailedWebhooks('resolved');

    expect(pending).toHaveLength(1);
    expect(resolved).toHaveLength(1);
  });

  it('should update webhook status', () => {
    const webhook = queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_123',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    const updated = updateWebhookStatus(webhook.id, 'retrying', true);

    expect(updated?.status).toBe('retrying');
    expect(updated?.retryCount).toBe(1);
    expect(updated?.lastRetryAt).toBeDefined();
  });

  it('should delete a webhook', () => {
    const webhook = queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_123',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    const deleted = deleteFailedWebhook(webhook.id);
    expect(deleted).toBe(true);

    const retrieved = getFailedWebhook(webhook.id);
    expect(retrieved).toBeUndefined();
  });

  it('should return queue statistics', () => {
    queueFailedWebhook({
      provider: 'stripe',
      signature: 'sig_1',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    const webhook2 = queueFailedWebhook({
      provider: 'github',
      signature: 'sig_2',
      timestamp: '1234567890',
      payload: '{}',
      failureReason: 'Test',
    });

    updateWebhookStatus(webhook2.id, 'failed');

    const stats = getQueueStats();
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(1);
    expect(stats.failed).toBe(1);
  });
});
