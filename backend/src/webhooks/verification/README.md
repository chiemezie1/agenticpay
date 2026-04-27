# Webhook Signature Verification

Comprehensive webhook signature verification system with HMAC-SHA256, replay protection, failed webhook queuing, and secret rotation support.

## Features

- ✅ **HMAC-SHA256 Verification** - Cryptographically secure signature validation
- ✅ **Timestamp Verification** - Replay attack protection with configurable tolerance
- ✅ **Per-Provider Secrets** - Support for multiple webhook providers (Stripe, GitHub, Stellar, etc.)
- ✅ **Secret Rotation** - Graceful secret rotation with backward compatibility
- ✅ **Failed Webhook Queue** - Automatic queuing of failed webhooks for manual review
- ✅ **Manual Retry** - Retry failed webhooks individually or in batch
- ✅ **Auto-Retry** - Automatic retry of eligible failed webhooks
- ✅ **Verification Logging** - Comprehensive logging of all verification attempts
- ✅ **Statistics & Monitoring** - Real-time stats on verification success rates

## Usage

### Middleware Integration

Apply the webhook signature verifier middleware to your webhook endpoints:

\`\`\`typescript
import { webhookSignatureVerifier } from './webhooks/verification/middleware.js';

app.post('/webhooks/stripe', webhookSignatureVerifier, async (req, res) => {
  // Webhook is verified, process the event
  const provider = req.webhookProvider; // 'stripe'
  const verified = req.webhookVerified; // true
  
  // Your webhook handling logic here
  res.json({ received: true });
});
\`\`\`

### Required Headers

Incoming webhooks must include these headers:

- `x-signature` - HMAC-SHA256 signature
- `x-timestamp` - Unix timestamp (seconds)
- `x-provider` - Provider identifier (e.g., 'stripe', 'github')

### Signature Generation

Webhooks should be signed using this format:

\`\`\`typescript
const timestamp = Math.floor(Date.now() / 1000).toString();
const payload = JSON.stringify(webhookData);
const signedPayload = `${timestamp}.${payload}`;

const hmac = crypto.createHmac('sha256', secret);
hmac.update(signedPayload);
const signature = hmac.digest('hex');
\`\`\`

## API Endpoints

### Failed Webhooks

- `GET /api/v1/webhooks/failed` - List failed webhooks
- `GET /api/v1/webhooks/failed/:id` - Get specific failed webhook
- `DELETE /api/v1/webhooks/failed/:id` - Delete failed webhook
- `GET /api/v1/webhooks/stats` - Get queue statistics

### Retry Operations

- `POST /api/v1/webhooks/retry` - Retry single webhook
- `POST /api/v1/webhooks/retry/batch` - Batch retry webhooks
- `POST /api/v1/webhooks/retry/auto` - Auto-retry eligible webhooks

### Verification Logs

- `GET /api/v1/webhooks/logs` - Get verification logs
- `GET /api/v1/webhooks/logs/stats` - Get verification statistics
- `DELETE /api/v1/webhooks/logs/old` - Clear old logs

### Secret Management

- `GET /api/v1/webhooks/providers` - List configured providers
- `GET /api/v1/webhooks/providers/:provider/rotation` - Get rotation info
- `POST /api/v1/webhooks/secrets/rotate` - Rotate provider secret
- `POST /api/v1/webhooks/secrets` - Add new provider secret
- `DELETE /api/v1/webhooks/secrets/:provider` - Remove provider secret

## Environment Variables

Add these to your `.env` file:

\`\`\`env
# Webhook Secrets
STRIPE_WEBHOOK_SECRET=whsec_...
STELLAR_WEBHOOK_SECRET=stellar_...
GITHUB_WEBHOOK_SECRET=github_...
\`\`\`

## Secret Rotation

To rotate a webhook secret:

1. Generate a new secret
2. Call the rotation endpoint:

\`\`\`bash
curl -X POST http://localhost:3001/api/v1/webhooks/secrets/rotate \\
  -H "Content-Type: application/json" \\
  -d '{"provider": "stripe", "newSecret": "new_secret_here"}'
\`\`\`

3. The system will keep the old secret active for a grace period
4. Update your webhook provider with the new secret
5. Old webhooks will still verify during the transition

## Edge Cases Handled

- **Clock Skew** - Configurable timestamp tolerance (default: 5 minutes)
- **Algorithm Mismatch** - Only HMAC-SHA256 is accepted
- **Replay Attacks** - Timestamp verification prevents replay
- **Secret Rotation** - Supports multiple secrets per provider
- **Failed Webhooks** - Automatic queuing for manual review
- **Retry Logic** - Exponential backoff with max retry limits

## Security Considerations

- Uses `crypto.timingSafeEqual()` to prevent timing attacks
- Secrets stored in memory (use vault in production)
- Failed webhooks logged with IP and user agent
- Timestamp tolerance prevents replay attacks
- HMAC-SHA256 provides cryptographic integrity

## Testing

Run the test suite:

\`\`\`bash
cd backend
npm test -- webhooks/verification
\`\`\`

## Production Recommendations

1. **Use a Secret Vault** - Replace in-memory secret storage with HashiCorp Vault or AWS Secrets Manager
2. **Persistent Queue** - Replace in-memory queue with Redis or database
3. **Monitoring** - Set up alerts for high failure rates
4. **Log Aggregation** - Send logs to centralized logging system
5. **Rate Limiting** - Apply rate limits to webhook endpoints
6. **IP Allowlisting** - Restrict webhooks to known provider IPs

## Architecture

\`\`\`
┌─────────────────┐
│  Webhook Event  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Signature Middleware   │
│  - Extract headers      │
│  - Verify timestamp     │
│  - Verify HMAC-SHA256   │
└────────┬────────────────┘
         │
    ┌────┴────┐
    │ Valid?  │
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
┌─────────┐         ┌──────────┐
│ Process │         │  Queue   │
│ Webhook │         │  Failed  │
└─────────┘         └────┬─────┘
                         │
                         ▼
                   ┌──────────┐
                   │  Manual  │
                   │  Retry   │
                   └──────────┘
\`\`\`

## License

MIT
