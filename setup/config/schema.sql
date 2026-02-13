-- OpenClaw Setup Framework - SQLite Schema
-- Database: state.db
-- Purpose: Track profiles, agents, and deployments

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Profiles table: Reusable configuration templates
CREATE TABLE IF NOT EXISTS profiles (
    profile_id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    version TEXT DEFAULT '1.0.0',
    use_case TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config_json TEXT NOT NULL,  -- Full configuration as JSON
    tags TEXT,  -- Comma-separated tags for filtering
    author TEXT,
    is_builtin BOOLEAN DEFAULT 0,  -- True for shipped profiles
    CONSTRAINT valid_name CHECK (length(name) <= 64)
);

-- Agents table: Deployed agent instances
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    agent_name TEXT UNIQUE NOT NULL,
    agent_username TEXT UNIQUE NOT NULL,
    vps_hostname TEXT NOT NULL,
    gateway_port INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, deploying, active, stopped, failed
    deployed_at TIMESTAMP,
    last_health_check TIMESTAMP,
    health_status TEXT,  -- healthy, unhealthy, unknown
    profile_id TEXT,
    version TEXT,  -- OpenClaw version
    FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE SET NULL,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'deploying', 'active', 'stopped', 'failed')),
    CONSTRAINT valid_port CHECK (gateway_port BETWEEN 1024 AND 65535)
);

-- Deployments table: Deployment history and logs
CREATE TABLE IF NOT EXISTS deployments (
    deployment_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status TEXT DEFAULT 'in_progress',  -- in_progress, completed, failed, rolled_back
    checkpoint TEXT,  -- Last successful phase
    log_file TEXT,
    error_message TEXT,
    deployed_by TEXT,  -- User who triggered deployment
    config_snapshot TEXT,  -- JSON snapshot of config used
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE,
    CONSTRAINT valid_deployment_status CHECK (status IN ('in_progress', 'completed', 'failed', 'rolled_back'))
);

-- Port allocations table: Track port usage to avoid conflicts
CREATE TABLE IF NOT EXISTS port_allocations (
    port_id INTEGER PRIMARY KEY AUTOINCREMENT,
    vps_hostname TEXT NOT NULL,
    port_number INTEGER NOT NULL,
    agent_id TEXT,
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP,
    status TEXT DEFAULT 'allocated',  -- allocated, released
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE SET NULL,
    CONSTRAINT unique_port_per_host UNIQUE (vps_hostname, port_number),
    CONSTRAINT valid_port_allocation CHECK (port_number BETWEEN 1024 AND 65535)
);

-- Health checks table: Historical health check results
CREATE TABLE IF NOT EXISTS health_checks (
    check_id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL,  -- healthy, unhealthy, timeout
    response_time_ms INTEGER,
    error_message TEXT,
    metrics_json TEXT,  -- CPU, memory, etc. as JSON
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Channels table: Track configured channels per agent
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    channel_type TEXT NOT NULL,  -- whatsapp, telegram, discord, web
    enabled BOOLEAN DEFAULT 1,
    credentials_path TEXT,
    last_message_at TIMESTAMP,
    message_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE,
    CONSTRAINT unique_channel_per_agent UNIQUE (agent_id, channel_type)
);

-- API keys table: Encrypted storage of API credentials (NOT IMPLEMENTED - use file-based)
-- Note: This table is reserved for future use with proper encryption
-- For now, API keys are stored in agent's openclaw.json with 600 permissions
CREATE TABLE IF NOT EXISTS api_keys (
    key_id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    provider TEXT NOT NULL,  -- anthropic, openai, github
    key_hash TEXT NOT NULL,  -- SHA256 hash for validation (not the actual key)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_validated TIMESTAMP,
    is_valid BOOLEAN DEFAULT 1,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Backups table: Track backup operations
CREATE TABLE IF NOT EXISTS backups (
    backup_id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    backup_type TEXT NOT NULL,  -- manual, scheduled, pre_upgrade
    size_bytes INTEGER,
    location TEXT NOT NULL,
    checksum TEXT,
    status TEXT DEFAULT 'completed',  -- in_progress, completed, failed
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Audit log table: Track all configuration changes
CREATE TABLE IF NOT EXISTS audit_log (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    entity_type TEXT NOT NULL,  -- profile, agent, deployment
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,  -- create, update, delete, deploy, stop, start
    user TEXT,
    changes_json TEXT,  -- JSON of what changed
    ip_address TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_hostname ON agents(vps_hostname);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_agent ON deployments(agent_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_agent ON health_checks(agent_id);
CREATE INDEX IF NOT EXISTS idx_health_checks_time ON health_checks(checked_at);
CREATE INDEX IF NOT EXISTS idx_port_allocations_host ON port_allocations(vps_hostname, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

-- Create views for common queries
CREATE VIEW IF NOT EXISTS active_agents AS
SELECT
    a.agent_id,
    a.agent_name,
    a.agent_username,
    a.vps_hostname,
    a.gateway_port,
    a.deployed_at,
    a.health_status,
    p.name as profile_name,
    COUNT(DISTINCT c.channel_id) as channel_count
FROM agents a
LEFT JOIN profiles p ON a.profile_id = p.profile_id
LEFT JOIN channels c ON a.agent_id = c.agent_id AND c.enabled = 1
WHERE a.status = 'active'
GROUP BY a.agent_id;

CREATE VIEW IF NOT EXISTS deployment_summary AS
SELECT
    d.deployment_id,
    d.started_at,
    d.completed_at,
    d.status,
    d.checkpoint,
    a.agent_name,
    a.vps_hostname,
    CASE
        WHEN d.completed_at IS NULL THEN NULL
        ELSE (julianday(d.completed_at) - julianday(d.started_at)) * 24 * 60
    END as duration_minutes
FROM deployments d
JOIN agents a ON d.agent_id = a.agent_id;

CREATE VIEW IF NOT EXISTS port_usage AS
SELECT
    vps_hostname,
    COUNT(*) as allocated_ports,
    MIN(port_number) as lowest_port,
    MAX(port_number) as highest_port
FROM port_allocations
WHERE status = 'allocated'
GROUP BY vps_hostname;

-- Triggers for maintaining updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_profile_timestamp
AFTER UPDATE ON profiles
BEGIN
    UPDATE profiles SET updated_at = CURRENT_TIMESTAMP WHERE profile_id = NEW.profile_id;
END;

-- Trigger to audit agent changes
CREATE TRIGGER IF NOT EXISTS audit_agent_changes
AFTER UPDATE ON agents
BEGIN
    INSERT INTO audit_log (entity_type, entity_id, action, changes_json)
    VALUES ('agent', NEW.agent_id, 'update', json_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_health', OLD.health_status,
        'new_health', NEW.health_status
    ));
END;

-- Trigger to automatically release ports when agent is deleted
CREATE TRIGGER IF NOT EXISTS release_ports_on_agent_delete
BEFORE DELETE ON agents
BEGIN
    UPDATE port_allocations
    SET status = 'released', released_at = CURRENT_TIMESTAMP
    WHERE agent_id = OLD.agent_id;
END;

-- Insert default profiles (optional - can be loaded from YAML files instead)
INSERT OR IGNORE INTO profiles (profile_id, name, description, version, use_case, is_builtin, config_json, tags, author)
VALUES
    (
        'customer-support',
        'Customer Support',
        'Professional customer support agent for restaurant operations',
        '1.0.0',
        'Customer-facing support via WhatsApp and web dashboard',
        1,
        '{}',  -- Will be loaded from YAML file
        'support,customer,restaurant,whatsapp',
        'Big Agent Project'
    ),
    (
        'personal-assistant',
        'Personal Assistant',
        'Helpful personal assistant for daily tasks and productivity',
        '1.0.0',
        'Personal productivity assistant via Telegram and web dashboard',
        1,
        '{}',  -- Will be loaded from YAML file
        'personal,productivity,telegram,assistant',
        'Big Agent Project'
    );

-- Schema initialization complete
