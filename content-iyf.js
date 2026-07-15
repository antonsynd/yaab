(function () {
  "use strict";

  // --- 1. Defeat ad-blocker detection ---
  // IYF's prebid-ads.js sets window.isAdsBlocked = true if googlesyndication fetch fails.
  // The shared script already stubs the fetch to succeed, but we also pin the flag directly.
  Object.defineProperty(window, "isAdsBlocked", {
    get() { return false; },
    set() {},
    configurable: true,
  });

  // --- 2. Intercept the interstitial ad scheduler ---
  // The ad scheduler uses RxJS interval to periodically trigger interstitial video ads.
  // It has startSecond/everySecond timers and isPlayingAds state.
  // We patch the CustomEvent dispatch that signals ad start/end to the player.
  const origDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (event && event.type === "startads") {
      // Suppress the VG_START_ADS event; immediately fire endads instead
      const endEvent = new CustomEvent("endads");
      return origDispatchEvent.call(this, endEvent);
    }
    return origDispatchEvent.call(this, event);
  };

  // --- 3. Patch the media list to skip ad entries ---
  // IYF builds a mediaList where each item has isAd:true/false.
  // The player's playVideo() checks isAd to decide if it should show ads.
  // We intercept Array.prototype.filter to strip ad items when the player iterates.
  const origFilter = Array.prototype.filter;
  Array.prototype.filter = function (callback, thisArg) {
    const result = origFilter.call(this, callback, thisArg);
    // If this looks like a media list filter and contains ad items, strip them
    if (this.length > 0 && this[0] && typeof this[0] === "object" && "isAd" in this[0]) {
      return origFilter.call(this, function (item) {
        // Keep non-ad items, mark ad items as played
        if (item.isAd) {
          item.isplayed = true;
          return false;
        }
        return callback.call(thisArg, item, arguments[1], arguments[2]);
      });
    }
    return result;
  };

  // --- 4. Block the GG (广告) banner ad service response ---
  // The ggService fetches ad banners from ppt.{host}/play/o and injects them by position
  // codes (PB, PRU, PRD, SS, DL, H4, etc). We intercept XMLHttpRequest to return empty
  // ad data for these requests.
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._vab_url = url;
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this._vab_url && typeof this._vab_url === "string" && /\/play\/o\b/.test(this._vab_url)) {
      // Return empty ad data so no banners render
      Object.defineProperty(this, "readyState", { get: () => 4 });
      Object.defineProperty(this, "status", { get: () => 200 });
      Object.defineProperty(this, "responseText", {
        get: () => JSON.stringify({ data: [], systime: "/Date(" + Date.now() + ")/", country: "GL" })
      });
      Object.defineProperty(this, "response", {
        get: () => JSON.stringify({ data: [], systime: "/Date(" + Date.now() + ")/", country: "GL" })
      });
      setTimeout(() => {
        if (typeof this.onreadystatechange === "function") this.onreadystatechange();
        if (typeof this.onload === "function") this.onload();
      }, 0);
      return;
    }
    return origXHRSend.apply(this, arguments);
  };

  // Also intercept fetch for the same endpoint
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/\/play\/o\b/.test(url)) {
      return Promise.resolve(new Response(
        JSON.stringify({ data: [], systime: "/Date(" + Date.now() + ")/", country: "GL" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ));
    }
    // googlesyndication stub is already in shared, but call through
    if (/googlesyndication\.com|adsbygoogle/i.test(url)) {
      return Promise.resolve(new Response("", { status: 200 }));
    }
    return origFetch.apply(this, arguments);
  };

  // --- 5. CSS: hide any ad overlays and banners ---
  const style = document.createElement("style");
  style.textContent = `
    /* GG banner ad containers by position code */
    [class*="gg-banner"], [class*="gg-container"], [class*="gg-block"],
    [class*="ad-overlay"], [class*="ad-container"], [class*="ad-banner"],
    [class*="interstitial"], [class*="video-ads"],
    /* Ad countdown/skip UI overlays on the player */
    [class*="ads-countdown"], [class*="ads-skip"], [class*="ads-overlay"],
    [class*="skip-ad"], [class*="ad-timer"] {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // --- 6. Neuter the interstitial ad scheduler and ensure canViewPublic ---
  // The app has an RxJS-based interstitial scheduler that periodically triggers
  // ad breaks with a countdown timer (waitSecond) + load counter (maxSecond).
  // We find it in Angular's component context and disable it entirely.
  // We also pin canViewPublic=true (set by testPublic() based on isAdsBlocked).
  const onReady = () => {
    let schedulerDone = false;
    let attempts = 0;

    const patchInterval = setInterval(() => {
      attempts++;
      if (attempts > 120) { clearInterval(patchInterval); return; }

      const selectors = ["app-root", "app-video", "vg-player"];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const ctx = el.__ngContext__;
          if (!ctx || !Array.isArray(ctx)) continue;

          for (let i = 0; i < ctx.length; i++) {
            const item = ctx[i];
            if (!item || typeof item !== "object") continue;

            if ("canViewPublic" in item && !item.canViewPublic) {
              item.canViewPublic = true;
            }

            if (!schedulerDone &&
                "maxSecond" in item && "waitSecond" in item &&
                "dataEvent" in item && typeof item.play === "function") {
              try {
                if (item.globalsubscript) item.globalsubscript.unsubscribe();
              } catch (_) {}
              try {
                if (item.subscript) item.subscript.unsubscribe();
              } catch (_) {}
              item.globalsubscript = null;
              item.subscript = null;
              item.play = () => {};
              item.startPlay = () => {};
              item.startLoadCounter = () => {};
              item.startCountDown = () => {};
              item.invokeList = () => {};
              schedulerDone = true;
            }

            if ("isPlayingAds" in item && "mediaList" in item && "loadingMedia" in item) {
              if (item.isPlayingAds) item.isPlayingAds = false;
              if (item.component && item.component.isPlayingAds) {
                item.component.isPlayingAds = false;
              }
            }
          }
        }
      }

      if (schedulerDone) clearInterval(patchInterval);
    }, 300);
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
