/**
 * Web Audio API Driver for Low-Latency Retro Audio Synthesis
 * Supports dynamic resampling, ring buffering, and mute/volume controls.
 */

export class RetroAudioEngine {
  private audioCtx: AudioContext | null = null;
  private sampleRate: number = 44100;
  private bufferSize: number = 2048;
  private scriptNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private sampleBuffer: Float32Array;
  private writeIndex: number = 0;
  private readIndex: number = 0;
  private bufferCapacity: number = 16384;
  private isMuted: boolean = false;
  private volume: number = 0.8;
  private isRunning: boolean = false;

  constructor(sampleRate: number = 44100) {
    this.sampleRate = sampleRate;
    this.sampleBuffer = new Float32Array(this.bufferCapacity);
  }

  public async init() {
    if (this.audioCtx) return;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AudioContextClass({
      sampleRate: this.sampleRate,
      latencyHint: "interactive",
    });

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.audioCtx.currentTime);
    this.gainNode.connect(this.audioCtx.destination);

    // Using ScriptProcessor / AudioWorklet buffer consumer for frame-locked retro synthesis
    this.scriptNode = this.audioCtx.createScriptProcessor(this.bufferSize, 0, 2);
    this.scriptNode.onaudioprocess = (e) => {
      const outputLeft = e.outputBuffer.getChannelData(0);
      const outputRight = e.outputBuffer.getChannelData(1);
      const len = outputLeft.length;

      for (let i = 0; i < len; i++) {
        if (this.readIndex !== this.writeIndex) {
          const sample = this.sampleBuffer[this.readIndex];
          outputLeft[i] = sample;
          outputRight[i] = sample;
          this.readIndex = (this.readIndex + 1) % this.bufferCapacity;
        } else {
          // Underflow silence
          outputLeft[i] = 0;
          outputRight[i] = 0;
        }
      }
    };

    this.scriptNode.connect(this.gainNode);
    this.isRunning = true;
  }

  public async resume() {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
  }

  public writeSample(sample: number) {
    if (!this.isRunning) return;
    const nextWrite = (this.writeIndex + 1) % this.bufferCapacity;
    if (nextWrite !== this.readIndex) {
      this.sampleBuffer[this.writeIndex] = sample;
      this.writeIndex = nextWrite;
    }
  }

  public writeSamples(samples: Float32Array | number[]) {
    if (!this.isRunning) return;
    for (let i = 0; i < samples.length; i++) {
      this.writeSample(samples[i]);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.audioCtx && !this.isMuted) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  public setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.audioCtx.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getMute(): boolean {
    return this.isMuted;
  }

  public clearBuffer() {
    this.readIndex = 0;
    this.writeIndex = 0;
    this.sampleBuffer.fill(0);
  }

  public close() {
    this.isRunning = false;
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
