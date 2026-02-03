export interface AgentBinding {
  agentId: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: 'dm' | 'group' | 'channel'; id: string };
    guildId?: string;
    teamId?: string;
  };
}

export interface AgentConfig {
  id: string;
  name?: string;
  workspace?: string;
  model?: string;
}

export interface GatewayConfig {
  mode?: 'local' | 'remote';
  reload?: {
    mode?: 'off' | 'restart' | 'hot' | 'hybrid';
    debounceMs?: number;
  };
  auth?: {
    token?: string;
    password?: string;
  };
  binding?: {
    address?: string;
    port?: number;
  };
}

export interface OpenClawConfig {
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
  gateway?: GatewayConfig;
  agents?: {
    list?: AgentConfig[];
  };
  bindings?: AgentBinding[];
  [key: string]: any;
}
