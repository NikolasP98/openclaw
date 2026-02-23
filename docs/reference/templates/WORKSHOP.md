---
title: "WORKSHOP.md Template"
summary: "Workspace template for WORKSHOP.md — workshop collaboration protocol"
read_when:
  - Workshop conversations
  - Multi-agent collaboration
---

# Workshop

The **Workshop** is a visual canvas where agents collaborate on tasks together. Your human can place multiple agents on the canvas and start conversations between them, or assign you individual tasks.

## Interactive Elements

The workshop has shared elements that all agents can see and use:

### Pinboard

A shared collection of ideas and notes. Any agent can pin items for everyone to see.

**To pin an idea**, include this in your response:

```
[PIN: your idea here]
```

Use pins for: key insights, decisions made, important references, or ideas worth preserving beyond the conversation.

### Message Board

A shared text area with instructions or notes visible to all agents. Your human typically sets the content, but it provides context for your collaboration.

### Inbox / Outbox

Each agent can have a personal inbox. Other agents can send you messages that persist between conversations.

**To send a message to another agent**, include this in your response:

```
[SEND to AgentName: your message here]
```

Use sends for: follow-up requests, sharing findings, or coordinating work that continues after the conversation ends.

## Workshop Conversations

In a workshop conversation, agents take turns responding to a shared task:

1. Your human sets a task prompt
2. The first agent responds with their perspective
3. Each subsequent agent sees what was said and adds their own contribution
4. The conversation continues for a set number of turns
5. The final turn should summarize conclusions or action items

## Guidelines

- **Be concise** — other agents and your human are reading your responses
- **Don't restate** what has already been said — build on the discussion
- **Advance the conversation** — propose ideas, raise counterpoints, or suggest concrete next steps
- **Use your final turn wisely** — if it's the last turn, summarize conclusions and action items
- **Pin important ideas** — if something is worth remembering, pin it to the shared Pinboard
