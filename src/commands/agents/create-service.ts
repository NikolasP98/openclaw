/**
 * Agent Creation Service
 *
 * Reusable service for creating OpenClaw agents, extracted from CLI commands
 * for use by HTTP API and other programmatic interfaces.
 */

import type { OpenClawConfig } from "../../config/types.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveAgentDir, resolveUserPath } from "../../utils.js";
import { applyAgentConfig, findAgentEntryIndex, listAgentEntries } from "../agents.config.js";
import {
	applyAgentBindings,
	describeBinding,
	parseBindingSpecs,
	type AgentBindingResult,
} from "../agents.bindings.js";
import { ensureWorkspaceAndSessions } from "../onboard-helpers.js";
import type { RuntimeEnv } from "../../runtime.js";
import { createQuietRuntime } from "../agents.command-shared.js";
import type { AiProviderKey } from "../../gateway/ai-provisioning/types.js";
import { provisionAiKeyForAgent } from "../../gateway/ai-provisioning/provision.js";
import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";
import { resolveAuthStorePath } from "../../agents/auth-profiles/paths.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Parameters for creating an agent
 */
export type CreateAgentParams = {
	/** Agent name (will be normalized to agent ID) */
	name: string;
	/** Workspace directory path */
	workspace: string;
	/** Optional agent directory path (defaults to ~/.openclaw/agents/{agentId}/agent) */
	agentDir?: string;
	/** Optional model identifier */
	model?: string;
	/** Optional channel binding specifications */
	bind?: string[];
	/** Optional identity configuration */
	identity?: {
		name?: string;
		avatar?: string;
	};
	/** Skip workspace bootstrapping */
	skipBootstrap?: boolean;
	/** Auto-provision AI API key */
	autoProvisionAiKey?: {
		provider: "anthropic" | "openai" | "gemini";
		quotas?: {
			maxTokensPerMonth?: number;
			maxRequestsPerDay?: number;
		};
	};
};

/**
 * Result of agent creation
 */
export type CreateAgentResult = {
	/** Normalized agent ID */
	agentId: string;
	/** Agent name */
	name: string;
	/** Resolved workspace directory path */
	workspace: string;
	/** Resolved agent directory path */
	agentDir: string;
	/** Model identifier if provided */
	model?: string;
	/** Binding results */
	bindings: {
		added: string[];
		skipped: string[];
		conflicts: Array<{ binding: string; existingAgentId: string }>;
	};
	/** Auto-provisioned AI key information */
	aiKey?: {
		provider: string;
		profileId: string;
		keyId: string;
	};
	/** Updated config (caller should write this) */
	config: OpenClawConfig;
};

/**
 * Options for agent creation service
 */
export type CreateAgentServiceOptions = {
	/** AI provider key for auto-provisioning (if requested) */
	aiProviderKey?: AiProviderKey;
	/** Path to provisioned key mappings file */
	aiKeyMappingsPath?: string;
	/** Runtime environment (for logging) */
	runtime?: RuntimeEnv;
	/** Update existing agent instead of erroring */
	allowUpdate?: boolean;
};

/**
 * Create a new OpenClaw agent
 *
 * This service handles:
 * - Agent ID normalization and validation
 * - Duplicate detection
 * - Directory creation
 * - Config updates
 * - Binding application
 * - Optional AI key auto-provisioning
 * - Workspace initialization
 */
export async function createAgent(
	params: CreateAgentParams,
	cfg: OpenClawConfig,
	opts?: CreateAgentServiceOptions,
): Promise<CreateAgentResult> {
	const runtime = opts?.runtime ?? createQuietRuntime();

	// Normalize and validate agent ID
	const agentId = normalizeAgentId(params.name);
	if (agentId === DEFAULT_AGENT_ID) {
		throw new Error(`"${DEFAULT_AGENT_ID}" is reserved. Choose another name.`);
	}

	// Check for duplicates
	const existingIndex = findAgentEntryIndex(listAgentEntries(cfg), agentId);
	if (existingIndex >= 0 && !opts?.allowUpdate) {
		throw new Error(`Agent "${agentId}" already exists.`);
	}

	// Resolve paths
	const workspaceDir = resolveUserPath(params.workspace);
	const agentDir = params.agentDir
		? resolveUserPath(params.agentDir)
		: resolveAgentDir(cfg, agentId);

	// Auto-provision AI key if requested
	let aiKeyInfo: CreateAgentResult["aiKey"];
	if (params.autoProvisionAiKey && opts?.aiProviderKey && opts?.aiKeyMappingsPath) {
		try {
			const provisioned = await provisionAiKeyForAgent(
				agentId,
				opts.aiProviderKey,
				{
					quotas: params.autoProvisionAiKey.quotas,
					mappingsFilePath: opts.aiKeyMappingsPath,
				},
			);

			aiKeyInfo = {
				provider: params.autoProvisionAiKey.provider,
				profileId: provisioned.profileId,
				keyId: provisioned.keyId,
			};

			// Write the provisioned key to auth profiles
			const authStorePath = resolveAuthStorePath(agentDir);
			await mkdir(dirname(authStorePath), { recursive: true });

			// Initialize or load existing auth store
			const authStore = ensureAuthProfileStore(agentDir, {
				allowKeychainPrompt: false,
			});

			// Add the provisioned key as a new profile
			authStore.addProfile({
				id: provisioned.profileId,
				provider: params.autoProvisionAiKey.provider,
				apiKey: provisioned.apiKey,
			});

			await authStore.save();
		} catch (error) {
			throw new Error(
				`Failed to auto-provision AI key: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	// Apply agent config
	let nextConfig = applyAgentConfig(cfg, {
		agentId,
		name: params.name,
		workspace: workspaceDir,
		agentDir,
		...(params.model ? { model: params.model } : {}),
	});

	// Parse and apply bindings
	let bindingResult: AgentBindingResult = {
		config: nextConfig,
		added: [],
		skipped: [],
		conflicts: [],
	};

	if (params.bind && params.bind.length > 0) {
		const bindingParse = parseBindingSpecs({
			agentId,
			specs: params.bind,
			config: nextConfig,
		});

		if (bindingParse.errors.length > 0) {
			throw new Error(`Binding errors: ${bindingParse.errors.join("; ")}`);
		}

		if (bindingParse.bindings.length > 0) {
			bindingResult = applyAgentBindings(nextConfig, bindingParse.bindings);
			nextConfig = bindingResult.config;
		}
	}

	// Ensure workspace and session directories
	await ensureWorkspaceAndSessions(workspaceDir, runtime, {
		skipBootstrap: params.skipBootstrap ?? Boolean(nextConfig.agents?.defaults?.skipBootstrap),
		agentId,
	});

	// Return result (config is written by caller)
	return {
		agentId,
		name: params.name,
		workspace: workspaceDir,
		agentDir,
		model: params.model,
		bindings: {
			added: bindingResult.added.map(describeBinding),
			skipped: bindingResult.skipped.map(describeBinding),
			conflicts: bindingResult.conflicts.map((conflict) => ({
				binding: describeBinding(conflict.binding),
				existingAgentId: conflict.existingAgentId,
			})),
		},
		aiKey: aiKeyInfo,
		config: nextConfig,
	};
}
