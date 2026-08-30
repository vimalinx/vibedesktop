# Vibe Desktop Embed Companion

This unpacked Manifest V3 extension is loaded only by Vibe Desktop's dedicated Chromium launcher. It is not installed into the user's personal Chrome profile.

For the current Vibe Desktop tab, the background worker creates a session-only rule for `sub_frame` responses. The rule removes frame-blocking response headers so the original website can render inside a desktop window with its own origin, storage, and sign-in state. Closing the desktop tab removes the rule.

Run the dedicated browser with:

```bash
npm run desktop:open
```

The extension has broad host access because frame-blocking headers belong to the target origins. That access is constrained by the dedicated browser profile, the local-only content-script match, the current tab id, the `sub_frame` resource type, and session rules that are not persisted.
