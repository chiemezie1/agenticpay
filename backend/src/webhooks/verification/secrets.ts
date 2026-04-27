import { config } from '../../config/env.js';

export interface ProviderSecretConfig {
  current: string;
  previous?: string[]; // For rotation support
  rotatedAt?: string;
}

// Per-provider secret management with rotation support
const providerSecrets: Record<string, ProviderSecretConfig> = {};

/**
 * Initialize provider secrets from environment variables
 */
export function initializeProviderSecrets(): void {
  const env = config();
  
  // Stripe
  if (env.STRIPE_WEBHOOK_SECRET) {
    providerSecrets['stripe'] = {
      current: env.STRIPE_WEBHOOK_SECRET,
      previous: [],
    };
  }

  // Add more providers from environment
  // Example: STELLAR_WEBHOOK_SECRET, GITHUB_WEBHOOK_SECRET, etc.
  const stellarSecret = process.env.STELLAR_WEBHOOK_SECRET;
  if (stellarSecret) {
    providerSecrets['stellar'] = {
      current: stellarSecret,
      previous: [],
    };
  }

  const githubSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (githubSecret) {
    providerSecrets['github'] = {
      current: githubSecret,
      previous: [],
    };
  }
}

/**
 * Get the current secret for a provider
 */
export async function getProviderSecret(provider: string): Promise<string | undefined> {
  const secretConfig = providerSecrets[provider];
  return secretConfig?.current;
}

/**
 * Get all secrets for a provider (current + previous for rotation)
 */
export async function getAllProviderSecrets(provider: string): Promise<string[]> {
  const secretConfig = providerSecrets[provider];
  if (!secretConfig) {
    return [];
  }

  return [secretConfig.current, ...(secretConfig.previous || [])];
}

/**
 * Rotate a provider's secret
 * Moves current secret to previous array and sets new current
 */
export function rotateProviderSecret(provider: string, newSecret: string): boolean {
  const secretConfig = providerSecrets[provider];
  if (!secretConfig) {
    return false;
  }

  // Keep last 3 previous secrets for grace period
  const previous = [secretConfig.current, ...(secretConfig.previous || [])].slice(0, 3);

  providerSecrets[provider] = {
    current: newSecret,
    previous,
    rotatedAt: new Date().toISOString(),
  };

  console.log(`[Webhook Secrets] Rotated secret for provider: ${provider}`);
  return true;
}

/**
 * Add a new provider secret
 */
export function addProviderSecret(provider: string, secret: string): void {
  providerSecrets[provider] = {
    current: secret,
    previous: [],
  };
}

/**
 * Remove a provider secret
 */
export function removeProviderSecret(provider: string): boolean {
  return delete providerSecrets[provider];
}

/**
 * List all configured providers
 */
export function listProviders(): string[] {
  return Object.keys(providerSecrets);
}

/**
 * Get secret rotation info for a provider
 */
export function getSecretRotationInfo(provider: string): {
  hasRotation: boolean;
  rotatedAt?: string;
  previousCount: number;
} | undefined {
  const secretConfig = providerSecrets[provider];
  if (!secretConfig) {
    return undefined;
  }

  return {
    hasRotation: (secretConfig.previous?.length || 0) > 0,
    rotatedAt: secretConfig.rotatedAt,
    previousCount: secretConfig.previous?.length || 0,
  };
}

// Initialize secrets on module load
initializeProviderSecrets();
