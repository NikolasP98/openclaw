/**
 * Google Gemini AI Provider Provisioning
 *
 * NOTE: As of January 2025, the status of programmatic API key creation
 * for Google Gemini needs verification. This is a placeholder implementation.
 */

import type { ProvisionKeyParams, ProvisionKeyResult } from "../types.js";

/**
 * Provision a new Gemini API key using a master key
 *
 * @throws Error - Throws until verified that Google provides key management API
 */
export async function provisionGeminiKey(
	_masterKey: string,
	_params: ProvisionKeyParams,
): Promise<ProvisionKeyResult> {
	throw new Error(
		"Gemini API key provisioning not yet implemented - API support needs verification. " +
			"Please use manual key setup via the onboard API.",
	);

	// Future implementation (if API is available):
	// const response = await fetch('https://generativelanguage.googleapis.com/v1/apiKeys', {
	//   method: 'POST',
	//   headers: {
	//     'Authorization': `Bearer ${masterKey}`,
	//     'Content-Type': 'application/json',
	//   },
	//   body: JSON.stringify({
	//     displayName: params.name,
	//     // Quotas/restrictions if supported
	//   }),
	// });
	//
	// if (!response.ok) {
	//   const error = await response.text();
	//   throw new Error(`Gemini key creation failed: ${error}`);
	// }
	//
	// const data = await response.json();
	// return {
	//   keyId: data.name,
	//   key: data.key,
	// };
}

/**
 * Revoke a Gemini API key
 *
 * @throws Error - Throws until verified that Google provides key management API
 */
export async function revokeGeminiKey(_masterKey: string, _keyId: string): Promise<void> {
	throw new Error(
		"Gemini API key revocation not yet implemented - API support needs verification.",
	);

	// Future implementation:
	// const response = await fetch(`https://generativelanguage.googleapis.com/v1/${keyId}`, {
	//   method: 'DELETE',
	//   headers: {
	//     'Authorization': `Bearer ${masterKey}`,
	//   },
	// });
	//
	// if (!response.ok) {
	//   const error = await response.text();
	//   throw new Error(`Gemini key revocation failed: ${error}`);
	// }
}
