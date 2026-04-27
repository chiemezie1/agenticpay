import { Request, Response, NextFunction } from 'express';
import { verifyWebhookSignature } from './hmac.js';
import { getAllProviderSecrets } from './secrets.js';
import { queueFailedWebhook } from './queue.js';
import { logWebhookVerification } from './logger.js';

/**
 * Express middleware to verify incoming webhook signatures.
 * Assumes headers: x-signature, x-timestamp, x-provider
 * Supports secret rotation by trying current and previous secrets
 */
export async function webhookSignatureVerifier(req: Request, res: Response, next: NextFunction) {
  const signature = req.header('x-signature');
  const timestamp = req.header('x-timestamp');
  const provider = req.header('x-provider');
  
  if (!signature || !timestamp || !provider) {
    return res.status(400).json({ 
      error: 'Missing required headers',
      required: ['x-signature', 'x-timestamp', 'x-provider']
    });
  }

  const secrets = await getAllProviderSecrets(provider);
  if (secrets.length === 0) {
    logWebhookVerification({
      timestamp: new Date().toISOString(),
      provider,
      signature,
      requestTimestamp: timestamp,
      result: 'failure',
      reason: 'Unknown provider',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    
    return res.status(401).json({ error: 'Unknown provider' });
  }

  const payload = JSON.stringify(req.body);
  let verificationResult = null;
  let usedSecret = null;

  // Try current secret first, then previous secrets (for rotation support)
  for (const secret of secrets) {
    const result = verifyWebhookSignature({
      secret,
      signature,
      payload,
      timestamp,
    });

    if (result.valid) {
      verificationResult = result;
      usedSecret = secret;
      break;
    }
  }

  if (!verificationResult || !verificationResult.valid) {
    const failureReason = verificationResult?.reason || 'Invalid signature';
    
    // Queue failed webhook for manual review
    queueFailedWebhook({
      provider,
      signature,
      timestamp,
      payload,
      failureReason,
    });

    // Log verification failure
    logWebhookVerification({
      timestamp: new Date().toISOString(),
      provider,
      signature,
      requestTimestamp: timestamp,
      result: 'failure',
      reason: failureReason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(401).json({ 
      error: 'Invalid webhook signature', 
      reason: failureReason 
    });
  }

  // Log successful verification
  logWebhookVerification({
    timestamp: new Date().toISOString(),
    provider,
    signature,
    requestTimestamp: timestamp,
    result: 'success',
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Attach provider info to request for downstream handlers
  req.webhookProvider = provider;
  req.webhookVerified = true;

  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      webhookProvider?: string;
      webhookVerified?: boolean;
    }
  }
}
