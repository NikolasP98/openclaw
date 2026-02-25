export type ExecApprovalForwardingMode = "session" | "targets" | "both";

export type ExecApprovalForwardTarget = {
  /** Channel id (e.g. "discord", "slack", or plugin channel id). */
  channel: string;
  /** Destination id (channel id, user id, etc. depending on channel). */
  to: string;
  /** Optional account id for multi-account channels. */
  accountId?: string;
  /** Optional thread id to reply inside a thread. */
  threadId?: string | number;
};

export type ExecApprovalForwardingConfig = {
  /** Enable forwarding exec approvals to chat channels. Default: false. */
  enabled?: boolean;
  /** Delivery mode (session=origin chat, targets=config targets, both=both). Default: session. */
  mode?: ExecApprovalForwardingMode;
  /** Only forward approvals for these agent IDs. Omit = all agents. */
  agentFilter?: string[];
  /** Only forward approvals matching these session key patterns (substring or regex). */
  sessionFilter?: string[];
  /** Explicit delivery targets (used when mode includes targets). */
  targets?: ExecApprovalForwardTarget[];
};

/** Per-category approval mode for the human-in-the-loop gate (Sprint E.1). */
export type ApprovalGateMode = "auto" | "confirm" | "admin-only";

export type ApprovalGateCategoryConfig = {
  shell?: ApprovalGateMode;
  file_write?: ApprovalGateMode;
  network?: ApprovalGateMode;
  database?: ApprovalGateMode;
  /** Milliseconds to wait for user confirmation before auto-aborting. Default: 60000. */
  timeoutMs?: number;
};

export type ApprovalsConfig = {
  exec?: ExecApprovalForwardingConfig;
  /** Human-in-the-loop gate applied before tool execution. */
  gate?: ApprovalGateCategoryConfig;
};
