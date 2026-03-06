# Codex Path Integration Playbook

This document describes the Codex subscription auth model that is currently implemented in this repo and is confirmed working.

Use it when you want to redeploy the same pattern into another project without re-discovering the edge cases.

Core fact: there is no separate hosted Codex service in this design. Your backend must be able to launch `codex app-server` itself.

## 1. What this implementation does

The admin assistant supports two auth modes:

1. `apiKey`
2. `codexPath`

`codexPath` means:

- the backend launches `codex app-server`
- auth is managed through ChatGPT login
- the frontend can list available Codex models
- login can be completed even in hosted deployments where the returned callback is `http://localhost:...`

The Codex path is only used for assistant chat/model discovery/auth diagnostics. Image generation still uses the normal OpenAI API key path.

## 2. Files that define the current behavior

Backend:

- `api/src/codex/appServer.ts`
- `api/src/codex/homeProfile.ts`
- `api/src/http/ai-chat.ts`
- `api/src/http/ai-codex-models.ts`
- `api/src/http/ai-codex-login-complete.ts`
- `api/src/http/ai-codex-auth-health.ts`
- `api/src/http/config-get.ts`
- `api/src/http/config-upsert.ts`
- `api/src/types/content.ts`
- `api/package.json`

Frontend:

- `src/pages/AdminAiAssistant.tsx`
- `src/lib/api.ts`
- `src/types/content.ts`

If you port this to another project, port these pieces together. The flow depends on both the backend relay logic and the frontend draft-state behavior.

## 3. Stored config contract

The persisted config lives under `ai.adminAssistant.openai`.

Current fields:

```json
{
  "authMode": "apiKey | codexPath",
  "model": "string",
  "imageModel": "string",
  "imageSize": "string",
  "imageQuality": "auto | low | medium | high",
  "imageBackground": "auto | transparent | opaque",
  "imageOutputFormat": "png | jpeg | webp",
  "codexPath": "optional server-side executable/script path",
  "codexHome": "optional resolved state directory",
  "codexHomeProfile": "auto | azure | aws | local | custom",
  "codexAwsVolumeRoot": "optional, only meaningful when profile=aws",
  "apiKey": "optional secret",
  "hasApiKey": true,
  "hasCodexPath": true,
  "clearApiKey": false
}
```

Important behavior from `config-get` and `config-upsert`:

- `apiKey` is never returned to the client.
- `clearApiKey` is write-only and removed before storing/returning.
- `hasApiKey` and `hasCodexPath` are derived server-side.
- incoming `apiKey`, `codexPath`, `codexHome`, and `codexAwsVolumeRoot` are trimmed
- `codexAwsVolumeRoot` is cleared unless `codexHomeProfile === "aws"`
- invalid `authMode` or `codexHomeProfile` values are dropped
- if no new API key is supplied, the existing one is preserved unless `clearApiKey` is true

## 4. Request contract for chat

`POST /api/ai/chat` accepts:

```json
{
  "authMode": "apiKey | codexPath",
  "apiKey": "optional",
  "codexPath": "optional",
  "codexHome": "optional",
  "model": "optional",
  "messages": [
    { "role": "user | assistant", "content": "string" }
  ],
  "context": {}
}
```

Resolution order is:

1. request payload
2. stored config
3. environment variable
4. hard default

Current defaults:

- `authMode`: `apiKey`
- `model`: `gpt-4o-mini` for `apiKey`, `gpt-5.1-codex` for `codexPath`
- `codexPath`: `process.env.CODEX_PATH || "codex"`

Critical frontend rule: chat requests must send the current draft `authMode`, `apiKey`/`codexPath`, `codexHome`, and `model`, not only the saved config. This repo does that, and it is necessary.

## 5. Runtime prerequisites

Required:

- Node.js `>=20.19.0`
- backend can spawn child processes
- backend package includes `@openai/codex`
- a writable `CODEX_HOME` location
- a stable per-user ID from your auth layer
- shared storage for coordination/auth snapshots if you run multiple workers

Current backend dependency:

- `api/package.json` includes `@openai/codex`

Do not depend on a global system install in hosted environments. This implementation prefers the bundled runtime.

## 6. Codex binary resolution

Launch logic in `api/src/codex/appServer.ts` works like this:

1. If `codexPath` ends in `.js`, `.mjs`, or `.cjs`, spawn `node <that-script> app-server --listen stdio://`.
2. If `codexPath` is empty, `codex`, or `@openai/codex`:
   - first try bundled `@openai/codex/bin/codex.js`
   - otherwise fall back to `codex` on PATH
3. Otherwise spawn the explicit executable path directly.

If the executable is missing, errors explicitly tell you to install `@openai/codex` in the API package or set `CODEX_PATH`.

## 7. `codexHome` resolution and profile mapping

High-level profile mapping from `api/src/codex/homeProfile.ts`:

- `azure` -> `/home/site/.codex/ntechr`
- `aws` -> `${awsVolumeRoot}/.codex/ntechr`
- `local` -> `.codex-home`
- `custom` -> no derived value; user must supply one
- `auto`:
  - Azure runtime if `WEBSITE_SITE_NAME` or `WEBSITE_INSTANCE_ID` is set
  - AWS runtime if `AWS_EXECUTION_ENV`, `ECS_CONTAINER_METADATA_URI`, `ECS_CONTAINER_METADATA_URI_V4`, or `EKS_CLUSTER_NAME` is set
  - otherwise `.codex-home`

AWS volume root defaults to `/mnt/efs`.

Session-level fallback in `resolveCodexHomePath()` is:

1. explicit requested home
2. on Azure: `/home/site/.codex/ntechr`, then `/home/site/.codex`
3. `<cwd>/.codex-home`
4. `<tmpdir>/ntechr-codex-home`

Every candidate must be writable.

Project-specific values to change when you port this:

- `/home/site/.codex/ntechr`
- `${awsRoot}/.codex/ntechr`
- temporary dir name `ntechr-codex-home`
- `clientInfo.name` / `clientInfo.title` currently set to `ntechr-api` / `ntechr API`

Do not keep the `ntechr` slug in another app unless you intentionally want multiple apps to share the same Codex state.

## 8. File-based auth persistence

This implementation forces Codex auth credentials into files under `codexHome`.

On every session startup, it ensures `${CODEX_HOME}/config.toml` contains:

```toml
cli_auth_credentials_store = "file"
mcp_oauth_credentials_store = "file"
```

It also expects auth tokens to exist in:

- `${CODEX_HOME}/auth.json`

Why this matters:

- hosted workers cannot rely on desktop keychains
- file-backed auth can survive restarts if `codexHome` is on persistent storage
- the backend can copy `auth.json` between workers when needed

## 9. Shared auth snapshot and login coordination

This repo uses the existing Cosmos `config` container as a shared coordination store.

It writes three internal document types:

- `codex-login-session:<loginKey>`
- `codex-login-task:<loginKey>`
- `codex-auth-snapshot:<ownerId>:<codexHomeHash>`

What they do:

- login session doc: tracks which worker owns a pending login relay session
- login task doc: lets a non-owning worker ask the owning worker to process a pasted callback URL
- auth snapshot doc: stores `auth.json` when it contains a refresh token, so another worker can restore it before running `account/read`

All of this is keyed by the authenticated admin `ownerId`. If you port this, keep a stable per-user owner identifier in every Codex call.

If you remove shared storage, same-worker login may still work, but cross-worker login completion and auth restoration will become unreliable.

## 10. Exact Codex app-server session lifecycle

Each Codex interaction uses a fresh `CodexAppServerSession`.

Startup sequence:

1. resolve writable `codexHome`
2. enforce file-based auth config
3. restore `auth.json` from shared snapshot if the local file is missing/empty
4. spawn `codex app-server --listen stdio://`
5. send `initialize`
6. send `initialized`

Auth sequence:

1. call `account/read { refreshToken: true }`
2. if unauthenticated and `requiresOpenaiAuth` is true, wait 250ms and check once more
3. if still unauthenticated, call `account/login/start { type: "chatgpt" }`

Chat sequence:

1. `thread/start` with:
   - `approvalPolicy: "never"`
   - `sandbox: "read-only"`
   - `developerInstructions`
   - `ephemeral: true`
2. `turn/start` with:
   - `approvalPolicy: "never"`
   - `sandboxPolicy: { "type": "readOnly" }`
   - `effort: "medium"`
   - `outputSchema` when strict JSON is required

Turn output is assembled from:

1. `item/completed` with `phase === "final_answer"`
2. otherwise latest completed agent message
3. otherwise concatenated delta text

Usage is collected from `thread/tokenUsage/updated`.

The process is always closed at the end. It gets `SIGTERM` first and `SIGKILL` after a short timeout if needed.

## 11. JSON-RPC routing rules

The router in `appServer.ts` distinguishes:

1. response: has `id`, no `method`
2. notification: has `method`, no `id`
3. server request: has both `id` and `method`

You must handle server requests. This implementation intentionally disables tool execution and approvals:

- `item/commandExecution/requestApproval` -> `{ "decision": "cancel" }`
- `item/fileChange/requestApproval` -> `{ "decision": "cancel" }`
- `execCommandApproval` -> `{ "decision": "abort" }`
- `applyPatchApproval` -> `{ "decision": "abort" }`
- `item/tool/requestUserInput` -> `{ "answers": {} }`
- `item/tool/call` -> unsuccessful response with `"Tool calls are disabled in this integration."`
- `account/chatgptAuthTokens/refresh` -> JSON-RPC error
- unknown methods -> `-32601`

This is a chat-only Codex integration. It is not a general tool-executing agent.

## 12. Backend HTTP surface

Azure Functions registers these routes:

- `GET /api/ai/codex-models`
- `POST /api/ai/codex-login/complete`
- `GET /api/ai/codex-auth-health`
- `POST /api/ai/chat`

The Functions source files use route names without the `/api` prefix, but the deployed app is accessed through `/api/...`.

### 12.1 `GET /api/ai/codex-models`

Query params:

- `codexPath`
- `codexHome`
- `includeHidden`
- `startLogin`

Behavior:

- resolves `codexPath` and `codexHome` from query -> stored config -> env
- if `startLogin=1`, it forces a fresh login relay session
- otherwise it tries `model/list`
- if auth is required, it returns `loginRequired: true`

Successful model response shape:

```json
{
  "source": "codex",
  "includeHidden": false,
  "loginRequired": false,
  "models": []
}
```

Forced login response shape:

```json
{
  "source": "codex",
  "includeHidden": false,
  "loginRequired": true,
  "authUrl": "https://...",
  "pendingLoginId": "uuid",
  "callbackHint": "If login lands on localhost and fails, paste that full URL into Complete login.",
  "models": []
}
```

### 12.2 `POST /api/ai/codex-login/complete`

Body:

```json
{
  "loginId": "required for hosted runtime",
  "callbackUrl": "http://localhost:1455/auth/callback?code=...&state=...",
  "codexPath": "optional",
  "codexHome": "optional"
}
```

Important correction: the old "callback-only completion in hosted production" guidance is not accurate for this codebase anymore.

Current behavior:

- `loginId` is optional in the schema
- but if the backend detects a hosted runtime, it returns `400` when `loginId` is missing
- the frontend also requires a pending login id and disables `Complete login` without it

So the real production flow is:

1. click `Sign in to OpenAI`
2. receive `pendingLoginId`
3. complete login using that pending session

Response modes currently used:

- `relay`
- `relay-timeout-authenticated`
- `relay-timeout-pending`
- `fallback`

Fallback means the backend recovered using direct callback forwarding or replay after relay failure. It is a backend recovery path, not the primary hosted UX.

### 12.3 `GET /api/ai/codex-auth-health`

Query params:

- `codexPath`
- `codexHome`
- `includeModelProbe`

Response fields:

- effective `codexPath`
- effective `codexHome`
- `authenticated`
- `requiresOpenaiAuth`
- `loginRequired`
- optional `authUrl`
- optional account fields (`accountEmail`, `planType`, `accountType`)
- optional model count/sample models
- worker instance diagnostics (`siteName`, `instanceId`, `hostname`, `pid`)

Use this endpoint to prove whether auth persisted on the current worker.

### 12.4 `POST /api/ai/chat`

Chat behavior in `codexPath` mode:

1. resolve live request settings first
2. preflight `model/list`
3. if requested model is not in the returned list, switch to the default/current first model
4. run Codex chat with strict JSON output schema
5. if login is required, return an assistant-safe message containing the auth URL
6. if Codex returns a 401 "missing bearer" style error, probe auth and tell the operator to sign in again

This endpoint keeps the same app-level response contract as the API-key path:

```json
{
  "assistantMessage": "string",
  "actions": []
}
```

## 13. Hosted login flow that actually works

This is the exact flow used by the current UI.

1. Admin switches auth mode to `codexPath`.
2. UI derives the effective `codexHome` from the selected profile unless profile is `custom`.
3. UI loads models with query key:
   - `["ai", "codex-models", authMode, codexPath, effectiveCodexHome]`
4. User clicks `Sign in to OpenAI`.
5. Frontend calls `GET /api/ai/codex-models?startLogin=1` with the current draft `codexPath` and `codexHome`.
6. Backend starts a pending login relay session and returns:
   - `authUrl`
   - `pendingLoginId`
   - callback hint text
7. Frontend stores `pendingLoginId` and opens `authUrl` in a new tab.
8. OpenAI login finishes and the browser lands on the localhost callback URL emitted by Codex.
9. If that localhost page fails in the browser, the operator copies the full URL from that tab.
10. Frontend posts that full URL plus `pendingLoginId` to `POST /api/ai/codex-login/complete`.
11. Backend forwards the pasted `code` and `state` to the correct pending listener:
    - directly if the same worker still owns the pending session
    - through shared storage task coordination if a different worker received the completion request
12. Frontend polls model list until login is complete, then auto-saves the working Codex settings.

This is why the pending session id matters. Without it, hosted completion is intentionally rejected.

## 14. Cross-worker relay details

When a login is pending:

- the owning worker keeps an in-memory `pendingCodexLogins` entry
- it also writes a session doc to shared storage
- it starts a remote task pump that polls for matching `codex-login-task` docs every 350ms

When completion hits another worker:

- that worker cannot forward the callback directly to the in-memory session it does not own
- instead it writes a `codex-login-task` doc
- the owning worker sees that task and performs the callback forward locally

Recoverable relay errors are intentionally kept retryable:

- callback HTTP `400`
- timeout waiting for login completion
- missing `code`
- missing `state`

Those errors do not immediately destroy the pending session.

## 15. Auth restoration behavior

There are two persistence layers:

1. filesystem state under `codexHome`
2. shared snapshot state in Cosmos

On startup, before `initialize`, the session tries to restore `${codexHome}/auth.json` from the shared snapshot if the local file is missing or does not contain a refresh token.

After successful auth/model/list/chat, the session persists `auth.json` back to shared storage if it contains a refresh token.

This is what makes auth survive worker changes instead of only worker restarts.

## 16. Frontend behavior that must be preserved

The working UI in `src/pages/AdminAiAssistant.tsx` does all of the following:

- auth mode selector with `apiKey` and `codexPath`
- `codexPath` input
- `codexHomeProfile` selector
- AWS volume root input only when profile is `aws`
- editable `codexHome` only when profile is `custom`
- visible "Codex home used for requests" text
- model picker populated from `/api/ai/codex-models`
- explicit `Sign in to OpenAI` button
- `Refresh model list` button
- `Check auth persistence` button
- login-required status text with clickable `Open login URL`
- pasted localhost callback input shown only when login is required
- `Complete login` disabled unless both callback text and pending login id exist
- auto-save of successful Codex settings after login
- chat requests always send the live draft auth settings

If you skip the live-draft request behavior, you will reproduce the old bug where model list/login works but chat still uses stale saved settings.

## 17. Environment variables used by this implementation

Codex-specific:

- `CODEX_PATH`
- `CODEX_HOME`
- `CODEX_RPC_TIMEOUT_MS` default `45000`
- `CODEX_TURN_TIMEOUT_MS` default `180000`
- `CODEX_LOGIN_TTL_MS` default `600000`
- `CODEX_LOGIN_COMPLETE_TIMEOUT_MS` default `30000`
- `CODEX_LOGIN_HTTP_WAIT_MS` default `12000`
- `CODEX_TIMEOUT_MS` chat-endpoint override; falls back to `OPENAI_TIMEOUT_MS`

OpenAI API-key path:

- `OPENAI_TIMEOUT_MS` default `120000`
- `OPENAI_MAX_TOKENS`

Cosmos:

- `COSMOS_CONNECTION_STRING` or `COSMOS_ENDPOINT` + `COSMOS_KEY`
- `COSMOS_DATABASE` default `ntechr-db`

Runtime detection only:

- Azure: `WEBSITE_SITE_NAME`, `WEBSITE_INSTANCE_ID`, `WEBSITE_HOSTNAME`
- AWS: `AWS_EXECUTION_ENV`, `ECS_CONTAINER_METADATA_URI`, `ECS_CONTAINER_METADATA_URI_V4`, `EKS_CLUSTER_NAME`

## 18. What to change when redeploying to another project

At minimum:

1. Copy the backend session/relay modules and the frontend admin UI pieces together.
2. Add `@openai/codex` to the backend package.
3. Add config schema fields for:
   - `authMode`
   - `codexPath`
   - `codexHome`
   - `codexHomeProfile`
   - `codexAwsVolumeRoot`
   - `hasCodexPath`
   - `clearApiKey`
4. Sanitize secrets in config read responses.
5. Preserve API keys on save unless explicitly cleared.
6. Provide a stable authenticated user ID for all Codex relay/auth-snapshot operations.
7. Provide shared storage for:
   - pending login session docs
   - relay task docs
   - auth snapshot docs
8. Use a persistent writable `codexHome` in hosted deployments.
9. Force file-based Codex credential stores in `${codexHome}/config.toml`.
10. Rename all project-specific `ntechr` path constants.
11. Keep the frontend callback paste flow and pending login id handling.
12. Keep the frontend model-list query key scoped by `authMode`, `codexPath`, and `codexHome`.

## 19. Things to remove from old playbooks

These are out of date for this repo and should not be copied forward:

- guidance that hosted completion should rely on callback-only paste without a pending login id
- guidance that `loginId` should be treated as optional in production UX
- guidance that a global `codex` binary on PATH is enough for hosted deployment
- guidance that filesystem persistence alone is sufficient in multi-worker deployments

## 20. Non-goals and constraints

This implementation intentionally does not do these things:

- allow Codex to run shell commands
- allow Codex to change files
- allow Codex tool calls
- use Codex for image generation
- expose raw API keys to the browser

It is a locked-down, chat-only Codex integration for a CMS admin assistant.

## 21. Redeploy checklist

Use this checklist when recreating the pattern elsewhere:

1. Install `@openai/codex` in the backend package.
2. Add config schema/storage for Codex settings and auth mode.
3. Implement bundled/explicit/PATH launch resolution for Codex.
4. Implement writable `codexHome` resolution plus deployment profiles.
5. Force file-backed credential storage in `config.toml`.
6. Implement auth snapshot restore/persist around `auth.json`.
7. Implement pending login relay with shared session/task docs.
8. Add:
   - `GET /api/ai/codex-models`
   - `POST /api/ai/codex-login/complete`
   - `GET /api/ai/codex-auth-health`
9. Keep chat request resolution order: request -> stored config -> env -> default.
10. Make frontend chat calls send live draft auth settings.
11. Make frontend login flow always start with `startLogin=1` and preserve `pendingLoginId`.
12. Use a persistent `codexHome` location in hosted environments.

If all of the above is present, you will reproduce the working `codexPath` authentication model used in this repo.
