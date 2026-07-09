(function () {
  "use strict";

  // Neuter the dmAds bootstrap before any script runs
  Object.defineProperty(window, "dmAds", {
    get() { return this._dmAds; },
    set(v) {
      this._dmAds = new Proxy(v, {
        set(target, prop, value) {
          target[prop] = value;
          return true;
        }
      });
    },
    configurable: true,
  });

  // Defeat ad-blocker detection: ad containers must report non-zero dimensions
  const origGetClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
  if (origGetClientHeight) {
    Object.defineProperty(Element.prototype, "clientHeight", {
      get() {
        const val = origGetClientHeight.get.call(this);
        if (val === 0 && isDMAdElement(this)) return 1;
        return val;
      },
      configurable: true,
    });
  }

  const origGetInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (origGetInnerHTML) {
    Object.defineProperty(Element.prototype, "innerHTML", {
      get() {
        const val = origGetInnerHTML.get.call(this);
        if (val === "" && isDMAdElement(this)) return " ";
        return val;
      },
      set(v) { origGetInnerHTML.set.call(this, v); },
      configurable: true,
    });
  }

  function isDMAdElement(el) {
    if (!el || !el.className) return false;
    const cls = typeof el.className === "string" ? el.className : "";
    return /display.?ad|ad.?container|ad.?slot|ad.?banner|DisplayAd|AdBanner|StickyFooter/i.test(cls) ||
           /display.?ad|ad.?container|ad.?slot|ad.?banner/i.test(el.id || "");
  }

  // Prevent the localStorage flag that remembers ad-blocker detection
  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (typeof key === "string" && /adblock/i.test(key)) return;
    return origSetItem.call(this, key, value);
  };
  const origGetItem = Storage.prototype.getItem;
  Storage.prototype.getItem = function (key) {
    if (typeof key === "string" && /adblock/i.test(key)) return null;
    return origGetItem.call(this, key);
  };

  // CSS: hide ad-blocker popup and display ad overlays
  const style = document.createElement("style");
  style.textContent = `
    [class*="AdBlockerPopup"], [class*="adBlocker"] { display: none !important; }
    body[class*="noScroll"], body[class*="AdBlockerPopup"] { overflow: auto !important; }
    [class*="DisplayAd__ad"], [class*="StickyFooterDisplayAd"],
    [class*="AdBannerDisplayAd"], [class*="MobileAds__displayAd"] { display: none !important; }
  `;
  (document.head || document.documentElement).appendChild(style);

  // Intercept the Dailymotion player to skip ad events
  function patchPlayer() {
    if (!window.dailymotion) return;
    const origCreatePlayer = window.dailymotion.createPlayer;
    if (!origCreatePlayer) return;
    window.dailymotion.createPlayer = async function (...args) {
      const player = await origCreatePlayer.apply(this, args);
      const origOn = player.on?.bind(player);
      if (origOn) {
        origOn("ad_start", () => { try { player.play?.(); } catch (_) {} });
        origOn("ad_play", () => { try { player.play?.(); } catch (_) {} });
      }
      return player;
    };
  }

  if (window.dailymotion) patchPlayer();
  document.addEventListener("DOMContentLoaded", patchPlayer, { once: true });

  // MutationObserver to remove ad-blocker popups injected late
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const cls = node.className || "";
        if (typeof cls === "string" && /AdBlockerPopup|adBlocker/i.test(cls)) {
          node.remove();
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  }
})();
