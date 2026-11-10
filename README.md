# SiteBlocker

A self-control website blocker for Windows. A Chromium extension blocks the sites and keywords you list, and a Windows desktop app adds whole-domain blocking and a link that lets the extension shut the PC down. Removing or loosening anything needs a password.

It is built to make your own impulses harder to act on. It is not tamper-proof security (see [Limits](#limits)).

## Page index

1. [What it does](#what-it-does)
2. [How the parts fit together](#how-the-parts-fit-together)
3. [Features](#features)
4. [What needs a password](#what-needs-a-password)
5. [Getting started](#getting-started)
6. [Project layout](#project-layout)
7. [Development](#development)
8. [Limits](#limits)
9. [Status](#status)
10. [Changelog](#changelog)

## What it does

- Blocks websites you list, or only parts of them: for example block `facebook.com` but allow `facebook.com/marketplace`.
- Blocks any web address that contains a keyword you list, including search queries.
- Can shut the PC down, redirect to a page you choose, or show a fake "unlocking" countdown before the block screen appears.
- Lets you replace the block screen with your own HTML and CSS.
- Asks for a password before you can remove a rule or switch a mode off.

[↑ Back to page index](#page-index)

## How the parts fit together

| Part | Technology | Job |
|---|---|---|
| Extension (`extension/`) | Manifest V3, plain JavaScript | Blocks sites and keywords in Chrome, Edge and Brave, and runs the shutdown, redirect, countdown and custom page modes. Has its own options page. |
| Desktop app (`src/SiteBlocker.App`) | C#, .NET 8, WPF | Password-protected list of whole-domain blocks written to the Windows hosts file. Registers the link to the extension. Runs as administrator. |
| Service (`src/SiteBlocker.Service`) | C#, .NET 8 worker | Re-applies the hosts file block every 15 seconds if someone removes it. |
| Native host (`src/SiteBlocker.NativeHost`) | C#, .NET 8 console | The small program the browser starts to talk to the app. It hands the app's rules to the extension, answers connection checks, and runs `shutdown.exe` when the extension asks. |
| Core (`src/SiteBlocker.Core`) | C#, .NET 8 library | Shared logic: rule matching, password hashing, hosts file writer, native messaging, browser policy. |

Path exceptions, keywords and the modes live in the extension, because only a browser can see the full address of an HTTPS page. The desktop app can only block whole domains. Rules made in the app appear read-only in the extension's options page.

[↑ Back to page index](#page-index)

## Features

**Blocking**
- Site rules: "block everything" or "block, with exceptions". An allowed path ending in `*` (for example `/marketplace*`) covers everything below it.
- Single-page apps are handled: in-page navigation is checked, not only full page loads.
- Only top-level page loads are blocked, never images or background requests, so allowed pages keep working.
- Keywords: a case-insensitive "contains" match on the whole address (the `http` or `https` part is ignored). A keyword needs at least 2 characters.
- Keyword exceptions: domains (with their subdomains), IP addresses and `localhost` that are never checked for keywords. An IP address matches exactly, on any port, which lets you keep a dev server like `192.168.1.10:3000` usable when a keyword appears in its address. Site rules still apply to them.

**Modes** (each is a toggle in the options page)
- **Forbidden flag:** mark a site or keyword as forbidden. Shutdown mode only acts on forbidden matches.
- **Shutdown mode:** opening a forbidden site or keyword starts `shutdown /s` after a countdown of 0 to 600 seconds. It never uses `/f`, so apps with unsaved work get a chance to prompt. Only the host name is sent to the app, not the full address. Needs the desktop app to have been run once.
- **Redirect mode:** a blocked page goes to the address you set instead of showing the block screen. The target cannot itself be on the block list.
- **Unlock countdown:** a countdown of 1 to 300 seconds that looks like the site is about to open. When it ends, the real outcome happens. A forbidden match with shutdown mode on skips it and acts at once.
- **Custom blocked page:** your own HTML and CSS, with `{{url}}` and `{{host}}` placeholders and a live preview. Scripts, frames, forms, `<style>` and `<link>` are stripped from the HTML, and only `http(s)` links and images are kept.

**Backup**
- Export your sites, keywords, exceptions and modes to a JSON file. The file has no password and no app rules, and it is plain text.
- Import with "merge" (add what is missing, never remove) or "replace" (make everything match the file). The whole file is checked first, and nothing is saved if any part is invalid.

**Desktop app**
- Password setup on first run, then add, edit and remove whole-domain blocks.
- Writes `0.0.0.0` entries for the domain and its `www.` form inside a marked block in the hosts file, and flushes the DNS cache.
- An optional "Extension protection" panel writes the browser policy that force-installs a published copy of the extension, so it cannot be removed. See [Limits](#limits).

[↑ Back to page index](#page-index)

## What needs a password

Adding things that make blocking stricter is free. Anything that loosens it needs the password you chose.

| Action | Password? |
|---|---|
| Add a site or keyword | No |
| Remove or edit a site, or remove a keyword | Yes |
| Add a keyword exception | Yes |
| Remove a keyword exception | No |
| Mark a keyword forbidden | No |
| Unmark a keyword as forbidden, or change a site's flag | Yes |
| Turn shutdown, redirect or unlock countdown on | No |
| Turn shutdown, redirect or unlock countdown off | Yes |
| Switch the custom page on or off, or edit it | No |
| Export settings | No |
| Import settings | Yes |

The extension and the desktop app each keep their own password.

[↑ Back to page index](#page-index)

## Getting started

You need Windows, the .NET 8 SDK, and Node.js 22 (only to run the extension tests).

1. **Build:** run `dotnet build` in the repository root. Close the desktop app first if it is running.
2. **Start the desktop app** from `src\SiteBlocker.App\bin\Debug\net8.0-windows\SiteBlocker.App.exe`. It asks for administrator rights. Choose a password. It registers the native host for Chrome, Edge and Brave under your user account.
3. **Load the extension:** open `chrome://extensions` (or `edge://extensions`, `brave://extensions`), turn on Developer mode, choose "Load unpacked" and pick the `extension` folder. To use a release instead, unzip `SiteBlocker-extension-v<version>.zip` into a folder you will keep and load that folder.
4. **Open the options page** by clicking the extension's toolbar icon. Choose a password, then add sites and keywords.
5. **Check the link:** in the Shutdown mode section, click "Check connection to the SiteBlocker app". It should say "Connected".

The extension has a fixed ID (`kpinpjjnhkllnpfpblbobpjbijjeadcd`), set by the `key` in `extension/manifest.json`, so the native host registration keeps working when you reload it.

The Windows service is not installed by anything yet. The project builds, but registering it as a service is a manual step.

[↑ Back to page index](#page-index)

## Project layout

```
site-blocker/
├── src/
│   ├── SiteBlocker.Core/        shared logic (rules, hashing, hosts file, policy, messaging)
│   ├── SiteBlocker.App/         WPF desktop app
│   ├── SiteBlocker.Service/     background service that restores the hosts block
│   └── SiteBlocker.NativeHost/  native messaging helper the browser starts
├── tests/SiteBlocker.Core.Tests/  C# unit tests (xUnit)
├── extension/
│   ├── manifest.json
│   ├── src/                     background worker, options page, matcher, store, block page
│   ├── test/                    JavaScript tests (node:test, jsdom)
│   └── pack.ps1                 builds the release zip and the web store zip into dist/
├── nuget.config                 uses nuget.org for this repository only
└── SiteBlocker.sln
```

[↑ Back to page index](#page-index)

## Development

**Tests**

```powershell
dotnet test tests/SiteBlocker.Core.Tests    # C# tests
cd extension
npm install                                 # installs jsdom, used only by the tests
npm test                                    # JavaScript tests
```

The matching rules exist in both languages: `src/SiteBlocker.Core/RuleMatcher.cs` and `extension/src/matcher.js`. Keep the two in sync.

**Packaging**

```powershell
powershell -ExecutionPolicy Bypass -File extension\pack.ps1                  # release zip
powershell -ExecutionPolicy Bypass -File extension\pack.ps1 -Target store    # web store zip
```

- The release zip is `dist/SiteBlocker-extension-v<version>.zip`, where the version comes from `extension/manifest.json`. It is ready to unzip and "Load unpacked", and it contains a short `LOAD-ME.txt`. It keeps the manifest `key`, so the extension ID stays fixed and the Windows app's native host link keeps working. Attach it to a GitHub release.
- The store zip is `dist/siteblocker-store.zip`. It has no `key`, because the store assigns its own extension ID.
- Both zips contain only the manifest and `src/`: no tests and no `node_modules`. `dist/` is ignored by git.
- Raise `version` in `extension/manifest.json` before packaging a new release.

**Things that are easy to trip over**
- The native host the browser starts is the copy next to the desktop app. After changing C# code, close the app and run `dotnet build`, or the browser keeps using an old host. Symptom: "Check connection" says the app "answered, but not as expected".
- Reload the extension in the browser after changing anything under `extension/`.
- The WPF projects need `net8.0-windows`, so build on Windows.

[↑ Back to page index](#page-index)

## Limits

- **Not tamper-proof.** Anyone with Windows administrator rights can edit the hosts file, stop the service or edit the registry. It also cannot stop you using another browser or a VPN or proxy.
- **The extension can be disabled or removed** from the browser's extensions page, unless it is force-installed by policy. Force-install only works for a copy published on the Chrome Web Store (Chrome and Brave) or Edge Add-ons, because Windows PCs that are not joined to a domain refuse force-installs from anywhere else.
- **Chromium only.** Firefox is not supported.
- **Short keywords match a lot.** A keyword like `av` also matches `wave`, `travel` and `avatar`. Use keyword exceptions, or longer keywords.
- **Shutdown can be cancelled** while the countdown runs, by running `shutdown /a`. With a countdown of 0 there is nothing to cancel.
- **Passwords are local.** The password is stored hashed (PBKDF2-SHA256, 200,000 iterations) in each place that needs it. If you forget it, there is no reset.

[↑ Back to page index](#page-index)

## Status

Automated tests pass (136 C# and 184 JavaScript). Tested by hand in a browser: the Facebook plus `/marketplace` exception and the block screen. Not yet tested end to end on a real machine:

- A real shutdown triggered by a forbidden site or keyword.
- The force-install browser policy, which needs a published store copy.
- Running the service as a Windows service.

There is no installer. There is no licence file yet.

[↑ Back to page index](#page-index)

## Changelog

| Date | Change |
|---|---|
| 2026-11-10 | Keyword exceptions now accept IP addresses and `localhost`, not only domains. |
| 2026-11-09 | Packaging: `pack-for-store.ps1` replaced by `pack.ps1`, which builds the release zip and the store zip. Getting started mentions loading the release zip. |
| 2026-11-09 | First version of the README. |

[↑ Back to page index](#page-index)
