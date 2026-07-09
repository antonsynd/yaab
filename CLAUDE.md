# CLAUDE.md

## Project overview

YAAB (Yet Another Ad Blocker) is a Chrome Manifest V3 extension that blocks in-video and display ads on specific streaming sites. It uses a combination of declarativeNetRequest rules (network-level blocking) and content scripts (JS patching / DOM manipulation).

## Supported sites

- **Dailymotion** (`dailymotion.com`) — VAST/IMA SDK video ads, Prebid header bidding, Google Publisher Tags display ads
- **IYF.tv** (`iyf.tv`, `kubb.tv`, `yfsp.tv`, `yifan.tv`, `hlive.io`) — Interstitial video ads via RxJS scheduler, GG banner system, googlesyndication-based ad-blocker detection

## Architecture

```
manifest.json          — MV3 manifest, declarativeNetRequest + content_scripts
rules.json             — Network-level blocking rules (IDs 1-13: Dailymotion, 100+: IYF)
content-shared.js      — Runs on all sites: Google IMA SDK stub, GPT stub, fetch interception
content-dailymotion.js — Dailymotion-specific: dmAds proxy, ad-blocker detection defeat, player patching
content-iyf.js         — IYF-specific: isAdsBlocked pin, interstitial skip, GG API interception, Angular patch
icon48.png / icon128.png
```

## Key patterns

- Content scripts run at `document_start` to define stubs before site JS loads
- Ad-blocker detection is defeated at multiple layers: fetch stubs, DOM property patches, localStorage interception, flag pinning
- IYF uses `window.isAdsBlocked` (set by fetching googlesyndication); Dailymotion checks ad container `clientHeight`/`innerHTML`
- Network rules use `declarativeNetRequest` (service-worker-free, no background script needed)

## Adding a new site

1. Download the site's JS/HTML files from Chrome DevTools
2. Grep for ad lifecycle events (`adStart`, `adPlay`, `ad_start`, `VAST`, `prebid`, `googletag`, `isAdsBlocked`, etc.)
3. Identify: ad SDK (IMA/VAST/custom), ad-blocker detection method, ad scheduling mechanism
4. Add network rules to `rules.json` (use IDs in a new 200+ range)
5. Create `content-{site}.js` with site-specific patches
6. Add to `manifest.json`: `host_permissions` and `content_scripts` entry
7. Test with the extension loaded unpacked in Chrome

## Development

- Load unpacked at `chrome://extensions/` with Developer Mode enabled
- After editing, click the reload button on the extension card
- Use Chrome DevTools Network tab to verify blocked requests
- Use Console to verify stubs are in place (`window.google.ima`, `window.googletag`, `window.isAdsBlocked`)
