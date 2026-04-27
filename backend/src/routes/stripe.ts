import { Router, Request, Response } from 'express';
import express from 'express';
import { webhookSignatureVerifier } from '../webhooks/verification/middleware.js';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import {
  createPaymentIntent,
  confirmPaymentIntent,
  cancelPaymentIntent,
  createCustomer,
  getCustomer,
  createRefund,
  getRefund,
  getDispute,
  listDisputes,
  submitDisputeEvidence,
  constructWebhookEvent,
  recordFee,
  getFeeRecord,
  listFeeRecords,
  estimateStripeFee,
} from '../services/stripe.js';

export const stripeRouter = Router();

// ── Schemas ──────────────────────────────────────────────────────────────────

const createPaymentIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  customerId: z.string().optional(),
  description: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const createRefundSchema = z.object({
  paymentIntentId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

const disputeEvidenceSchema = z.object({
  customerEmailAddress: z.string().email().optional(),
  customerName: z.string().optional(),
  productDescription: z.string().optional(),
  uncategorizedText: z.string().optional(),
});

// ── Payment Intents ──────────────────────────────────────────────────────────

/**
 * POST /api/v1/stripe/payment-intents
 * Create a payment intent (card tokenization entry point)
 */
stripeRouter.post(
  '/payment-intents',
  validate(createPaymentIntentSchema),
  asyncHandler(async (req, res) => {
    const { amount, currency, customerId, description, metadata } = req.body;

    const intent = await createPaymentIntent({ amount, currency, customerId, description, metadata });

    // Track fee estimate
    const stripeFee = estimateStripeFee(amount);
    recordFee({
      paymentIntentId: intent.id,
      amount,
      currency,
      stripeFee,
      netAmount: amount - stripeFee,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      id: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      stripeFee,
      netAmount: amount - stripeFee,
    });
  })
);

/**
 * GET /api/v1/stripe/payment-intents/:id
 * Retrieve a payment intent (check 3DS status, etc.)
 */
stripeRouter.get(
  '/payment-intents/:id',
  asyncHandler(async (req, res) => {
    const intent = await confirmPaymentIntent(req.params.id);
    res.json({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      nextAction: intent.next_action,
    });
  })
);

/**
 * POST /api/v1/stripe/payment-intents/:id/cancel
 * Cancel a payment intent
 */
stripeRouter.post(
  '/payment-intents/:id/cancel',
  asyncHandler(async (req, res) => {
    const intent = await cancelPaymentIntent(req.params.id);
    res.json({ id: intent.id, status: intent.status });
  })
);

// ── Customers ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/stripe/customers
 * Create a Stripe customer for card tokenization
 */
stripeRouter.post(
  '/customers',
  validate(createCustomerSchema),
  asyncHandler(async (req, res) => {
    const { email, name } = req.body;
    const customer = await createCustomer(email, name);
    res.status(201).json({ id: customer.id, email: customer.email, name: customer.name });
  })
);

/**
 * GET /api/v1/stripe/customers/:id
 */
stripeRouter.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    const customer = await getCustomer(req.params.id);
    if ((customer as { deleted?: boolean }).deleted) {
      throw new AppError(404, 'Customer not found', 'NOT_FOUND');
    }
    res.json({ id: customer.id });
  })
);

// ── Refunds ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/stripe/refunds
 * Issue a full or partial refund
 */
stripeRouter.post(
  '/refunds',
  validate(createRefundSchema),
  asyncHandler(async (req, res) => {
    const { paymentIntentId, amount, reason } = req.body;
    const refund = await createRefund({ paymentIntentId, amount, reason });
    res.status(201).json({
      id: refund.id,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
    });
  })
);

/**
 * GET /api/v1/stripe/refunds/:id
 */
stripeRouter.get(
  '/refunds/:id',
  asyncHandler(async (req, res) => {
    const refund = await getRefund(req.params.id);
    res.json({ id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency });
  })
);

// ── Disputes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/stripe/disputes
 * List disputes, optionally filtered by payment intent
 */
stripeRouter.get(
  '/disputes',
  asyncHandler(async (req, res) => {
    const paymentIntentId = req.query.paymentIntentId as string | undefined;
    const disputes = await listDisputes(paymentIntentId);
    res.json({ data: disputes.data.map((d) => ({ id: d.id, status: d.status, amount: d.amount, reason: d.reason })) });
  })
);

/**
 * GET /api/v1/stripe/disputes/:id
 */
stripeRouter.get(
  '/disputes/:id',
  asyncHandler(async (req, res) => {
    const dispute = await getDispute(req.params.id);
    res.json({ id: dispute.id, status: dispute.status, amount: dispute.amount, reason: dispute.reason });
  })
);

/**
 * POST /api/v1/stripe/disputes/:id/evidence
 * Submit evidence for a dispute
 */
stripeRouter.post(
  '/disputes/:id/evidence',
  validate(disputeEvidenceSchema),
  asyncHandler(async (req, res) => {
    const dispute = await submitDisputeEvidence(req.params.id, req.body);
    res.json({ id: dispute.id, status: dispute.status });
  })
);

// ── Fees ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/stripe/fees
 * List all tracked fee records
 */
stripeRouter.get(
  '/fees',
  asyncHandler(async (_req, res) => {
    res.json({ data: listFeeRecords() });
  })
);

/**
 * GET /api/v1/stripe/fees/:paymentIntentId
 */
stripeRouter.get(
  '/fees/:paymentIntentId',
  asyncHandler(async (req, res) => {
    const record = getFeeRecord(req.params.paymentIntentId);
    if (!record) throw new AppError(404, 'Fee record not found', 'NOT_FOUND');
    res.json(record);
  })
);

// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/stripe/webhooks
 * Stripe webhook endpoint — must use raw body parser
 */
stripeRouter.post(
  '/webhooks',
  express.raw({ type: 'application/json' }),
  webhookSignatureVerifier,
  asyncHandler(async (req: Request, res: Response) => {
    // NOTE: After signature verification, process the webhook as usual
    // If you need to reconstruct the event, do so here
    // const sig = req.headers['stripe-signature'] as string;
    // const event = constructWebhookEvent(req.body as Buffer, sig);
    // ...existing code for event handling...
    res.json({ received: true });
  })
);
