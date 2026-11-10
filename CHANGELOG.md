## [0.3.1] - 2026-11-10

Tightens how forbidden sites and keywords are hidden in settings.

### Changed
- Revealing forbidden sites or keywords now needs your password. Hiding them again is free, and each list reveals on its own.
- Editing a blurred site asks for your password first, then shows it in the form. Hiding the sites list clears the form.
- Password prompts and messages for forbidden entries no longer spell out the site or keyword ("this keyword", "this site").

### Fixed
- A keyword stayed blurred after you unflagged it, until you reveal its list, so unflagging no longer shows the word it was hiding.

### Download
- `SiteBlocker-extension-v0.3.1.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`, so an existing install and the Windows app link keep working.
- The Windows app is unchanged since v0.3.0, so you do not need to rebuild it.

[0.3.1]: https://github.com/rifanid98/site-blocker/compare/v0.3.0...v0.3.1

## [0.3.0] - 2026-11-10

Adds focus mode, a Cancel button for keyword-triggered shutdowns, and a quick way to skip keyword blocking on a site you trust.

### Added
- Focus mode with weekly schedules, one-time ranges and one-click Start from a new toolbar popup, with day shortcuts and date and time pickers.
- Three-way blocking setting (always, only during focus mode, off). Looser changes need the password.
- A Cancel shutdown button on the block screen when a forbidden keyword (not a forbidden site) starts the countdown. A forbidden site still shuts down at once, and `shutdown /a` still works.
- A toolbar popup toggle to skip keyword blocking on the current site. Turning it on needs the password, turning it off does not.
- Forbidden sites and keywords are blurred in settings until revealed. Each list has its own Reveal button.
- Native host request `cancelShutdown`, which runs `shutdown /a`.

### Changed
- Blocking applies only while it is active, and open tabs are checked when focus mode starts.
- Settings export and import include focus settings.
- Keyword-triggered shutdowns count down on the block screen, and Windows is asked only when the countdown ends.

### Download
- `SiteBlocker-extension-v0.3.0.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`, so an existing install and the Windows app link keep working.
- The Windows app changed since v0.1.1 (cancel support in the native host), so rebuild it to use the Cancel button.

[0.3.0]: https://github.com/rifanid98/site-blocker/compare/v0.1.1...v0.3.0

## [0.2.0] - 2026-11-10

Adds focus mode: choose when your rules apply, and start it with one click from the toolbar.

### Added
- Three blocking settings: "On, always" (the default), "On, only during focus mode" and "Off". Moving to a looser setting needs the password.
- Focus mode, started from the toolbar popup with one click (it stays on until ended with the password), on a weekly schedule, or for a one-time time range.
- Toolbar popup to switch between Always on, Focus mode and Off, and to start or end focus mode.
- Day buttons Monday to Sunday with Weekdays, Weekend, Every day and Clear shortcuts, and date and time pickers for one-time ranges.
- Settings export and import include the focus mode setup. Merge keeps the stricter blocking setting.
- Pages that are already open are checked when focus mode starts.

### Changed
- The toolbar icon now opens the focus mode popup instead of the options page.

### Download
- `SiteBlocker-extension-v0.2.0.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`, so an existing install and the Windows app link keep working.
- The Windows app is unchanged, so you do not need to rebuild it.


## [0.1.1] - 2026-11-10

Fixes a limitation in keyword exceptions: you can now add an IP address or `localhost`, not only a domain.

### Fixed
- Keyword exceptions now accept IP addresses (IPv4 and IPv6) and `localhost`, not only domains. A keyword inside a dev server address such as `192.168.1.10:3000` no longer blocks it once that IP is added as an exception.
- An IP address matches exactly, on any port, so `10.0.0.1` never exempts `110.0.0.1`. A domain still covers its subdomains.
- IP and `localhost` exceptions are included in settings export and import.

### Download
- `SiteBlocker-extension-v0.1.1.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`, so an existing install and the Windows app link keep working.
- The Windows app is unchanged since v0.1.0, so you do not need to rebuild it.

## [0.1.0] - 2026-11-09

First release of SiteBlocker, a self-control website blocker for Windows. A Chromium extension blocks the sites and keywords you list. A Windows desktop app adds whole-domain blocking and lets the extension shut the PC down. Removing or loosening anything needs a password.

### Extension (Chrome, Edge, Brave)
- Block sites completely, or block with exceptions, for example block `facebook.com` but allow `facebook.com/marketplace*`. In-page navigation in single-page apps is checked too.
- Block any web address that contains a keyword, including search queries. Keyword exceptions skip chosen domains and their subdomains.
- Mark sites and keywords as **forbidden**. With **shutdown mode** on, opening one starts `shutdown /s` after a 0 to 600 second countdown (0 is immediate). Apps with unsaved work are never force-closed.
- **Redirect mode**: send blocked pages to an address you choose.
- **Unlock countdown**: a 1 to 300 second "unlocking" screen before the real outcome. Forbidden matches skip it while shutdown mode is on.
- **Custom blocked page**: your own HTML and CSS with `{{url}}` and `{{host}}` placeholders and a live preview. Scripts, frames, forms and external styles are stripped from your HTML.
- **Export and import** settings as JSON, with merge or replace. Import needs your password.
- Password gate: adding is free, while removing, editing or switching a mode off needs the password.

### Windows app
- Password-protected whole-domain blocks in the hosts file, with a background service that restores them if they are edited.
- A native messaging helper links the app to the extension. It registers for Chrome, Edge and Brave and runs the shutdown.
- Optional "Extension protection" panel that writes the browser force-install policy for a published copy of the extension.

### Download
- `SiteBlocker-extension-v0.1.0.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`.
- The desktop app is built from source for now (`dotnet build`). There is no installer yet.

### Limits
- Not tamper-proof: anyone with Windows administrator rights can bypass it, and the extension can be removed from the browser unless it is force-installed from a store listing.
- Chromium browsers only. Firefox is not supported.
- Not yet tested end to end on a real machine: a real shutdown from a forbidden site or keyword, the force-install policy, and running the service as a Windows service.

[0.1.1]: https://github.com/rifanid98/site-blocker/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rifanid98/site-blocker/releases/tag/v0.1.0
