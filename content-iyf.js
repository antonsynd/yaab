(function () {
  "use strict";

  const AD_VOLUME = 0.05;

  // --- 1. Defeat ad-blocker detection ---
  Object.defineProperty(window, "isAdsBlocked", {
    get() { return false; },
    set() {},
    configurable: false,
  });

  // --- 2. Intercept invokePauseAds events (pause-screen ad delivery) ---
  const origDispatchEvent = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (event) {
    if (event && event.type === "invokePauseAds") {
      return true;
    }
    return origDispatchEvent.call(this, event);
  };

  // --- 3. Block GG banner ad service responses ---
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._yaab_url = url;
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this._yaab_url && typeof this._yaab_url === "string" && /\/play\/o\b/.test(this._yaab_url)) {
      Object.defineProperty(this, "readyState", { get: () => 4 });
      Object.defineProperty(this, "status", { get: () => 200 });
      const emptyResp = JSON.stringify({ data: [], systime: "/Date(" + Date.now() + ")/", country: "GL" });
      Object.defineProperty(this, "responseText", { get: () => emptyResp });
      Object.defineProperty(this, "response", { get: () => emptyResp });
      setTimeout(() => {
        if (typeof this.onreadystatechange === "function") this.onreadystatechange();
        if (typeof this.onload === "function") this.onload();
      }, 0);
      return;
    }
    return origXHRSend.apply(this, arguments);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/\/play\/o\b/.test(url)) {
      return Promise.resolve(new Response(
        JSON.stringify({ data: [], systime: "/Date(" + Date.now() + ")/", country: "GL" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ));
    }
    if (/googlesyndication\.com|adsbygoogle/i.test(url)) {
      return Promise.resolve(new Response("", { status: 200 }));
    }
    return origFetch.apply(this, arguments);
  };

  // --- 4. CSS: hide ad overlays, countdowns, banners ---
  const style = document.createElement("style");
  style.textContent = `
    [class*="gg-banner"], [class*="gg-container"], [class*="gg-block"],
    [class*="ad-overlay"], [class*="ad-container"], [class*="ad-banner"],
    [class*="video-ads"],
    [class*="ads-countdown"], [class*="ads-skip"], [class*="ads-overlay"],
    [class*="skip-ad"], [class*="ad-timer"],
    .vg-vvk-p,
    .publicbox,
    .publicplay {
      display: none !important;
    }
    vg-player.is-playing-ads .caption {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // --- 5. Patch the PGMP scheduler and Angular player component ---
  function neuterPgmp(pgmp) {
    if (!pgmp || pgmp._yaab_neutered) return;
    pgmp._yaab_neutered = true;
    try { pgmp.stopPlay(); } catch (_) {}
    try { pgmp.cancel(); } catch (_) {}
    try { pgmp.reset(); } catch (_) {}
    pgmp.invokeList = () => {};
    pgmp.needToShow = () => {};
    pgmp.startCountDown = () => {};
    pgmp.startPlay = () => {};
    pgmp.startLoadCounter = () => {};
    pgmp.play = () => {};
    pgmp.renew = () => {};
    pgmp.continue = () => {};
    pgmp.getTimeDefine = () => {};
  }

  function pinProperty(obj, prop, value) {
    try {
      Object.defineProperty(obj, prop, {
        get() { return value; },
        set() {},
        configurable: true,
      });
    } catch (_) {
      obj[prop] = value;
    }
  }

  function patchPlayerComponent(comp) {
    if (!comp || comp._yaab_patched) return false;
    comp._yaab_patched = true;

    if (comp.pgmp) neuterPgmp(comp.pgmp);

    pinProperty(comp, "shouldSkipAds", true);
    pinProperty(comp, "isUserFilterAd", true);
    comp.isPlayingAds = false;

    if ("pendding" in comp) comp.pendding = null;
    if ("pauseList" in comp) {
      try { comp.pauseList = []; } catch (_) {}
    }

    comp.invokeInterstitial = function () {};
    comp.listenToIntersitial = function () {};
    comp.showAds = function () {};
    comp.triggerCounter = function () {};

    if (comp.api) patchApiObject(comp.api);

    return true;
  }

  function patchApiObject(api) {
    if (!api || api._yaab_patched) return;
    api._yaab_patched = true;
    api.isPlayingAds = false;
    pinProperty(api, "canViewPublic", true);
    api.intersitialHandler = function () {};
    api.triggerPlayAds = function () {};
  }

  function scanAngularContexts() {
    let found = false;
    const selectors = ["aa-videoplayer", "app-root", "app-video", "vg-player", "app-play"];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const ctx = el.__ngContext__;
        if (!ctx) continue;

        const items = Array.isArray(ctx) ? ctx : [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item || typeof item !== "object") continue;

          if ("pgmp" in item && "isPlayingAds" in item) {
            if (patchPlayerComponent(item)) found = true;
          } else if ("pgmp" in item) {
            neuterPgmp(item.pgmp);
          }

          if ("canViewPublic" in item) {
            item.canViewPublic = true;
          }

          if ("isPlayingAds" in item && "api" in item) {
            item.isPlayingAds = false;
            if (item.api) patchApiObject(item.api);
          }
        }
      }
    }

    // Fallback: scan all elements with __ngContext__ if not found via selectors
    if (!found) {
      const allEls = document.querySelectorAll("*");
      for (const el of allEls) {
        const ctx = el.__ngContext__;
        if (!ctx || !Array.isArray(ctx)) continue;
        for (let i = 0; i < ctx.length; i++) {
          const item = ctx[i];
          if (!item || typeof item !== "object") continue;
          if ("pgmp" in item && "isPlayingAds" in item) {
            if (patchPlayerComponent(item)) found = true;
            break;
          }
        }
        if (found) break;
      }
    }
    return found;
  }

  // --- 6. Video element monitoring (fallback if ads slip through) ---
  let savedVolume = null;
  let adVideoActive = false;

  function getActiveVideo() {
    const videos = document.querySelectorAll("video");
    for (const v of videos) {
      if (v.src || v.currentSrc) return v;
    }
    return videos[0] || null;
  }

  function findPlayerComponent() {
    const selectors = ["aa-videoplayer", "app-root", "app-video", "vg-player", "app-play"];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const ctx = el.__ngContext__;
        if (!ctx || !Array.isArray(ctx)) continue;
        for (let i = 0; i < ctx.length; i++) {
          const item = ctx[i];
          if (item && typeof item === "object" && "isPlayingAds" in item && "pgmp" in item) {
            return item;
          }
        }
      }
    }
    return null;
  }

  function muteForAd(video) {
    if (!adVideoActive) {
      savedVolume = video.volume;
      adVideoActive = true;
    }
    video.volume = AD_VOLUME;
    try { video.playbackRate = 16; } catch (_) {
      try { video.playbackRate = 8; } catch (_2) {}
    }
  }

  function restoreFromAd(video) {
    if (!adVideoActive) return;
    adVideoActive = false;
    if (savedVolume !== null) {
      video.volume = savedVolume;
      savedVolume = null;
    }
    video.playbackRate = 1;
  }

  function watchAdState() {
    let wasPlaying = false;

    setInterval(() => {
      const comp = findPlayerComponent();
      const video = getActiveVideo();
      if (!video) return;

      const isAd = comp ? comp.isPlayingAds : false;

      if (isAd && !wasPlaying) {
        wasPlaying = true;
        muteForAd(video);
      } else if (!isAd && wasPlaying) {
        wasPlaying = false;
        restoreFromAd(video);
      } else if (isAd && adVideoActive) {
        if (video.volume > AD_VOLUME) video.volume = AD_VOLUME;
        if (video.playbackRate < 2) {
          try { video.playbackRate = 16; } catch (_) {}
        }
      }
    }, 200);
  }

  // --- 7. Main initialization loop ---
  const onReady = () => {
    let patchDone = false;
    let attempts = 0;
    const maxAttempts = 200;

    const patchInterval = setInterval(() => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(patchInterval);
        return;
      }

      if (!patchDone) {
        patchDone = scanAngularContexts();
        if (patchDone) watchAdState();
      } else {
        scanAngularContexts();
      }
    }, 300);
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    onReady();
  } else {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  }
})();
