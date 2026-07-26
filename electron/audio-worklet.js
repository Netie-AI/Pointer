/**
 * AudioWorkletProcessor: forwards fixed 20 ms mono frames to the main thread.
 *
 * Runs on the audio render thread, so it must stay allocation-light — it only
 * fills one reusable buffer and posts a copy when full. All gating and
 * segmentation happens in the main process (electron/netie/audio.js).
 */

const FRAME = 320; // 20 ms @ 16 kHz

class NetieTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(FRAME);
    this._n = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    // Mix whatever channels arrived down to mono.
    const chans = input.length;
    const block = input[0];
    if (!block) return true;

    for (let i = 0; i < block.length; i++) {
      let s = 0;
      for (let c = 0; c < chans; c++) s += input[c][i];
      this._buf[this._n++] = s / chans;
      if (this._n === FRAME) {
        this.port.postMessage(this._buf.slice(0));
        this._n = 0;
      }
    }
    return true;
  }
}

registerProcessor("netie-tap", NetieTap);
