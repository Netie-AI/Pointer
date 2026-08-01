"use strict";

const DEFAULTS = Object.freeze({
  systemAudio: true,
  sttSidecar: true,
  canvas: true,
  hotTicks: true,
  fleetTelemetry: true,
  agentPresenceFx: false,
  recall: true,
  clicky: true,
  recallLite: true,
});

const LIGHT_DISABLED = Object.freeze(["systemAudio", "canvas", "hotTicks"]);

class FeatureFlags {
  constructor(opts = {}) {
    const env = opts.env || process.env;
    const settings = opts.settings || opts.overrides || {};
    this.flags = { ...DEFAULTS };

    if (env.NETIE_LIGHT === "1") {
      for (const name of LIGHT_DISABLED) this.flags[name] = false;
      this.flags.recallLite = true;
    }

    for (const name of Object.keys(DEFAULTS)) {
      if (typeof settings[name] === "boolean") this.flags[name] = settings[name];
    }
  }

  isEnabled(name) {
    return this.flags[name] === true;
  }

  snapshot() {
    return { ...this.flags };
  }
}

const features = new FeatureFlags();

function isEnabled(name) {
  return features.isEnabled(name);
}

function snapshot() {
  return features.snapshot();
}

module.exports = {
  DEFAULTS,
  LIGHT_DISABLED,
  FeatureFlags,
  isEnabled,
  snapshot,
};
