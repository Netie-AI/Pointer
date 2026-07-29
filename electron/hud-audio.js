/**
 * Live capture for the HUD: microphone and Windows system audio (loopback).
 *
 * Replaces Chromium SpeechRecognition, which cannot work here — in Electron it
 * opens the mic and then dies with `error: network` (no Google Speech key is
 * bundled), and even where it works it streams the microphone off-device. Both
 * are disqualifying for this product.
 *
 * The AudioContext is created at 16 kHz so Chromium does the resampling in
 * native code; frames go to the main process, which owns gating + transcription.
 */

const FRAME = 320; // 20 ms @ 16 kHz

class LiveCapture {
  /** @param {(source:string, samples:Float32Array, rate:number)=>void} onFrame */
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.ctx = null;
    this.nodes = new Map(); // source -> { stream, src, node }
    this.mode = null; // 'worklet' | 'script'
  }

  async _ensureCtx() {
    if (this.ctx && this.ctx.state !== "closed") {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    this.ctx = new AudioContext({ sampleRate: 16000 });
    try {
      await this.ctx.audioWorklet.addModule("audio-worklet.js");
      this.mode = "worklet";
    } catch {
      // CSP or protocol blocked the module — ScriptProcessor still works.
      this.mode = "script";
    }
    return this.ctx;
  }

  _makeTap(source) {
    const rate = this.ctx.sampleRate;
    // Worklet + ScriptProcessor only run while connected to a destination.
    // Mute the output so we never echo capture back through speakers.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    mute.connect(this.ctx.destination);

    if (this.mode === "worklet") {
      const node = new AudioWorkletNode(this.ctx, "netie-tap");
      node.port.onmessage = (e) => this.onFrame(source, e.data, rate);
      node.connect(mute);
      return node;
    }
    const node = this.ctx.createScriptProcessor(1024, 1, 1);
    let buf = new Float32Array(FRAME);
    let n = 0;
    node.onaudioprocess = (e) => {
      const inp = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < inp.length; i++) {
        buf[n++] = inp[i];
        if (n === FRAME) {
          this.onFrame(source, buf.slice(0), rate);
          n = 0;
        }
      }
    };
    node.connect(mute);
    return node;
  }

  async start(source) {
    if (this.nodes.has(source)) return { ok: true, already: true };
    let stream;
    try {
      if (source === "system") {
        // Electron's setDisplayMediaRequestHandler answers this with
        // { audio: 'loopback' } — real WASAPI loopback, no sidecar needed.
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        stream.getVideoTracks().forEach((t) => t.stop()); // audio is all we want
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach((t) => t.stop());
          return { ok: false, error: "no system-audio track" };
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }
    } catch (err) {
      return { ok: false, error: `${err && err.name}: ${err && err.message}` };
    }

    await this._ensureCtx();
    const src = this.ctx.createMediaStreamSource(stream);
    const node = this._makeTap(source);
    src.connect(node);
    this.nodes.set(source, { stream, src, node });
    // A device unplugged / share stopped from the OS bar must not look live.
    stream.getAudioTracks().forEach((t) => {
      t.addEventListener("ended", () => this.stop(source));
    });
    return { ok: true, mode: this.mode };
  }

  stop(source) {
    const entry = this.nodes.get(source);
    if (!entry) return;
    try {
      entry.src.disconnect();
      entry.node.disconnect();
      if (entry.node.port) entry.node.port.onmessage = null;
      entry.node.onaudioprocess = null;
      entry.stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* already torn down */
    }
    this.nodes.delete(source);
  }

  stopAll() {
    for (const s of Array.from(this.nodes.keys())) this.stop(s);
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  active(source) {
    return this.nodes.has(source);
  }
}

window.NetieCapture = { LiveCapture };
