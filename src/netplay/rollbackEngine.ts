/**
 * GGPO-Style Rollback Netplay Engine for Retro Emulators
 * Implements input ring-buffering, remote input prediction, state snapshotting,
 * dynamic rollback & fast-forward re-simulation, and desync CRC32 checks.
 */

import { UniversalEmulator } from "../emulator/emulatorManager";
import { WebRTCNetplayPeer } from "./webrtc";
import { NetplayMetrics, PlayerRole } from "../types";

export class RollbackNetplayEngine {
  private emulator: UniversalEmulator;
  private peer: WebRTCNetplayPeer;
  public localRole: PlayerRole = "player1";

  // Ring buffers
  private localInputs: Map<number, number> = new Map();
  private remoteInputs: Map<number, number> = new Map();
  private isPredicted: Map<number, boolean> = new Map();
  private ringBufferSize: number = 240; // 4 seconds at 60fps

  // Metrics
  public metrics: NetplayMetrics = {
    ping: 0,
    jitter: 0,
    packetLoss: 0,
    rollbacksPerSec: 0,
    maxRollbackFrames: 0,
    localFrame: 0,
    remoteFrame: 0,
    frameAdvantage: 0,
    desyncCount: 0,
    p2pConnected: false,
    connectionType: "local",
  };

  private rollbackCountThisSecond: number = 0;
  private lastMetricResetTime: number = Date.now();
  private maxRollbackObserved: number = 0;
  private lastConfirmedRemoteFrame: number = 0;
  private localFrameDelay: number = 0; // 0 for pure rollback, or 1-2 frames for hybrid GGPO
  private lastRemoteInput: number = 0;

  constructor(emulator: UniversalEmulator, peer: WebRTCNetplayPeer) {
    this.emulator = emulator;
    this.peer = peer;
    this.setupPeerCallbacks();
  }

  public setLocalRole(role: PlayerRole) {
    this.localRole = role;
  }

  public setFrameDelay(delay: number) {
    this.localFrameDelay = Math.max(0, Math.min(6, delay));
  }

  private setupPeerCallbacks() {
    this.peer.onInputData = (data) => {
      this.handleIncomingRemoteInput(data);
    };

    this.peer.onStateData = (data) => {
      this.handleIncomingStateSync(data);
    };
  }

  public handleIncomingRemoteInput(data: Uint8Array | string) {
    let frame: number;
    let inputMask: number;

    if (data instanceof Uint8Array && data.byteLength >= 8) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      frame = view.getUint32(0, true);
      inputMask = view.getUint16(4, true);
    } else if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        frame = parsed.frame;
        inputMask = parsed.inputMask;
      } catch {
        return;
      }
    } else {
      return;
    }

    this.lastConfirmedRemoteFrame = Math.max(this.lastConfirmedRemoteFrame, frame);
    this.lastRemoteInput = inputMask;

    const currentLocalFrame = this.emulator.getCurrentFrame();
    const prevPrediction = this.remoteInputs.get(frame);
    const wasPredicted = this.isPredicted.get(frame) ?? true;

    this.remoteInputs.set(frame, inputMask);
    this.isPredicted.set(frame, false);

    // If this input arrived for an already simulated past frame AND the prediction was wrong -> ROLLBACK!
    if (frame < currentLocalFrame && wasPredicted && prevPrediction !== inputMask) {
      const rollbackDistance = currentLocalFrame - frame;
      this.executeRollback(frame, currentLocalFrame, rollbackDistance);
    }
  }

  private executeRollback(startFrame: number, targetFrame: number, distance: number) {
    this.rollbackCountThisSecond++;
    this.maxRollbackObserved = Math.max(this.maxRollbackObserved, distance);

    // Retrieve snapshot at startFrame
    const snapshot = this.emulator.getSnapshotForFrame(startFrame);
    if (!snapshot) {
      // Snapshot too old or not found
      return;
    }

    // 1. Restore emulator state to before the mismatch
    this.emulator.restoreSnapshot(snapshot);

    const isP1 = this.localRole === "player1";
    const localPlayerNum = isP1 ? 1 : 2;
    const remotePlayerNum = isP1 ? 2 : 1;

    // 2. Fast-forward re-simulation from startFrame to targetFrame (headless / no render / audio skipped)
    for (let f = startFrame; f < targetFrame; f++) {
      const lInput = this.localInputs.get(f) ?? 0;
      let rInput = this.remoteInputs.get(f);

      if (rInput === undefined) {
        // Predict if still missing
        rInput = this.lastRemoteInput;
        this.remoteInputs.set(f, rInput);
        this.isPredicted.set(f, true);
      }

      this.emulator.setPlayerInput(localPlayerNum as 1 | 2, lInput);
      this.emulator.setPlayerInput(remotePlayerNum as 1 | 2, rInput);

      // Step frame without drawing to canvas to maintain 60FPS fluid display
      this.emulator.step(false);
    }
  }

  /**
   * Called once every video refresh (60 Hz)
   */
  public advanceFrame(localRawInput: number): void {
    const currentFrame = this.emulator.getCurrentFrame();
    const executionFrame = currentFrame + this.localFrameDelay;

    // 1. Record & send local input
    this.localInputs.set(executionFrame, localRawInput);
    this.peer.sendInputPacket(executionFrame, localRawInput);

    // 2. Determine remote input for currentFrame
    let remoteInput = this.remoteInputs.get(currentFrame);
    if (remoteInput === undefined) {
      // Input prediction (predict previous input)
      remoteInput = this.lastRemoteInput;
      this.remoteInputs.set(currentFrame, remoteInput);
      this.isPredicted.set(currentFrame, true);
    }

    const isP1 = this.localRole === "player1";
    const localPlayerNum = isP1 ? 1 : 2;
    const remotePlayerNum = isP1 ? 2 : 1;

    // 3. Set inputs into emulator
    const localInputForFrame = this.localInputs.get(currentFrame) ?? localRawInput;
    this.emulator.setPlayerInput(localPlayerNum as 1 | 2, localInputForFrame);
    this.emulator.setPlayerInput(remotePlayerNum as 1 | 2, remoteInput);

    // 4. Step the emulator with full audio/video rendering
    this.emulator.step(true);

    // 5. Periodic CRC desync check (every 60 frames = 1 sec)
    if (currentFrame % 60 === 0 && this.peer.isConnected()) {
      const checksum = this.emulator.computeStateChecksum();
      this.peer.sendStatePacket({
        type: "checksum-check",
        frame: currentFrame,
        checksum,
      });
    }

    // 6. Cleanup ring buffer memory
    if (this.localInputs.size > this.ringBufferSize) {
      const threshold = currentFrame - this.ringBufferSize;
      for (const f of this.localInputs.keys()) {
        if (f < threshold) {
          this.localInputs.delete(f);
          this.remoteInputs.delete(f);
          this.isPredicted.delete(f);
        }
      }
    }

    // 7. Update metrics
    this.updateMetrics(currentFrame);
  }

  private handleIncomingStateSync(data: Uint8Array | string) {
    try {
      const parsed = typeof data === "string" ? JSON.parse(data) : JSON.parse(new TextDecoder().decode(data));
      if (parsed.type === "checksum-check") {
        const myChecksum = this.emulator.computeStateChecksum();
        if (parsed.checksum !== myChecksum) {
          this.metrics.desyncCount++;
          // If local client is Player 2 and desync detected, request full state from Host (Player 1)
          if (this.localRole === "player2") {
            this.peer.sendStatePacket({ type: "request-full-state-sync" });
          }
        }
      } else if (parsed.type === "request-full-state-sync" && this.localRole === "player1") {
        // Authoritative Host broadcasts full snapshot
        const snapshot = this.emulator.saveSnapshot();
        this.peer.sendStatePacket({
          type: "full-state-snapshot",
          snapshot,
        });
      } else if (parsed.type === "full-state-snapshot" && this.localRole === "player2") {
        this.emulator.restoreSnapshot(parsed.snapshot);
      }
    } catch {
      // Ignore parse error
    }
  }

  private updateMetrics(currentFrame: number) {
    const now = Date.now();
    if (now - this.lastMetricResetTime >= 1000) {
      this.metrics.rollbacksPerSec = this.rollbackCountThisSecond;
      this.metrics.maxRollbackFrames = this.maxRollbackObserved;
      this.rollbackCountThisSecond = 0;
      this.maxRollbackObserved = 0;
      this.lastMetricResetTime = now;
    }

    this.metrics.ping = this.peer.rtt;
    this.metrics.jitter = this.peer.jitter;
    this.metrics.packetLoss = this.peer.packetLoss;
    this.metrics.localFrame = currentFrame;
    this.metrics.remoteFrame = this.lastConfirmedRemoteFrame;
    this.metrics.frameAdvantage = currentFrame - this.lastConfirmedRemoteFrame;
    this.metrics.p2pConnected = this.peer.isConnected();
    this.metrics.connectionType = this.peer.isConnected() ? "webrtc-p2p" : "websocket-relay";
  }

  public reset() {
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.isPredicted.clear();
    this.lastConfirmedRemoteFrame = 0;
    this.lastRemoteInput = 0;
    this.rollbackCountThisSecond = 0;
    this.maxRollbackObserved = 0;
  }
}
