/**
 * Anthropic AI Provider Provisioning
 *
 * NOTE: As of January 2025, Anthropic does NOT have a public API for creating
 * API keys programmatically. This implementation is a placeholder for when
 * such an API becomes available.
 *
 * Current workarounds:
 * 1. Pre-generated key pool (admin pre-creates keys, system assigns them)
 * 2. Shared key with internal quota tracking
 * 3. Manual provisioning (create agent without key, add key later)
 */

import type { ProvisionKeyParams, ProvisionKeyResult } from "../types.js";

/**
 * Provision a new Anthropic API key using a master key
 *
 * @throws Error - Always throws until Anthropic provides key management API
 */
export async function provisionAnthropicKey(
	_masterKey: string,
	_params: ProvisionKeyParams,
): Promise<ProvisionKeyResult> {
	throw new Error(
		"Anthropic API key provisioning not available - API does not support programmatic key creation. " +
			"Please use manual key setup via the onboard API or pre-create a pool of keys.",
	);

	// Future implementation (when API becomes available):
	// const response = await fetch('https://api.anthropic.com/v1/api-keys', {
	//   method: 'POST',
	//   headers: {
	//     'Authorization': `Bearer ${masterKey}`,
	//     'Content-Type': 'application/json',
	//     'anthropic-version': '2023-06-01',
	//   },
	//   body: JSON.stringify({
	//     name: params.name,
	//     quotas: params.quotas,
	//   }),
	// });
	//
	// if (!response.ok) {
	//   const error = await response.text();
	//   throw new Error(`Anthropic key creation failed: ${error}`);
	// }
	//
	// const data = await response.json();
	// return {
	//   keyId: data.id,
	//   key: data.key,
	// };
}

/**
 * Revoke an Anthropic API key
 *
 * @throws Error - Always throws until Anthropic provides key management API
 */
export async function revokeAnthropicKey(
	_masterKey: string,
	_keyId: string,
): Promise<void> {
	throw new Error(
		"Anthropic API key revocation not available - API does not support programmatic key management.",
	);

	// Future implementation:
	// const response = await fetch(`https://api.anthropic.com/v1/api-keys/${keyId}`, {
	//   method: 'DELETE',
	//   headers: {
	//     'Authorization': `Bearer ${masterKey}`,
	//     'anthropic-version': '2023-06-01',
	//   },
	// });
	//
	// if (!response.ok) {
	//   const error = await response.text();
	//   throw new Error(`Anthropic key revocation failed: ${error}`);
	// }
}
