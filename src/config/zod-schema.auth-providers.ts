/**
 * Zod validation schema for auth providers configuration.
 *
 * SYNC: Fields here must match AuthProvidersConfig types in:
 *  - src/config/types.auth-providers.ts
 */

import { z } from "zod";

/** OAuth callback server schema (shared across providers) */
export const AuthServerSchema = z
  .object({
    enabled: z.boolean().optional(),
    port: z.number().int().positive().optional(),
    bind: z.string().optional(),
    callbackPath: z.string().optional(),
    timeoutMinutes: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

/** Google provider config schema */
export const GoogleProviderSchema = z
  .object({
    clientCredentialsFile: z.string().optional(),
    externalRedirectUri: z.string().optional(),
  })
  .strict()
  .optional();

/** Auth providers top-level config schema */
export const AuthProvidersConfigSchema = z
  .object({
    server: AuthServerSchema,
    providers: z
      .object({
        google: GoogleProviderSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();
