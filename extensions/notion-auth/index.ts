import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import {
  buildOauthProviderAuthResult,
  emptyPluginConfigSchema,
  isWSL2Sync,
  type MinionPluginApi,
  type ProviderAuthContext,
} from "minion/plugin-sdk";

// OAuth constants — Notion requires these via env vars (per-org integration)
const CLIENT_ID = process.env.NOTION_OAUTH_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.NOTION_OAUTH_CLIENT_SECRET ?? "";
const REDIRECT_URI = "http://localhost:51123/oauth-callback";
const AUTH_URL = "https://api.notion.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.notion.com/v1/oauth/token";

const RESPONSE_PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Minion Notion OAuth</title>
  </head>
  <body>
    <main>
      <h1>Authentication complete</h1>
      <p>You can return to the terminal.</p>
    </main>
  </body>
</html>`;

function shouldUseManualOAuthFlow(isRemote: boolean): boolean {
  return isRemote || isWSL2Sync();
}

function buildAuthUrl(state: string): string {
  if (!CLIENT_ID) {
    throw new Error(
      "NOTION_OAUTH_CLIENT_ID is not set. " +
        "Create a public Notion integration at https://notion.so/my-integrations " +
        "and set NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET.",
    );
  }
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", state);
  return url.toString();
}

function parseCallbackInput(input: string): { code: string; state: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { error: "No input provided" };
  }
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) {
      return { error: "Missing 'code' parameter in URL" };
    }
    if (!state) {
      return { error: "Missing 'state' parameter in URL" };
    }
    return { code, state };
  } catch {
    return { error: "Paste the full redirect URL (not just the code)." };
  }
}

async function startCallbackServer(params: { timeoutMs: number }) {
  const redirect = new URL(REDIRECT_URI);
  const port = redirect.port ? Number(redirect.port) : 51123;

  let settled = false;
  let resolveCallback: (url: URL) => void;
  let rejectCallback: (err: Error) => void;

  const callbackPromise = new Promise<URL>((resolve, reject) => {
    resolveCallback = (url) => {
      if (settled) return;
      settled = true;
      resolve(url);
    };
    rejectCallback = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
  });

  const timeout = setTimeout(() => {
    rejectCallback(new Error("Timed out waiting for OAuth callback"));
  }, params.timeoutMs);
  timeout.unref?.();

  const server = createServer((request, response) => {
    if (!request.url) {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("Missing URL");
      return;
    }

    const url = new URL(request.url, `${redirect.protocol}//${redirect.host}`);
    if (url.pathname !== redirect.pathname) {
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(RESPONSE_PAGE);
    resolveCallback(url);

    setImmediate(() => {
      server.close();
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      reject(err);
    };
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  return {
    waitForCallback: () => callbackPromise,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

// Notion uses Basic auth for token exchange (base64(client_id:client_secret))
async function exchangeCode(code: string): Promise<{
  access: string;
  email?: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
}> {
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    workspace_id?: string;
    workspace_name?: string;
    bot_id?: string;
    owner?: {
      type?: string;
      user?: {
        person?: { email?: string };
      };
    };
  };

  const access = data.access_token?.trim();
  if (!access) {
    throw new Error("Token exchange returned no access_token");
  }

  return {
    access,
    email: data.owner?.user?.person?.email,
    workspaceId: data.workspace_id ?? "",
    workspaceName: data.workspace_name ?? "",
    botId: data.bot_id ?? "",
  };
}

async function loginNotion(params: {
  isRemote: boolean;
  openUrl: (url: string) => Promise<void>;
  prompt: (message: string) => Promise<string>;
  note: (message: string, title?: string) => Promise<void>;
  log: (message: string) => void;
  progress: { update: (msg: string) => void; stop: (msg?: string) => void };
}): Promise<{
  access: string;
  email?: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
}> {
  const state = randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl(state);

  let callbackServer: Awaited<ReturnType<typeof startCallbackServer>> | null = null;
  const needsManual = shouldUseManualOAuthFlow(params.isRemote);
  if (!needsManual) {
    try {
      callbackServer = await startCallbackServer({ timeoutMs: 5 * 60 * 1000 });
    } catch {
      callbackServer = null;
    }
  }

  if (!callbackServer) {
    await params.note(
      [
        "Open the URL in your local browser.",
        "After authorizing, copy the full redirect URL and paste it back here.",
        "",
        `Auth URL: ${authUrl}`,
        `Redirect URI: ${REDIRECT_URI}`,
      ].join("\n"),
      "Notion OAuth",
    );
    params.log("");
    params.log("Copy this URL:");
    params.log(authUrl);
    params.log("");
  }

  if (!needsManual) {
    params.progress.update("Opening Notion authorization\u2026");
    try {
      await params.openUrl(authUrl);
    } catch {
      // ignore
    }
  }

  let code = "";
  let returnedState = "";

  if (callbackServer) {
    params.progress.update("Waiting for OAuth callback\u2026");
    const callback = await callbackServer.waitForCallback();
    code = callback.searchParams.get("code") ?? "";
    returnedState = callback.searchParams.get("state") ?? "";
    await callbackServer.close();
  } else {
    params.progress.update("Waiting for redirect URL\u2026");
    const input = await params.prompt("Paste the redirect URL: ");
    const parsed = parseCallbackInput(input);
    if ("error" in parsed) {
      throw new Error(parsed.error);
    }
    code = parsed.code;
    returnedState = parsed.state;
  }

  if (!code) {
    throw new Error("Missing OAuth code");
  }
  if (returnedState !== state) {
    throw new Error("OAuth state mismatch. Please try again.");
  }

  params.progress.update("Exchanging code for token\u2026");
  const result = await exchangeCode(code);

  params.progress.stop("Notion OAuth complete");
  return result;
}

const notionPlugin = {
  id: "notion-auth",
  name: "Notion Auth",
  description: "OAuth flow for Notion workspace access",
  configSchema: emptyPluginConfigSchema(),
  register(api: MinionPluginApi) {
    api.registerProvider({
      id: "notion",
      label: "Notion",
      docsPath: "/providers/models",
      aliases: [],
      auth: [
        {
          id: "oauth",
          label: "Notion OAuth",
          hint: "Authorize your Notion workspace",
          kind: "oauth",
          run: async (ctx: ProviderAuthContext) => {
            const spin = ctx.prompter.progress("Starting Notion OAuth\u2026");
            try {
              const result = await loginNotion({
                isRemote: ctx.isRemote,
                openUrl: ctx.openUrl,
                prompt: async (message) => String(await ctx.prompter.text({ message })),
                note: ctx.prompter.note,
                log: (message) => ctx.runtime.log(message),
                progress: spin,
              });

              return buildOauthProviderAuthResult({
                providerId: "notion",
                defaultModel: "",
                access: result.access,
                email: result.email,
                credentialExtra: {
                  workspaceId: result.workspaceId,
                  workspaceName: result.workspaceName,
                  botId: result.botId,
                },
                configPatch: {},
                notes: [
                  `Workspace: ${result.workspaceName || "(unknown)"}`,
                  "Notion tokens are long-lived. Re-run auth to get a new one.",
                  "Remember to share pages/databases with your integration.",
                ],
              });
            } catch (err) {
              spin.stop("Notion OAuth failed");
              throw err;
            }
          },
        },
      ],
    });
  },
};

export default notionPlugin;
