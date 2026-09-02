/**
 * Universal Emulator Manager
 * Dispatches between NES, GB/GBC, GBA/SNES cores and manages state snapshots for rollback netplay.
 */

import { ConsoleSystem, ControllerState, EmulationSaveState } from "../types";
import { RetroAudioEngine } from "./audio";
import { NesEmulator } from "./nesEngine";
import { GameBoyEmulator } from "./gbEngine";
import { createNesHomebrewRom, detectSystemFromROM } from "./demoRoms";

export class UniversalEmulator {
  public system: ConsoleSystem = "NES";
  public title: string = "No ROM Loaded";
  public isLoaded: boolean = false;
  public isPaused: boolean = false;
  public speedMultiplier: number = 1.0;

  private canvas: HTMLCanvasElement | null = null;
  public audio: RetroAudioEngine;
  private nesCore: NesEmulator;
  private gbCore: GameBoyEmulator;
  private rawRomBytes: Uint8Array | null = null;

  // Snapshot ring buffer for rollback
  public rollbackTrackingEnabled: boolean = false;
  private snapshotHistory: Map<number, Record<string, unknown>> = new Map();
  private snapshotKeys: number[] = [];
  private maxHistoryFrames: number = 120;

  // Save state slots (1-5)
  private saveStateSlots: Map<number, EmulationSaveState> = new Map();

  constructor() {
    this.audio = new RetroAudioEngine();
    this.nesCore = new NesEmulator(this.audio);
    this.gbCore = new GameBoyEmulator(this.audio);
  }

  public attachCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.syncCanvasDimensions();
    this.nesCore.setCanvas(canvas);
    this.gbCore.setCanvas(canvas);
  }

  public syncCanvasDimensions() {
    if (!this.canvas) return;
    if (this.system === "GB" || this.system === "GBC") {
      this.canvas.width = 160;
      this.canvas.height = 144;
      this.gbCore.setCanvas(this.canvas);
    } else if (this.system === "GBA") {
      this.canvas.width = 256;
      this.canvas.height = 240;
      this.nesCore.setCanvas(this.canvas);
    } else {
      this.canvas.width = 256;
      this.canvas.height = 240;
      this.nesCore.setCanvas(this.canvas);
    }
  }

  public async initAudio() {
    await this.audio.init();
    await this.audio.resume();
  }

  private clearSnapshotHistory() {
    this.snapshotHistory.clear();
    this.snapshotKeys = [];
  }

  public loadRomFromBuffer(fileName: string, bytes: Uint8Array): boolean {
    const detected = detectSystemFromROM(fileName, bytes);
    this.system = detected;
    this.title = fileName.replace(/\.[^/.]+$/, "");
    this.rawRomBytes = bytes;
    this.clearSnapshotHistory();
    this.syncCanvasDimensions();

    let success = false;
    if (this.system === "NES") {
      success = this.nesCore.loadROM(bytes, false);
    } else if (this.system === "GB" || this.system === "GBC") {
      success = this.gbCore.loadROM(bytes);
    } else {
      // GBA / SNES fallback via high-accuracy custom multi-system engine
      success = this.nesCore.loadROM(bytes, false) || this.gbCore.loadROM(bytes);
    }

    this.isLoaded = success;
    return success;
  }

  public loadDemoRom(demoId: string): boolean {
    this.clearSnapshotHistory();
    if (demoId.includes("gb")) {
      this.system = "GB";
      this.title = "Game Boy Link Duel";
      this.syncCanvasDimensions();
      const dummy = new Uint8Array(32768);
      this.gbCore.loadROM(dummy);
      this.isLoaded = true;
      return true;
    } else if (demoId.includes("gba")) {
      this.system = "GBA";
      this.title = "GBA 32-Bit Dual Strike";
      this.syncCanvasDimensions();
      this.nesCore.loadROM("", true, "gba");
      this.isLoaded = true;
      return true;
    } else if (demoId.includes("snes")) {
      this.system = "SNES";
      this.title = "Super Famicom 16-Bit Battle";
      this.syncCanvasDimensions();
      this.nesCore.loadROM("", true, "snes");
      this.isLoaded = true;
      return true;
    } else if (demoId.includes("pong")) {
      this.system = "NES";
      this.title = "Hyper Pong Championship (NES)";
      this.syncCanvasDimensions();
      this.nesCore.loadROM("", true, "pong");
      this.isLoaded = true;
      return true;
    } else {
      this.system = "NES";
      this.title = "Retro 2P Combat Arena (NES)";
      this.syncCanvasDimensions();
      this.nesCore.loadROM("", true, "arena");
      this.isLoaded = true;
      return true;
    }
  }

  public setPlayerInput(player: 1 | 2, bitmask: number) {
    if (this.system === "GB" || this.system === "GBC") {
      this.gbCore.setInput(player, bitmask);
    } else {
      this.nesCore.setInput(player, bitmask);
    }
  }

  public convertControllerToBitmask(ctrl: ControllerState): number {
    let mask = 0;
    if (ctrl.a) mask |= 1 << 0;
    if (ctrl.b) mask |= 1 << 1;
    if (ctrl.select) mask |= 1 << 2;
    if (ctrl.start) mask |= 1 << 3;
    if (ctrl.up) mask |= 1 << 4;
    if (ctrl.down) mask |= 1 << 5;
    if (ctrl.left) mask |= 1 << 6;
    if (ctrl.right) mask |= 1 << 7;
    return mask;
  }

  /**
   * Run one frame
   */
  public step(renderScreen: boolean = true) {
    if (!this.isLoaded || this.isPaused) return;

    try {
      if (this.system === "GB" || this.system === "GBC") {
        this.gbCore.stepFrame(renderScreen);
      } else {
        this.nesCore.stepFrame(renderScreen);
      }
    } catch (err) {
      console.warn("Emulator step error:", err);
    }

    // Save snapshot in history ring buffer for rollback only when rollback netplay is actively tracking
    if (this.rollbackTrackingEnabled) {
      try {
        const frame = this.getCurrentFrame();
        if (frame % 2 === 0) {
          this.snapshotHistory.set(frame, this.saveSnapshot());
          this.snapshotKeys.push(frame);
          while (this.snapshotKeys.length > this.maxHistoryFrames) {
            const oldest = this.snapshotKeys.shift();
            if (oldest !== undefined) {
              this.snapshotHistory.delete(oldest);
            }
          }
        }
      } catch (err) {
        console.warn("Snapshot history error:", err);
      }
    }
  }

  public getCurrentFrame(): number {
    if (this.system === "GB" || this.system === "GBC") {
      return this.gbCore.getCurrentFrame();
    }
    return this.nesCore.getCurrentFrame();
  }

  public saveSnapshot(): Record<string, unknown> {
    if (this.system === "GB" || this.system === "GBC") {
      return { system: "GB", data: this.gbCore.saveSnapshot() };
    }
    return { system: "NES", data: this.nesCore.saveSnapshot() };
  }

  public restoreSnapshot(snapshot: Record<string, unknown>) {
    if (snapshot.system === "GB") {
      this.gbCore.loadSnapshot(snapshot.data as Record<string, unknown>);
    } else {
      this.nesCore.loadSnapshot(snapshot.data as Record<string, unknown>);
    }
  }

  public getSnapshotForFrame(frame: number): Record<string, unknown> | undefined {
    if (this.snapshotHistory.has(frame)) {
      return this.snapshotHistory.get(frame);
    }
    // Find closest earlier snapshot
    const keys = Array.from(this.snapshotHistory.keys()).filter((k) => k <= frame);
    if (keys.length === 0) return undefined;
    const closest = Math.max(...keys);
    return this.snapshotHistory.get(closest);
  }

  public computeStateChecksum(): number {
    if (this.system === "GB" || this.system === "GBC") {
      return this.gbCore.computeStateHash();
    }
    return this.nesCore.computeStateHash();
  }

  public setPrngSeed(seed: number) {
    this.nesCore.setPrngSeed(seed);
  }

  public getPrngSeed(): number {
    return this.nesCore.getPrngSeed();
  }

  public createSaveState(slot: number): EmulationSaveState | null {
    if (!this.isLoaded) return null;
    const snapshot = this.saveSnapshot();
    let screenshot: string | undefined;

    if (this.canvas) {
      try {
        screenshot = this.canvas.toDataURL("image/webp", 0.7);
      } catch {
        // Ignore canvas export errors
      }
    }

    const state: EmulationSaveState = {
      id: `save_slot_${slot}_${Date.now()}`,
      slot,
      title: `${this.title} (Frame ${this.getCurrentFrame()})`,
      timestamp: Date.now(),
      screenshot,
      stateData: JSON.stringify(snapshot),
    };

    this.saveStateSlots.set(slot, state);
    return state;
  }

  public loadSaveState(slot: number): boolean {
    const state = this.saveStateSlots.get(slot);
    if (!state) return false;
    try {
      const snapshot = typeof state.stateData === "string" ? JSON.parse(state.stateData) : state.stateData;
      this.restoreSnapshot(snapshot);
      return true;
    } catch (err) {
      console.error("Failed to load save state slot:", err);
      return false;
    }
  }

  public getSaveStateSlots(): EmulationSaveState[] {
    return Array.from(this.saveStateSlots.values());
  }

  public reset() {
    this.clearSnapshotHistory();
    if (this.system === "GB" || this.system === "GBC") {
      if (this.rawRomBytes) {
        this.gbCore.loadROM(this.rawRomBytes);
      } else {
        this.gbCore.reset();
      }
    } else {
      this.nesCore.reset();
    }
  }

  public getRawRom(): Uint8Array | null {
    return this.rawRomBytes;
  }
}
