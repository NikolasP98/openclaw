# Reply-To Audio Transcription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a WhatsApp user replies to a voice note, transcribe the quoted audio so the LLM sees the transcript instead of `<media:audio>`.

**Architecture:** Three-layer fix: (1) `extract.ts` exports a helper to pull the quoted audio proto out of a raw message, (2) `monitor.ts` downloads the quoted audio file and attaches its path to `WebInboundMessage`, (3) `processMessage` transcribes via `transcribeFirstAudio` and mutates `msg.replyToBody` before building the combined body — exactly the same transcribe-and-mutate pattern used for group history audio backfill.

**Tech Stack:** TypeScript, Baileys (`downloadMediaMessage`, `normalizeMessageContent`), existing `saveMediaBuffer` + `transcribeFirstAudio` utilities.

---

### Task 1: Export `extractQuotedAudioMessage` from `extract.ts`

**Files:**

- Modify: `src/web/inbound/extract.ts`

The private `extractContextInfo` function is already in this file. We add a small exported helper that uses it to pull out the quoted `IMessage` only when it's an audio message.

**Step 1: Write the failing test**

There are no unit tests for `extract.ts` functions in isolation (they're tested via `monitor.ts` integration tests). Skip the isolated unit test — the contract test in Task 4 covers end-to-end.

**Step 2: Add the export to `extract.ts`**

Add this function after the existing `describeReplyContext` export (around line 331):

```typescript
/**
 * Returns the normalized quoted IMessage if the raw message is a reply to an audio message,
 * otherwise undefined. Used by monitor.ts to decide whether to attempt a quoted-audio download.
 */
export function extractQuotedAudioMessage(
  rawMessage: proto.IMessage | undefined,
): proto.IMessage | undefined {
  const message = unwrapMessage(rawMessage);
  if (!message) return undefined;
  const contextInfo = extractContextInfo(message);
  const quoted = normalizeMessageContent(contextInfo?.quotedMessage as proto.IMessage | undefined);
  if (!quoted?.audioMessage) return undefined;
  return quoted;
}
```

**Step 3: Verify it compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/web/inbound/extract.ts
git commit -m "feat(inbound): export extractQuotedAudioMessage helper"
```

---

### Task 2: Add `replyToMediaPath`/`replyToMediaType` to `WebInboundMessage` and download in `monitor.ts`

**Files:**

- Modify: `src/web/inbound/types.ts`
- Modify: `src/web/inbound/monitor.ts`

**Step 1: Add fields to `WebInboundMessage`**

In `src/web/inbound/types.ts`, add two optional fields after the existing `replyToSenderE164` line (line 28):

```diff
   replyToSenderE164?: string;
+  replyToMediaPath?: string;
+  replyToMediaType?: string;
```

**Step 2: Import `extractQuotedAudioMessage` in `monitor.ts`**

In `src/web/inbound/monitor.ts`, add `extractQuotedAudioMessage` to the existing import from `./extract.js` (around line 14–20):

```diff
 import {
   describeReplyContext,
   extractLocationData,
+  extractQuotedAudioMessage,
   extractMediaPlaceholder,
   extractMentionedJids,
   extractText,
 } from "./extract.js";
```

**Step 3: Download quoted audio after `describeReplyContext` in `monitor.ts`**

`describeReplyContext` is called at line 252. Right after it, add the download block. Find this line:

```typescript
const replyContext = describeReplyContext(msg.message as proto.IMessage | undefined);

let mediaPath: string | undefined;
```

Replace with:

```typescript
const replyContext = describeReplyContext(msg.message as proto.IMessage | undefined);

let replyToMediaPath: string | undefined;
let replyToMediaType: string | undefined;
const quotedAudio = extractQuotedAudioMessage(msg.message as proto.IMessage | undefined);
if (quotedAudio) {
  try {
    const maxMb =
      typeof options.mediaMaxMb === "number" && options.mediaMaxMb > 0 ? options.mediaMaxMb : 50;
    const maxBytes = maxMb * 1024 * 1024;
    const mimetype = quotedAudio.audioMessage?.mimetype ?? "audio/ogg; codecs=opus";
    const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
    const buffer = await downloadMediaMessage(
      { message: quotedAudio } as import("@whiskeysockets/baileys").WAMessage,
      "buffer",
      {},
      { reuploadRequest: sock.updateMediaMessage, logger: sock.logger },
    ).catch(() => undefined);
    if (buffer) {
      const saved = await saveMediaBuffer(buffer, mimetype, "inbound-reply", maxBytes).catch(
        () => undefined,
      );
      if (saved) {
        replyToMediaPath = saved.path;
        replyToMediaType = mimetype;
      }
    }
  } catch (err) {
    logVerbose(`Quoted audio download failed: ${String(err)}`);
  }
}

let mediaPath: string | undefined;
```

**Step 4: Populate the new fields on `inboundMessage`**

Find the `inboundMessage` object construction (around line 302). After `replyToSenderE164: replyContext?.senderE164`, add:

```diff
         replyToSenderE164: replyContext?.senderE164,
+        replyToMediaPath,
+        replyToMediaType,
```

**Step 5: Verify it compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

**Step 6: Commit**

```bash
git add src/web/inbound/types.ts src/web/inbound/monitor.ts
git commit -m "feat(inbound): download quoted audio and attach replyToMediaPath to WebInboundMessage"
```

---

### Task 3: Transcribe `replyToBody` in `processMessage.ts`

**Files:**

- Modify: `src/web/auto-reply/monitor/process-message.ts`

`transcribeFirstAudio` is already imported from the group-history fix. `MEDIA_PLACEHOLDER_RE` is already defined in the same file.

**Step 1: Add the transcription block before `buildInboundLine`**

In `processMessage.ts`, find the line:

```typescript
  let combinedBody = buildInboundLine({
```

Immediately before it, insert:

```typescript
// Transcribe quoted audio so the LLM sees the transcript instead of <media:audio>.
if (
  params.msg.replyToMediaPath &&
  params.msg.replyToBody &&
  MEDIA_PLACEHOLDER_RE.test(params.msg.replyToBody.trim())
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

**Step 2: Verify it compiles**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/web/auto-reply/monitor/process-message.ts
git commit -m "feat(process-message): transcribe quoted audio in replyToBody before building context"
```

---

### Task 4: Add contract test

**Files:**

- Modify: `src/web/auto-reply/monitor/process-message.inbound-contract.test.ts`

The top-level mock for `audio-preflight.js` is already in place from the group-history fix. We only need to add a new `it` block.

**Step 1: Write the failing test**

Add this test at the end of the `describe` block (before the closing `});`):

```typescript
it("transcribes quoted audio in replyToBody before building context", async () => {
  capturedCtx = undefined;

  vi.mocked(transcribeFirstAudio).mockResolvedValueOnce("she said the meeting is at 3pm");

  await processMessage(
    makeProcessMessageArgs({
      routeSessionKey: "agent:main:whatsapp:direct:+1000",
      groupHistoryKey: "+1000",
      msg: {
        id: "msg2",
        from: "+1000",
        to: "+2000",
        chatType: "direct",
        body: "what did she say?",
        senderE164: "+1000",
        replyToBody: "<media:audio>",
        replyToSender: "+3000",
        replyToId: "quoted1",
        replyToMediaPath: "/tmp/fake-quoted.ogg",
        replyToMediaType: "audio/ogg",
      },
    }),
  );

  // oxlint-disable-next-line typescript/no-explicit-any
  const ctx = capturedCtx as any;
  expect(ctx.ReplyToBody).toBe("she said the meeting is at 3pm");
  // Combined body should also contain the transcript, not the placeholder
  expect(ctx.Body).toContain("she said the meeting is at 3pm");
  expect(ctx.Body).not.toContain("<media:audio>");
});
```

**Step 2: Run the failing test**

```bash
pnpm test src/web/auto-reply/monitor/process-message.inbound-contract.test.ts
```

Expected: the new test FAILS (ReplyToBody is still `<media:audio>`).

**Step 3: Run all tests to confirm they pass after implementation**

After Task 3 is complete:

```bash
pnpm test src/web/auto-reply/monitor/
```

Expected: all 6 tests pass.

**Step 4: Commit**

```bash
git add src/web/auto-reply/monitor/process-message.inbound-contract.test.ts
git commit -m "test(process-message): add contract test for quoted audio transcription in replyToBody"
```

---

### Task 5: Push and deploy

**Step 1: Run the full monitor test suite**

```bash
pnpm test src/web/auto-reply/monitor/ src/web/inbound/
```

Expected: all tests pass.

**Step 2: Push to DEV**

```bash
git push
```

**Step 3: Deploy to protopi**

Wait for npm publish CI to complete (check with `gh api repos/NikolasP98/openclaw/actions/workflows/234445030/runs --jq '.workflow_runs[0]'`), then:

```bash
ssh nikolas@protopi "sudo rm -rf /usr/lib/node_modules/@nikolasp98/minion && sudo npm cache clean --force && sudo npm install -g @nikolasp98/minion@dev"
ssh nikolas@protopi "sudo -u minion XDG_RUNTIME_DIR=/run/user/1002 systemctl --user restart minion-gateway"
```

**Step 4: Verify in logs**

```bash
ssh nikolas@protopi "sudo tail -100 /home/minion/.minion/logs/minion.log | python3 -c \"
import sys, json
for line in sys.stdin:
    try:
        obj = json.loads(line.strip())
        msg = str(obj.get('2') or obj.get('1') or '')
        t = obj.get('time','')[:19]
        name = str(obj.get('_meta',{}).get('name',''))
        level = obj.get('_meta',{}).get('logLevelName','')
        if any(k in (msg+name).lower() for k in ('reply', 'audio', 'inbound', 'whatsapp', 'error')):
            print(f'[{t}] [{level}] {msg}')
    except: pass
\""
```

Check that `<media:audio>` no longer appears in reply-to context for inbound group/DM messages.
