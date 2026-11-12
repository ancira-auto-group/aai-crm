# AAI for CRM

A Chrome extension that improves and drafts messages on **VinSolutions CRM** pages with AI. Select text, click **Enhance** or **Reply**, and get a suggestion that you can tweak, regenerate and insert back into the CRM.

Users sign in with an account their administrator creates. The OpenAI key, AI instructions (prompts) and usage tracking all live on a small server, so admins can see usage by **rooftop** and by **user**.

```
extension/   Chrome extension (Manifest V3, plain JavaScript, no build step)
server/      Accounts, admin page, usage tracking and OpenAI relay (Next.js on Vercel + Neon Postgres)
docs/        Prompt-writing guide, sample prompt, screenshots
scripts/     Repository tooling (version check)
```

## For users

1. Install the extension. Your administrator gives you the package, or for testing: `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → choose the `extension` folder.
2. Click the extension icon → **Sign In**, and sign in with the email and temporary password from your administrator.
3. Choose a new password when asked.
4. On a VinSolutions page, select at least 10 characters of text and click **Enhance** (improve your own text) or **Reply** (draft an answer to a customer's message). Shortcuts: **Alt+Shift+E** and **Alt+Shift+R**.
5. Tweak the result with **Mix It Up**, the quick tone buttons, or **Add Some Flair**, then **Copy & Close** (Ctrl/⌘+Enter) to put it back in the CRM.

Phone numbers, email addresses and Social Security numbers are replaced with placeholders before text leaves the browser.

Forgot your password? Ask your administrator to reset it.

## For administrators

Open the admin page at [aai-crm.ancira.app/admin](https://aai-crm.ancira.app/admin) and sign in with an admin account.

| Tab | What it's for |
|---|---|
| **Usage** | Requests, active users, tokens and estimated cost for any date range, broken down by rooftop and by user. Click a rooftop to filter the users. Export either table to CSV. |
| **Users** | Add users (they get a temporary password to change on first sign-in), assign each to one or more rooftops and an AI model, reset passwords, unlock accounts after too many failed sign-ins, disable or re-enable access. |
| **Rooftops** | Add, rename, disable or re-enable rooftops. Disabling one blocks users who have no other active rooftop. |
| **Prompts** | Edit the instructions the AI follows for Enhance and Reply. Changes apply to everyone within about a minute. The server adds a line naming the sender's rooftop(s), so a store directory in the prompt keyed by rooftop name (e.g. `AWC: Ancira-Winton Chevrolet, 6111 Bandera Rd…`) lets the AI use the right address and phone. See [docs/writing-prompts.md](docs/writing-prompts.md). |
| **Feedback** | Developers only (admins with **Developer** ticked on the Users tab). Notes people send with the feedback button in the Enhance/Reply window, with who, when, store, and optionally the message and AI suggestion. Mark items read or resolved. |

People at several rooftops get a **Current store** dropdown in the extension popup and settings page (also shown in the Enhance/Reply window). Their choice is remembered; the AI uses that store's details and the request counts fully toward it. Until they pick one, requests are split as described below.

Each request is recorded with the rooftops the user belonged to at the time, so moving someone to another rooftop doesn't rewrite past reports. Requests from someone assigned to several rooftops are split evenly among their active rooftops (two rooftops: half the request, tokens and cost each), so rooftop totals always add up to the overall total and can show fractions. Users and rooftops are disabled rather than deleted, so their usage history stays intact.

### AI models

| Model | Price per 1M tokens (input / output) | Use |
|---|---|---|
| GPT-6 Luna | $0.10 / $0.50 | Default. Fast and very cheap; fine for most CRM messages |
| GPT-6.1 Terra | $1.00 / $5.00 | Better writing for about 10× Luna's cost |
| GPT-6.1 Sol | $2.00 / $10.00 | Highest quality |

A typical message costs well under a cent even on Sol. Costs on the admin page are estimates from list prices; your OpenAI billing dashboard has the exact amounts. Prices are set in `server/lib/models.js`.

## For developers

- **Server**: setup, deployment, environment variables and local development are in [server/README.md](server/README.md).
- **Extension**: edit files in `extension/`, then click the reload icon on `chrome://extensions` and refresh the CRM tab. To use a local or test server, open the extension settings → **Advanced** → **Server URL**. The production URL is `AAI_DEFAULT_SERVER_URL` in `extension/config.js`.
- **Debugging**: the content script logs to the page's console; the background worker has an **Inspect views: service worker** link on `chrome://extensions`.

### Versioning

The extension and the server share one version number in `MAJOR.MINOR.PATCH` form ([Semantic Versioning](https://semver.org/)):

- **MAJOR**: users or admins must do something (e.g. 3.0.0 replaced API keys with accounts)
- **MINOR**: new features
- **PATCH**: bug fixes

`extension/manifest.json` is the source of truth. To release:

1. Set the same version in `extension/manifest.json` and `server/package.json`.
2. Add a `## [X.Y.Z] - YYYY-MM-DD` section at the top of [CHANGELOG.md](CHANGELOG.md).
3. Run `node scripts/check-version.mjs` (CI runs it on every push and pull request).
4. After merging, tag the release `vX.Y.Z` and push the tag. CI then builds the extension zip as a downloadable artifact.

The extension shows its version on the settings page and in the popup, and sends it to the server with every request. When an old extension must stop working (e.g. after a breaking API change), set `MIN_EXTENSION_VERSION` on the server and users of older versions are asked to update.

See [CHANGELOG.md](CHANGELOG.md) for the release history.
