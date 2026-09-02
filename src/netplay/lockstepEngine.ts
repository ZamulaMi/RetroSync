/**
 * Classic Frame-Lockstep Delay-Based Netplay Engine
 * Stalls frame execution until both players' inputs for frame K have arrived.
 */

import { UniversalEmulator } from "../emulator/emulatorManager";
import { WebRTCNetplayPeer } from "./webrtc";
import { NetplayMetrics, PlayerRole } from "../types";

export class LockstepNetplayEngine {
  private emulator: UniversalEmulator;
  private peer: WebRTCNetplayPeer;
  public localRole: PlayerRole = "player1";
  public frameDelay: number = 2; // Input lag buffer in frames

  private localInputs: Map<number, number> = new Map();
  private remoteInputs: Map<number, number> = new Map();
  private lastConfirmedRemoteFrame: number = 0;

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

  constructor(emulator: UniversalEmulator, peer: WebRTCNetplayPeer) {
    this.emulator = emulator;
    this.peer = peer;
    this.setupPeerCallbacks();
  }

  public setLocalRole(role: PlayerRole) {
    this.localRole = role;
  }

  public setFrameDelay(delay: number) {
    this.frameDelay = Math.max(1, Math.min(10, delay));
  }

  private setupPeerCallbacks() {
    this.peer.onInputData = (data) => {
      if (data instanceof Uint8Array && data.byteLength >= 8) {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const frame = view.getUint32(0, true);
        const inputMask = view.getUint16(4, true);
        this.remoteInputs.set(frame, inputMask);
        this.lastConfirmedRemoteFrame = Math.max(this.lastConfirmedRemoteFrame, frame);
      }
    };
  }

  public advanceFrame(localRawInput: number): boolean {
    const currentFrame = this.emulator.getCurrentFrame();
    const scheduledFrame = currentFrame + this.frameDelay;

    // Send local input for future frame
    this.localInputs.set(scheduledFrame, localRawInput);
    this.peer.sendInputPacket(scheduledFrame, localRawInput);

    // In lockstep: check if both inputs for currentFrame are available
    const myInput = this.localInputs.get(currentFrame) ?? localRawInput;
    const oppInput = this.remoteInputs.get(currentFrame);

    if (oppInput === undefined && this.peer.isConnected()) {
      // Waiting for remote player input (stalled)
      return false;
    }

    const isP1 = this.localRole === "player1";
    this.emulator.setPlayerInput(isP1 ? 1 : 2, myInput);
    this.emulator.setPlayerInput(isP1 ? 2 : 1, oppInput ?? 0);

    this.emulator.step(true);

    // Update metrics
    this.metrics.ping = this.peer.rtt;
    this.metrics.jitter = this.peer.jitter;
    this.metrics.localFrame = currentFrame;
    this.metrics.remoteFrame = this.lastConfirmedRemoteFrame;
    this.metrics.p2pConnected = this.peer.isConnected();
    this.metrics.connectionType = this.peer.isConnected() ? "webrtc-p2p" : "websocket-relay";

    return true;
  }

  public reset() {
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.lastConfirmedRemoteFrame = 0;
  }
}
