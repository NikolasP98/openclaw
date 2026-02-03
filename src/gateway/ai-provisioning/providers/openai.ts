/**
 * OpenAI AI Provider Provisioning
 *
 * OpenAI provides an API for managing API keys programmatically.
 * https://platform.openai.com/docs/api-reference/api-keys
 */

import type { ProvisionKeyParams, ProvisionKeyResult } from "../types.js";

/**
 * Provision a new OpenAI API key using a master key
 */
export async function provisionOpenAiKey(
	masterKey: string,
	params: ProvisionKeyParams,
): Promise<ProvisionKeyResult> {
	const response = await fetch("https://api.openai.com/v1/organization/api_keys", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${masterKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name: params.name,
			// Note: OpenAI may not support quotas in key creation API
			// Check their documentation for latest capabilities
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI key creation failed (${response.status}): ${error}`);
	}

	const data = (await response.json()) as { id: string; key: string };
	return {
		keyId: data.id,
		key: data.key,
	};
}

/**
 * Revoke an OpenAI API key
 */
export async function revokeOpenAiKey(masterKey: string, keyId: string): Promise<void> {
	const response = await fetch(`https://api.openai.com/v1/organization/api_keys/${keyId}`, {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${masterKey}`,
		},
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`OpenAI key revocation failed (${response.status}): ${error}`);
	}
}
