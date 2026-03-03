/**
 * Credential injector — securely inject credentials into agent environments.
 *
 * Resolves credential references in tool parameters and environment configs,
 * replacing placeholders with actual values from the credential store.
 * Credentials are never exposed to the LLM — only injected at execution time.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CredentialSource = "env" | "keychain" | "file" | "vault";

export type CredentialRef = {
  /** Credential name/key. */
  name: string;
  /** Where to resolve the credential from. */
  source: CredentialSource;
  /** For file source: path to the credentials file. */
  filePath?: string;
  /** For vault source: secret path. */
  vaultPath?: string;
  /** Whether the credential is required (default: true). */
  required?: boolean;
};

export type CredentialStore = {
  /** Resolve a credential by name and source. Returns undefined if not found. */
  resolve: (ref: CredentialRef) => string | undefined;
};

export type InjectionResult = {
  /** The injected environment variables. */
  env: Record<string, string>;
  /** Credential refs that could not be resolved. */
  missing: CredentialRef[];
  /** Number of credentials successfully injected. */
  injectedCount: number;
};

// ── Placeholder Pattern ──────────────────────────────────────────────────────

/**
 * Credential placeholder pattern: `${{credential:name:source}}`
 *
 * Examples:
 * - `${{credential:API_KEY:env}}`
 * - `${{credential:db_password:keychain}}`
 * - `${{credential:token:file:/path/to/secret}}`
 */
const CREDENTIAL_PATTERN = /\$\{\{credential:([^:}]+):([^:}]+)(?::([^}]*))?\}\}/g;

/**
 * Parse credential placeholders from a string.
 */
export function parseCredentialRefs(input: string): CredentialRef[] {
  const refs: CredentialRef[] = [];
  let match: RegExpExecArray | null;
  const pattern = new RegExp(CREDENTIAL_PATTERN.source, "g");

  while ((match = pattern.exec(input)) !== null) {
    const [, name, source, extra] = match;
    const ref: CredentialRef = {
      name,
      source: source as CredentialSource,
    };
    if (source === "file" && extra) {
      ref.filePath = extra;
    }
    if (source === "vault" && extra) {
      ref.vaultPath = extra;
    }
    refs.push(ref);
  }

  return refs;
}

/**
 * Replace credential placeholders in a string with resolved values.
 *
 * Returns the string with placeholders replaced and a list of unresolved refs.
 */
export function replaceCredentialPlaceholders(
  input: string,
  store: CredentialStore,
): { output: string; missing: CredentialRef[] } {
  const missing: CredentialRef[] = [];

  const output = input.replace(
    CREDENTIAL_PATTERN,
    (fullMatch, name: string, source: string, extra?: string) => {
      const ref: CredentialRef = {
        name,
        source: source as CredentialSource,
        filePath: source === "file" ? extra : undefined,
        vaultPath: source === "vault" ? extra : undefined,
      };
      const value = store.resolve(ref);
      if (value === undefined) {
        missing.push(ref);
        return fullMatch; // Leave placeholder as-is
      }
      return value;
    },
  );

  return { output, missing };
}

// ── Environment Injection ────────────────────────────────────────────────────

/**
 * Build a credential store backed by environment variables.
 */
export function envCredentialStore(
  env: Record<string, string | undefined> = process.env,
): CredentialStore {
  return {
    resolve(ref) {
      if (ref.source !== "env") {
        return undefined;
      }
      return env[ref.name] ?? undefined;
    },
  };
}

/**
 * Build a credential store backed by an in-memory map.
 */
export function mapCredentialStore(secrets: Record<string, string>): CredentialStore {
  return {
    resolve(ref) {
      return secrets[ref.name] ?? undefined;
    },
  };
}

/**
 * Chain multiple credential stores — first match wins.
 */
export function chainCredentialStores(...stores: CredentialStore[]): CredentialStore {
  return {
    resolve(ref) {
      for (const store of stores) {
        const value = store.resolve(ref);
        if (value !== undefined) {
          return value;
        }
      }
      return undefined;
    },
  };
}

/**
 * Inject credentials into environment variables from a list of refs.
 *
 * Each ref is resolved and added to the environment map under its name.
 */
export function injectCredentials(
  refs: CredentialRef[],
  store: CredentialStore,
  baseEnv: Record<string, string> = {},
): InjectionResult {
  const env = { ...baseEnv };
  const missing: CredentialRef[] = [];
  let injectedCount = 0;

  for (const ref of refs) {
    const value = store.resolve(ref);
    if (value === undefined) {
      if (ref.required !== false) {
        missing.push(ref);
      }
      continue;
    }
    env[ref.name] = value;
    injectedCount++;
  }

  return { env, missing, injectedCount };
}
