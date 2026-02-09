/**
 * OAuth notification system for async auth flow updates
 */

import type { FollowupRun } from "../auto-reply/reply/queue/types.js";
import { enqueueFollowupRun } from "../auto-reply/reply/queue/enqueue.ts";
import { loadSessionStore } from "../config/sessions.js";
import type { SessionEntry } from "../config/sessions.js";

/**
 * Notification types
 */
export type OAuthNotificationType = "success" | "timeout" | "error";

/**
 * OAuth notification data
 */
export interface OAuthNotification {
	type: OAuthNotificationType;
	email: string;
	message: string;
	sessionKey: string;
	agentId: string;
}

/**
 * Enqueue an OAuth notification to a session
 */
async function enqueueOAuthNotification(
	notification: OAuthNotification,
): Promise<void> {
	// Load session entry to get routing information
	const sessionStore = await loadSessionStore(notification.agentId);
	const sessionEntry = sessionStore[notification.sessionKey];

	if (!sessionEntry) {
		console.error(
			`Cannot send OAuth notification: session ${notification.sessionKey} not found`,
		);
		return;
	}

	// Build followup run from session entry
	const followupRun: FollowupRun = {
		prompt: notification.message,
		summaryLine: `OAuth ${notification.type}: ${notification.email}`,
		enqueuedAt: Date.now(),
		originatingChannel: sessionEntry.lastChannel,
		originatingTo: sessionEntry.lastTo,
		originatingAccountId: sessionEntry.lastAccountId,
		originatingThreadId: sessionEntry.lastThreadId,
		originatingChatType: sessionEntry.lastChatType,
		run: {
			agentId: notification.agentId,
			agentDir: sessionEntry.agentDir || "",
			sessionId: sessionEntry.sessionId || notification.sessionKey,
			sessionKey: notification.sessionKey,
			messageProvider: sessionEntry.lastChannel,
			sessionFile: sessionEntry.sessionFile || "",
			workspaceDir: sessionEntry.workspaceDir || process.cwd(),
			config: {} as any, // Will be populated by queue processor
			provider: sessionEntry.provider || "anthropic",
			model: sessionEntry.model || "claude-sonnet-4-5-20250929",
			timeoutMs: 300000, // 5 minutes
			blockReplyBreak: "message_end",
		},
	};

	// Enqueue the notification
	enqueueFollowupRun(
		notification.sessionKey,
		followupRun,
		{
			mode: "followup",
			debounceMs: 0, // Send immediately
		},
		"none", // No deduplication
	);
}

/**
 * Notify user of successful OAuth authentication
 */
export async function notifyAuthSuccess(
	sessionKey: string,
	agentId: string,
	email: string,
	services: string[],
): Promise<void> {
	const servicesStr = services.length > 0 ? services.join(", ") : "Gmail";

	await enqueueOAuthNotification({
		type: "success",
		email,
		sessionKey,
		agentId,
		message: `✓ Google authentication complete for ${email}! You can now use ${servicesStr} features.`,
	});
}

/**
 * Notify user of OAuth authentication timeout
 */
export async function notifyAuthTimeout(
	sessionKey: string,
	agentId: string,
	email: string,
): Promise<void> {
	await enqueueOAuthNotification({
		type: "timeout",
		email,
		sessionKey,
		agentId,
		message: `⏱ Gmail authorization timed out (5 minutes). Would you like to try again?`,
	});
}

/**
 * Notify user of OAuth authentication error
 */
export async function notifyAuthError(
	sessionKey: string,
	agentId: string,
	email: string,
	error: string,
): Promise<void> {
	let message: string;

	if (error === "access_denied") {
		message = `✗ Gmail authorization was declined. Let me know if you'd like to try again.`;
	} else {
		message = `✗ Gmail authorization failed: ${error}. Please try again.`;
	}

	await enqueueOAuthNotification({
		type: "error",
		email,
		sessionKey,
		agentId,
		message,
	});
}
