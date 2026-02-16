# Minion Documentation Expert & Code Review Skill

A comprehensive skill for code review, best practice guidance, documentation navigation, and upstream change analysis.

## Overview

This skill provides expert-level assistance with:

- **Code Review**: Review code against Minion conventions and suggest improvements
- **Best Practice Guidance**: Answer "Is this good practice?" and "Is there a better way?"
- **Pattern Discovery**: Find existing implementations and recommend reusable utilities
- **Issue Search**: Check GitHub issues for known problems and solutions
- **Documentation Navigation**: Quickly find and explain Minion features
- **Changelog Interpretation**: Parse and contextualize changes with real-world examples
- **Upstream Analysis**: Analyze recent commits from minion/minion repository
- **Impact Assessment**: Categorize changes by severity and functional impact

## Features

### 🔍 Code Review & Best Practices

- Reviews code against Minion conventions
- Answers "Is this good practice?" questions
- Finds existing implementations and patterns in the codebase
- Searches GitHub issues for known solutions
- Recommends reusable utilities and helpers
- Identifies anti-patterns and suggests corrections
- Explains why patterns are better with concrete examples

### 🗂️ Documentation Indexing

- Knows the complete `docs/` structure
- Cross-references related topics
- Provides file paths for easy navigation
- Falls back to online docs when needed

### 📋 Changelog Parsing

- Parses `CHANGELOG.md` semantically
- Groups changes by impact area (Gateway, Channels, CLI, etc.)
- Filters out chore commits (translations, formatting, deps)
- Includes PR numbers and contributor acknowledgments

### 🔍 Upstream Commit Analysis

- Analyzes git history between main and upstream/main
- Categorizes by severity: Critical → High → Medium → Low
- Provides real-world scenarios for each change
- Ignores non-functional commits automatically

### 💡 Contextual Examples

- Configuration snippets for new features
- Before/after scenarios for bug fixes
- Security implications for critical changes
- Migration guides for breaking changes

## Usage

### Invoke the Skill

```bash
# In Claude Code
/minion-docs <your question>
```

Or mention keywords that trigger the skill:

- "minion docs"
- "what's new in minion"
- "explain recent changes"
- "how does minion [feature] work"
- "minion changelog"
- "is this good practice"
- "is there a better way"
- "code review"
- "minion convention"

### Example Questions

#### Code Review

```
Q: Is it okay to directly query the database in my command handler?
A: ⚠️ Not Recommended - Minion uses dependency injection pattern.
   Shows: src/cli/commands/config.ts:23 (correct pattern)

Q: I'm manually parsing CLI flags. Is there a better way?
A: ✅ Yes - Use @clack/prompts and src/cli/options.ts utilities
   Example: src/cli/commands/send.ts:89

Q: Should I use process.env directly or is there a config abstraction?
A: ✅ Use config abstraction (documented in docs/gateway/configuration.md)
   Shows: src/gateway/config.ts:45 (type-safe approach)

Q: My channel handler isn't receiving messages. Known issue?
A: ✅ Fixed in GitHub issue #8432 (v2026.2.3)
   PR: #8445, Test: src/channels/router.test.ts:67
```

#### Documentation Navigation

```
Q: How do I set up Telegram with a custom bot?
A: [Reads docs/channels/telegram.md, provides step-by-step guide with config examples]

Q: What authentication options does the gateway support?
A: [Searches docs/gateway/, explains token vs password vs both, with examples]

Q: How do I configure cron jobs?
A: [Reads docs/automation/cron-jobs.md, provides schedule syntax and delivery modes]
```

#### Changelog Analysis

```
Q: What security fixes are in the latest release?
A: [Parses CHANGELOG.md, highlights security entries with detailed explanations]

Q: What changed for iOS support recently?
A: [Extracts iOS-related changes, explains new node app with setup guide]

Q: Show me all Telegram improvements in the last 3 versions
A: [Filters changelog for Telegram, groups by feature/fix, provides context]
```

#### Upstream Change Analysis

```
Q: Explain the recent upstream changes
A: [Runs git log, categorizes commits, provides impact analysis with examples]

Q: What are the critical changes I need to know about?
A: [Filters for security and breaking changes, detailed analysis with action items]

Q: How has the gateway configuration changed?
A: [Analyzes config-related commits, shows evolution of config options]
```

## Response Structure

### For Feature Questions

````markdown
# [Feature Name]

## Quick Answer

One-paragraph summary

## Configuration

```yaml
# Config example
```
````

## Use Cases

1. Scenario 1 with example
2. Scenario 2 with example
3. Scenario 3 with example

## Documentation

- docs/[primary-file].md
- docs/[related-file].md
- https://docs.minion.ai/[topic]

## Recent Changes

Any updates from CHANGELOG

````

### For Change Analysis
```markdown
# Recent Upstream Changes

## Critical Security & Breaking Changes
[Detailed analysis with security implications]

## High Impact Features
[New capabilities with comprehensive examples]

## Medium Impact Improvements
[Enhancements with before/after scenarios]

## Low Impact Changes
[Brief summaries]

## Filtered Out (Chore Commits)
[List of ignored commits]
````

## Documentation Index

The skill knows about these key documentation areas:

### Core Documentation

- `docs/index.md` - Main landing page
- `docs/start/` - Getting started guides
- `docs/gateway/` - Gateway configuration and operation
- `docs/cli/` - Command-line interface

### Channels

- `docs/channels/telegram.md` - Telegram bot setup
- `docs/channels/discord.md` - Discord integration
- `docs/channels/whatsapp.md` - WhatsApp Web setup
- `docs/channels/imessage.md` - iMessage integration
- `docs/channels/signal.md` - Signal support
- `docs/channels/slack.md` - Slack app setup
- And many more...

### Automation

- `docs/automation/cron-jobs.md` - Scheduled tasks
- `docs/automation/hooks.md` - Event-driven automation
- `docs/automation/webhook.md` - Webhook handlers
- `docs/automation/poll.md` - Polling integrations

### Platforms

- `docs/platforms/mac/` - macOS app guides
- `docs/platforms/ios/` - iOS node setup
- `docs/platforms/android/` - Android node setup
- `docs/platforms/docker/` - Docker deployment
- `docs/platforms/windows/` - Windows setup

### Advanced

- `docs/plugins/` - Plugin development
- `docs/security/` - Security best practices
- `docs/providers/` - AI provider configs
- `docs/web/` - Web Control UI
- `docs/nodes/` - Node architecture

## Change Impact Levels

### 🔴 Critical

- Security vulnerabilities
- Breaking changes
- Data loss prevention
- **Detail**: Comprehensive analysis with security implications, attack scenarios, required actions

### 🟡 High Impact

- New features
- Major bug fixes
- Performance improvements
- **Detail**: Feature overview, use cases, configuration, getting started

### 🟢 Medium Impact

- Enhancements
- Minor bug fixes
- UX improvements
- **Detail**: Problem/solution format with before/after example

### ⚪ Low Impact

- Documentation updates
- Minor refactors
- Edge case fixes
- **Detail**: Brief summary with use case

### 🚫 Filtered Out

- Translation commits (`i18n`, `zh-CN`, `ja-JP`)
- Dependency updates (unless security-related)
- Formatting/linting changes (`chore:`, `style:`)
- Test-only changes (unless fixing actual bugs)

## Integration with MCP Servers

This skill can be enhanced with external MCP servers:

### Git MCP Server

For advanced git history analysis:

```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@cyanheads/git-mcp-server"]
    }
  }
}
```

### GitHub MCP Server

For PR and issue analysis:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

### Context7 MCP Server

For framework documentation:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

## Agent Configuration

The skill uses the `docs-expert` agent with:

- **Model**: Claude Sonnet 4.5 (for accurate technical analysis)
- **Temperature**: 0.3 (precise, consistent responses)
- **Tools**: Read, Glob, Grep, Bash, WebFetch
- **Max Turns**: 20 (for thorough analysis)

## Examples

### Example 1: Feature Documentation

**User**: "How do I set up device pairing for iOS?"

**Response**:

````markdown
# iOS Device Pairing Setup

## Quick Answer

iOS device pairing allows you to use your iPhone as an Minion node with full
agent capabilities. Pair via Telegram using setup codes, then access the agent
through the native iOS app or continue using Telegram.

## Prerequisites

- Gateway running with Telegram channel configured
- iOS app installed (TestFlight during alpha)
- Gateway version 2026.2.6-4 or later

## Configuration

1. Enable node support in gateway:

```yaml
gateway:
  nodes:
    enabled: true
    allowCommands:
      - "device.status"
      - "calendar.list"
      - "contacts.search"
```
````

2. Configure allowed capabilities:

```bash
minion config set gateway.nodes.enabled true
minion config set gateway.nodes.allowCommands.0 "device.status"
```

## Pairing Flow

1. **Generate Pairing Code**:

   ```bash
   minion dashboard
   # Navigate to Nodes → Add Node → iOS
   # QR code and setup code will be displayed
   ```

2. **Pair via Telegram**:

   ```
   /pair [setup-code]
   ```

3. **Verify in iOS App**:
   - Open Minion iOS app
   - You'll see "Connected" status
   - Start chatting!

## Use Cases

1. **Mobile Development**: Code review on-the-go

   ```
   "Show me the git diff for the last commit"
   "Review this screenshot for UI bugs"
   ```

2. **Device Control**: Access device capabilities

   ```
   "What's my battery level?"
   "Who do I have a meeting with today?"
   ```

3. **Always-Available**: Agent in your pocket
   ```
   "Remind me to review PRs in 2 hours"
   "What's the weather forecast?"
   ```

## Security

Node commands use default-deny security model. Explicitly allowlist commands:

```yaml
gateway:
  nodes:
    allowCommands:
      - "device.status" # Safe: read-only
      - "calendar.list" # Safe: read-only
    denyCommands:
      - "device.wipe" # Dangerous!
      - "contacts.delete" # Dangerous!
```

## Documentation

- docs/platforms/ios/ - iOS app setup and features
- docs/channels/pairing.md - Pairing flow details
- docs/gateway/configuration.md#nodes - Node configuration

## Recent Changes (2026.2.6-4)

- ✨ Added alpha iOS node app (#11756)
- ✨ Added device-pair plugin for Telegram pairing (#11755)
- ✨ Added phone-control plugin for node management (#11755)
- 🔒 Added node command allowlists for security (#11755)

## Troubleshooting

**Pairing code expired?**

```bash
# Generate new code
minion nodes pair --generate
```

**App not connecting?**

- Verify gateway is running: `minion status`
- Check node is enabled: `minion config get gateway.nodes.enabled`
- Review logs: `minion logs --follow`

## Further Reading

- Plugin development: docs/plugins/
- Node architecture: docs/nodes/
- Security model: docs/security/

````

### Example 2: Upstream Change Analysis

**User**: "Explain the recent security fixes in upstream"

**Response**:
```markdown
# Recent Upstream Security Fixes

Analyzed 29 commits from main to upstream/main. Found 2 critical security fixes:

---

## Critical: Path Traversal Prevention (#12125, #12091)

### What Was Vulnerable
Minion's path resolution logic didn't properly canonicalize paths when using
custom `MINION_HOME` or relative paths, particularly on Windows. This could
allow path traversal attacks where an attacker could:
1. Set `MINION_HOME` to escape the intended directory
2. Access files outside the minion data directory
3. Potentially read sensitive files (SSH keys, credentials, etc.)

### Technical Details
**Affected Code**: Path resolution in config loading, session storage, agent data
**Attack Vector**: Environment variable injection or config file manipulation
**Platforms**: Primarily Windows (drive letter handling), also affects Linux/macOS

### Attack Scenario

**Before Fix**:
```bash
# Attacker sets malicious MINION_HOME
export MINION_HOME="../../../etc"
minion gateway run

# Path resolution might treat this as:
# /home/user/../../../etc -> /etc
# Now reading from /etc instead of /home/user/.minion
````

**After Fix**:

```bash
# Same attacker attempt
export MINION_HOME="../../../etc"
minion gateway run

# Path is canonicalized:
# Resolves to absolute path: /home/user/.minion
# Traversal attempts are blocked
```

### Impact Assessment

- **Severity**: Critical (CVSS 7.5 - Local File Disclosure)
- **Affected Users**: Windows users, custom MINION_HOME users
- **Exploit Complexity**: Low (simple env var modification)
- **Data at Risk**: Config files, session data, credentials

### Commits Involved

1. `456bd5874` - Structural path resolution for Windows (#12125)
2. `db137dd65` - Respect HOME/USERPROFILE in path resolution (#12091)
3. `41f3e90ea` - Add MINION_HOME environment variable (#12091)

### Mitigation

**Immediate Action Required**:

```bash
# Update to latest version
npm update -g minion

# Verify version includes fix
minion status
# Should show: v2026.2.6-4 or later (commit 456bd5874+)

# Review custom paths
minion config get | grep -i path
minion config get | grep -i home
```

**Additional Hardening**:

```bash
# Set explicit absolute path
export MINION_HOME="/home/user/.minion"

# Use restrictive permissions
chmod 700 ~/.minion
chmod 600 ~/.minion/config.yaml
```

**For Docker Users**:

```yaml
# Ensure volume mounts use absolute paths
volumes:
  - /absolute/path/to/.minion:/home/node/.minion
```

### Detection

Check logs for suspicious path access:

```bash
minion logs | grep -i "path"
minion logs | grep -i "MINION_HOME"
```

### Testing

Verify the fix works:

```bash
# This should fail gracefully (not traverse)
export MINION_HOME="../../../tmp"
minion config get

# Should use /home/user/.minion, not /tmp
```

---

## Related Security Improvements

### Config Validation (#5516)

- Auto-clamp invalid `maxTokens` to prevent API abuse
- Prevents accidental token exhaustion
- Low severity, high UX impact

### Gateway Auth Hardening (#11448)

- Improved LAN binding security
- Explicit probe URL construction
- Prevents auth bypass via DNS rebinding

---

## Upgrade Path

### If Running < 2026.2.6-4

1. **Backup Config**:

   ```bash
   cp ~/.minion/config.yaml ~/.minion/config.yaml.backup
   ```

2. **Update**:

   ```bash
   npm update -g minion
   ```

3. **Restart Gateway**:

   ```bash
   minion gateway restart
   ```

4. **Verify**:
   ```bash
   minion status
   minion doctor
   ```

### Docker Users

Update image:

```bash
docker pull ghcr.io/minion/minion:latest
docker-compose down
docker-compose up -d
```

---

## Documentation

- Security best practices: docs/security/
- Path configuration: docs/gateway/configuration.md#paths
- Windows setup: docs/platforms/windows/

## Timeline

- **Discovered**: Early February 2026
- **Fixed**: February 8, 2026 (commits #12091, #12125)
- **Released**: 2026.2.6-4
- **Disclosure**: Public (GitHub PR)

## Credits

- @sebslight - Discovered and fixed path resolution issues (#12091)
- @mcaxtr - Windows path handling and drive letter fix (#12125)

```

## Tips

1. **Be Specific**: Ask about specific features or areas
2. **Request Examples**: Ask for configuration snippets or use cases
3. **Check Recency**: Ask about "recent changes" to get latest updates
4. **Filter Smart**: Specify "ignore chore commits" for cleaner analysis
5. **Cross-Reference**: Ask to link related documentation

## Limitations

- Cannot access online-only resources without WebFetch
- Git analysis limited to local repository state
- May need to run `git fetch upstream` for latest commits
- Cannot execute Minion commands (read-only analysis)

## Development

### File Structure
```

.agents/skills/minion-docs/
├── SKILL.md # Main skill definition and prompts
├── agents/
│ └── docs-expert.yaml # Agent configuration
├── README.md # This file
└── examples/ # Example interactions (optional)

````

### Testing the Skill

```bash
# Invoke directly
/minion-docs What are the recent gateway changes?

# Or let it trigger automatically
How do I set up Telegram?
````

### Extending the Skill

To add new capabilities:

1. Update `SKILL.md` with new workflows
2. Adjust agent configuration in `docs-expert.yaml`
3. Test with various queries
4. Document new features in this README

## Version History

### v1.0.0 (2026-02-08)

- Initial release
- Documentation navigation
- Changelog parsing
- Upstream commit analysis
- Impact-based categorization
- Real-world examples

## Contributing

Improvements welcome! Focus areas:

- Better commit categorization heuristics
- More comprehensive documentation index
- Additional real-world scenario templates
- Integration with external MCP servers

## License

Part of the Minion project. MIT licensed.
