# Design: Transcribe Quoted Audio in Reply-To Context

**Date:** 2026-02-22

## Problem

When a WhatsApp user replies to a voice note, the `replyToBody` field is set to `<media:audio>`
(from `extractMediaPlaceholder`). This placeholder is embedded verbatim in the LLM's context via
`formatReplyContext`, so the agent cannot understand what the quoted audio contained.

Observed in production logs at 2026-02-22T20:06:08Z — PANIK said:

> "The issue is I still don't have access to the actual audio content or transcription."

## Root Cause

`describeReplyContext` in `extract.ts` calls `extractMediaPlaceholder` as a fallback when the
quoted message has no text. The resulting `<media:audio>` string flows through:

- `monitor.ts` → `WebInboundMessage.replyToBody`
- `message-line.ts` → `formatReplyContext` → embedded in `combinedBody`
- `process-message.ts` → `ctxPayload.ReplyToBody`

The Baileys socket (needed to download the quoted media) is only available in `monitor.ts`.
The config (needed for transcription) is only available in `processMessage`.

## Architecture

### Layer 1 — `src/web/inbound/extract.ts`

Export a new helper:

```typescript
export function extractQuotedAudioMessage(
  rawMessage: proto.IMessage | undefined,
): proto.IMessage | undefined;
```

Returns the normalized quoted `IMessage` if it's an audio message, else `undefined`. Reuses
existing `extractContextInfo` + `normalizeMessageContent` logic.

### Layer 2 — `src/web/inbound/types.ts` + `monitor.ts`

Add two optional fields to `WebInboundMessage`:

```typescript
replyToMediaPath?: string;
replyToMediaType?: string;
```

In `monitor.ts`, after `describeReplyContext`:

- Call `extractQuotedAudioMessage` on the raw message
- If audio is present, wrap as `{ message: quotedMsg }`, call `downloadMediaMessage` + `saveMediaBuffer`
- Populate `replyToMediaPath` / `replyToMediaType` on the outbound `WebInboundMessage`
- Failure is silent (no download = no path = falls back to `<media:audio>`)

### Layer 3 — `src/web/auto-reply/monitor/process-message.ts`

Before calling `buildInboundLine`, check:

```typescript
if (
  params.msg.replyToMediaPath &&
  params.msg.replyToBody &&
  MEDIA_PLACEHOLDER_RE.test(params.msg.replyToBody)
) {
  const transcript = await transcribeFirstAudio({
    ctx: { MediaPath: params.msg.replyToMediaPath, MediaType: params.msg.replyToMediaType },
    cfg: params.cfg,
  }).catch(() => undefined);
  if (transcript) {
    params.msg.replyToBody = transcript;
  }
}
```

`transcribeFirstAudio` already gates on `cfg.tools.media.audio.enabled`, so no extra config
check needed. Mutation of `params.msg.replyToBody` is consistent with the existing `wasMentioned`
mutation pattern in `group-gating.ts`.

## Data Flow

```
WhatsApp message arrives (user replied to voice note)
  ↓
monitor.ts: describeReplyContext → body="<media:audio>"
  ↓
monitor.ts: extractQuotedAudioMessage → proto.IMessage (audio)
  ↓
monitor.ts: downloadMediaMessage → buffer → saveMediaBuffer → path
  ↓
WebInboundMessage: replyToBody="<media:audio>", replyToMediaPath="/tmp/..."
  ↓
processMessage.ts: transcribeFirstAudio(replyToMediaPath) → "she said hello"
  ↓
params.msg.replyToBody = "she said hello"
  ↓
buildInboundLine / ctxPayload.ReplyToBody → transcript visible to LLM
```

## Error Handling

- Download failure → `replyToMediaPath` not set → `<media:audio>` preserved (no change)
- Transcription failure → `.catch(() => undefined)` → `<media:audio>` preserved (no change)
- Audio not configured → `transcribeFirstAudio` returns `undefined` → `<media:audio>` preserved

## Files Changed

1. `src/web/inbound/extract.ts` — export `extractQuotedAudioMessage`
2. `src/web/inbound/types.ts` — add `replyToMediaPath?`, `replyToMediaType?` to `WebInboundMessage`
3. `src/web/inbound/monitor.ts` — download quoted audio, populate new fields
4. `src/web/auto-reply/monitor/process-message.ts` — transcribe and mutate `replyToBody`
5. `src/web/auto-reply/monitor/process-message.inbound-contract.test.ts` — add contract test

## Testing

- Unit test in `process-message.inbound-contract.test.ts`: provide a `msg` with
  `replyToBody="<media:audio>"` and `replyToMediaPath="/tmp/fake.ogg"`, mock
  `transcribeFirstAudio` to return a transcript, assert `ctx.ReplyToBody` is the transcript.
- Integration: send voice note in WhatsApp, reply to it in a group, @mention PANIK,
  verify the reply context shows the transcript not `<media:audio>`.
