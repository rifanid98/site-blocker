## [0.1.1] - 2026-11-10

### Fixed
- Keyword exceptions now accept IP addresses (IPv4 and IPv6) and `localhost`, not only domains. A keyword inside a dev server address such as `192.168.1.10:3000` no longer blocks it once that IP is added as an exception. An IP matches exactly, on any port, and a domain still covers its subdomains.

### Download
- `SiteBlocker-extension-v0.1.1.zip`: unzip it, turn on Developer mode, and use "Load unpacked". It keeps the fixed extension ID `kpinpjjnhkllnpfpblbobpjbijjeadcd`.

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
