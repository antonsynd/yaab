(function () {
  "use strict";

  // Stub Google Publisher Tags (used by both Dailymotion and IYF for display ads)
  const noopFn = () => {};
  window.googletag = window.googletag || {};
  window.googletag.cmd = window.googletag.cmd || [];
  window.googletag.defineSlot = () => ({
    addService: () => ({ addService: noopFn, defineSizeMapping: noopFn, setTargeting: noopFn }),
    defineSizeMapping: noopFn,
    setTargeting: noopFn,
    get: noopFn,
  });
  window.googletag.enableServices = noopFn;
  window.googletag.display = noopFn;
  window.googletag.pubads = () => ({
    addEventListener: noopFn,
    clear: noopFn,
    clearTargeting: noopFn,
    disableInitialLoad: noopFn,
    display: noopFn,
    enableSingleRequest: noopFn,
    enableVideoAds: noopFn,
    get: noopFn,
    getSlots: () => [],
    getTargeting: () => [],
    getTargetingKeys: () => [],
    refresh: noopFn,
    set: noopFn,
    setCentering: noopFn,
    setPrivacySettings: noopFn,
    setRequestNonPersonalizedAds: noopFn,
    setTargeting: noopFn,
    updateCorrelator: noopFn,
  });
  window.googletag.companionAds = () => ({ setRefreshUnfilledSlots: noopFn });
  window.googletag.sizeMapping = () => ({ addSize: function () { return this; }, build: () => [] });
  window.googletag.apiReady = true;

  // Stub Google IMA SDK (used by Dailymotion for VAST, referenced by some IYF player code)
  const fakeAdsManager = {
    addEventListener: noopFn,
    destroy: noopFn,
    getCuePoints: () => [],
    getVolume: () => 1,
    init: noopFn,
    isCustomClickTrackingUsed: () => false,
    isCustomPlaybackUsed: () => false,
    pause: noopFn,
    resize: noopFn,
    resume: noopFn,
    setVolume: noopFn,
    skip: noopFn,
    start: noopFn,
    stop: noopFn,
    updateAdsRenderingSettings: noopFn,
    dispatchEvent: noopFn,
    getRemainingTime: () => 0,
  };
  const fakeAdsManagerLoadedEvent = { getAdsManager: () => fakeAdsManager };
  const fakeAdsLoader = {
    addEventListener(event, callback) {
      if (event === "ADS_MANAGER_LOADED" || event === "adsManagerLoaded") {
        setTimeout(() => callback(fakeAdsManagerLoadedEvent), 0);
      }
    },
    contentComplete: noopFn,
    destroy: noopFn,
    getSettings: () => ({}),
    requestAds: noopFn,
  };

  const google = window.google || {};
  google.ima = {
    AdDisplayContainer: class { constructor() {} initialize() {} destroy() {} },
    AdError: { Type: { AD_ERROR: "adError" }, ErrorCode: {} },
    AdErrorEvent: { Type: { AD_ERROR: "adError" } },
    AdEvent: {
      Type: {
        AD_BREAK_READY: "adBreakReady", AD_BUFFERING: "adBuffering",
        AD_CAN_PLAY: "adCanPlay", AD_METADATA: "adMetadata",
        AD_PROGRESS: "adProgress", ALL_ADS_COMPLETED: "allAdsCompleted",
        CLICK: "click", COMPLETE: "complete",
        CONTENT_PAUSE_REQUESTED: "contentPauseRequested",
        CONTENT_RESUME_REQUESTED: "contentResumeRequested",
        DURATION_CHANGE: "durationChange", FIRST_QUARTILE: "firstQuartile",
        IMPRESSION: "impression", INTERACTION: "interaction",
        LINEAR_CHANGED: "linearChanged", LOADED: "loaded", LOG: "log",
        MIDPOINT: "midpoint", PAUSED: "paused", RESUMED: "resumed",
        SKIPPABLE_STATE_CHANGED: "skippableStateChanged", SKIPPED: "skipped",
        STARTED: "started", THIRD_QUARTILE: "thirdQuartile",
        USER_CLOSE: "userClose", VIDEO_CLICKED: "videoClicked",
        VOLUME_CHANGED: "volumeChanged", VOLUME_MUTED: "volumeMuted",
      },
    },
    AdsLoader: class { constructor() { return fakeAdsLoader; } },
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: "adsManagerLoaded" } },
    AdsRenderingSettings: class {},
    AdsRequest: class {
      constructor() { this.adTagUrl = ""; this.adsResponse = ""; this.linearAdSlotWidth = 0; this.linearAdSlotHeight = 0; }
      setAdWillPlayMuted() {}
    },
    CompanionAdSelectionSettings: {
      CreativeType: { ALL: "All", FLASH: "Flash", IMAGE: "Image" },
      ResourceType: { ALL: "All", FLASH: "Flash", HTML: "Html", IFRAME: "Iframe", STATIC: "Static" },
      SizeCriteria: { IGNORE: "IgnoreSize", SELECT_EXACT_MATCH: "SelectExactMatch", SELECT_NEAR_MATCH: "SelectNearMatch" },
    },
    ImaSdkSettings: class {
      getCompanionBackfill() { return "always"; }
      getDisableCustomPlaybackForIOS10Plus() { return false; }
      getLocale() { return "en"; }
      getNumRedirects() { return 10; }
      getPlayerType() { return "Unknown"; }
      getPlayerVersion() { return ""; }
      setAutoPlayAdBreaks() {} setCompanionBackfill() {}
      setDisableCustomPlaybackForIOS10Plus() {} setLocale() {}
      setNumRedirects() {} setPlayerType() {} setPlayerVersion() {}
      setVpaidAllowed() {} setVpaidMode() {}
    },
    OmidAccessMode: { DOMAIN: "domain", FULL: "full", LIMITED: "limited" },
    OmidVerificationVendor: {},
    UiElements: { COUNTDOWN: "countdown" },
    ViewMode: { FULLSCREEN: "fullscreen", NORMAL: "normal" },
    settings: {
      getCompanionBackfill() { return "always"; },
      getDisableCustomPlaybackForIOS10Plus() { return false; },
      getLocale() { return "en"; },
      getNumRedirects() { return 10; },
      getPlayerType() { return "Unknown"; },
      getPlayerVersion() { return ""; },
      setAutoPlayAdBreaks: noopFn, setCompanionBackfill: noopFn,
      setDisableCustomPlaybackForIOS10Plus: noopFn, setLocale: noopFn,
      setNumRedirects: noopFn, setPlayerType: noopFn, setPlayerVersion: noopFn,
      setVpaidAllowed: noopFn, setVpaidMode: noopFn,
    },
  };
  window.google = google;

  // Make googlesyndication fetch succeed (defeats IYF's prebid-ads.js detection
  // and any other fetch-based ad blocker detection)
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/googlesyndication\.com|adsbygoogle/i.test(url)) {
      return Promise.resolve(new Response("", { status: 200 }));
    }
    return origFetch.apply(this, arguments);
  };
})();
