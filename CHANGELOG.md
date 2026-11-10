# Changelog

All notable changes to AAI for CRM. Versions follow [Semantic Versioning](https://semver.org/):
MAJOR for changes that need action from users or admins, MINOR for new features, PATCH for fixes.
The extension and the server share one version number; see "Versioning" in the README.

## [3.1.3] - Unreleased

- **The Enhance/Reply window fits small windows**, like the VinSolutions SMS pop-up: the result text box shrinks instead of the whole window scrolling, so the tweak buttons (Shorter, More formal…) and Copy & Close are always visible. Tighter spacing on short and narrow screens

## [3.1.2] - 2026-11-10

- **Current store setting** for people at several stores: a dropdown in the extension popup and on the settings page (and in the Enhance/Reply window), remembered across sessions. The AI uses that store's details and requests count toward it. People at one store see no dropdown
- Removed automatic store detection from VinSolutions pages, which didn't work in the SMS pop-up, and the VinSolutions name field on the admin Rooftops tab

## [3.1.1] - 2026-11-06

- **Store detection works in the SMS pop-up**: the pop-up doesn't show the dealership, so the main VinSolutions window now reports the dealership in its header to the extension (on load, when you switch dealership, and when that window gets focus), and pop-ups use the most recently reported one

## [3.1.0] - 2026-11-06

- **Store picker for people at several rooftops**: the Enhance/Reply window shows a Store dropdown, preselected from the dealership VinSolutions shows in its header (else the last store used, else "Not sure"). The AI uses that store's name, address and phone, and the request counts 100% toward that store in usage reports. People at a single rooftop see no change
- Admin page: each rooftop has a **VinSolutions name** (the dealership name exactly as VinSolutions shows it) used to recognize the store
- The extension refreshes the user's rooftops every 10 minutes, so admin changes reach the store picker without signing out

## [3.0.0] - 2026-11-06

Requires the AAI for CRM server (in `server/`). Users sign in with an account instead of entering an OpenAI API key.

- **Accounts**: users sign in with an email and password created by an admin; temporary passwords must be changed on first sign-in
- **One server-side OpenAI key**: the key lives only on the server; the extension never sees it. Old API keys saved by 2.x are deleted from the browser on upgrade
- **Rooftops and usage tracking**: every request is logged with its user and rooftops (requests, tokens, estimated cost), with reports and CSV export on the admin page
- **Users can belong to several rooftops**: their requests are split evenly among their active rooftops, so rooftop totals still add up; disabling one rooftop only blocks users with no other active rooftop
- **The AI knows the sender's dealership**: each request tells the model which rooftop(s) the user works at, so it uses that store's name, address and phone (rooftop names should match the store abbreviations in the prompts). With no clear store, it adds no dealership details
- **Admin page** (`/admin`): manage rooftops and users (add, edit, disable, reset password, unlock), choose each user's AI model, edit the Enhance and Reply prompts
- **Prompts moved to the server**: the GitHub Gist prompts are imported once and then edited on the admin page; the daily Gist refresh is gone
- **Models**: GPT-6 Luna (default), GPT-6.1 Terra and GPT-6.1 Sol (replaces GPT-6 Sol), assigned per user by an admin
- Settings page replaced with sign-in, account details, this month's usage and password change; the popup shows who is signed in and their rooftop
- Server can require a minimum extension version (`MIN_EXTENSION_VERSION`) so outdated installs are asked to update
- Fixed: the "Open Settings" button in the in-page setup prompt did nothing (content scripts can't open the options page directly)
- Removed the `alarms` permission and the `api.openai.com` host permission
- Repository reorganized: extension in `extension/`, server in `server/`
- New icon: text lines with an AI sparkle, in the extension's purple (source in `docs/icon.svg`)

## [2.2.0]

- "Copy & Close" now inserts into the right place: replaces the selected text (Enhance) or inserts at the cursor of the last field you typed in (Reply), including in same-origin frames. It no longer pastes into the first text box on the page or wipes rich-text fields, and falls back to clipboard-only when there's no safe target
- Version history in the modal (‹ 1 / 3 ›), with edits kept per version
- Quick tweak chips: Shorter, More formal, Friendlier, Add call-to-action, Spanish
- Character and SMS segment counter
- Keyboard: Esc to close, Ctrl/⌘+Enter to insert, Enter to submit custom instructions, focus stays in the modal, screen-reader dialog labels
- Labeled "Enhance" / "Reply" floating buttons
- Keyboard shortcuts Alt+Shift+E / Alt+Shift+R
- Popup shows this month's usage and your shortcuts (replaces the "Visit Test Page" button)

## [2.1.1]

- Fixed the floating buttons reappearing behind the modal after clicking them, or when selecting text inside the modal

## [2.1.0]

- Switched to GPT-6 Luna (default) with GPT-6 Sol selectable in settings
- Fixed API parameters for GPT-6 (`max_completion_tokens`, `reasoning_effort: "none"`)
- Streaming responses in the modal; closing the modal cancels the request
- API key kept in session storage by default, with an opt-in "remember" setting
- Monthly usage and estimated cost on the settings page
- "Test Connection" now checks access to the selected model without spending tokens

## [1.0.0] - 2024

- Initial release
- Text selection detection and floating button
- OpenAI GPT-4o-mini integration
- Modal UI with regeneration options
- Settings page with API key management
- Daily system prompt refresh
- Comprehensive error handling
