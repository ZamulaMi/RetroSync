/**
 * WebRTC DataChannel Manager for Direct P2P Netplay
 * Uses unreliable/unordered channel for inputs (zero jitter) and reliable channel for state snapshots & ROM sync.
 */

import { SignalingClient } from "./signaling";

export type DataChannelCallback = (data: Uint8Array | string) => void;

export class WebRTCNetplayPeer {
  private pc: RTCPeerConnection | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private stateChannel: RTCDataChannel | null = null;
  private signaling: SignalingClient;
  private targetPeerId: string | null = null;
  private isInitiator: boolean = false;

  public onInputData: DataChannelCallback | null = null;
  public onStateData: DataChannelCallback | null = null;
  public onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null = null;

  // Latency Metrics
  public rtt: number = 0;
  public jitter: number = 0;
  public packetLoss: number = 0;
  private pingTimestamps: Map<number, number> = new Map();
  private pingSequence: number = 0;

  // ICE Servers (Google STUN)
  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  constructor(signaling: SignalingClient) {
    this.signaling = signaling;
    this.setupSignalingListeners();
  }

  private setupSignalingListeners() {
    this.signaling.on("signal-offer", async (data) => {
      const sender = data.senderPeerId as string;
      const payload = data.payload as RTCSessionDescriptionInit;
      this.targetPeerId = sender;
      this.isInitiator = false;
      await this.handleOffer(payload);
    });

    this.signaling.on("signal-answer", async (data) => {
      const payload = data.payload as RTCSessionDescriptionInit;
      await this.handleAnswer(payload);
    });

    this.signaling.on("signal-ice", async (data) => {
      const candidate = data.payload as RTCIceCandidateInit;
      await this.handleCandidate(candidate);
    });
  }

  public async connectToPeer(targetPeerId: string) {
    this.targetPeerId = targetPeerId;
    this.isInitiator = true;
    this.cleanupPeer();

    this.pc = new RTCPeerConnection(this.iceServers);
    this.setupPeerConnectionEvents();

    // 1. Unreliable/Unordered DataChannel for frame input synchronization (like UDP for GGPO rollback)
    this.inputChannel = this.pc.createDataChannel("netplay-input", {
      ordered: false,
      maxRetransmits: 0,
    });
    this.setupDataChannel(this.inputChannel, true);

    // 2. Reliable/Ordered DataChannel for State Snapshots, ROM sync, and Chat
    this.stateChannel = this.pc.createDataChannel("netplay-state", {
      ordered: true,
    });
    this.setupDataChannel(this.stateChannel, false);

    // Create SDP Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.signaling.send({
      type: "signal-offer",
      targetPeerId,
      payload: offer,
    });
  }

  private async handleOffer(offer: RTCSessionDescriptionInit) {
    this.cleanupPeer();
    this.pc = new RTCPeerConnection(this.iceServers);
    this.setupPeerConnectionEvents();

    this.pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === "netplay-input") {
        this.inputChannel = channel;
        this.setupDataChannel(channel, true);
      } else if (channel.label === "netplay-state") {
        this.stateChannel = channel;
        this.setupDataChannel(channel, false);
      }
    };

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.signaling.send({
      type: "signal-answer",
      targetPeerId: this.targetPeerId,
      payload: answer,
    });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.pc && this.pc.signalingState !== "closed") {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleCandidate(candidate: RTCIceCandidateInit) {
    if (this.pc && this.pc.remoteDescription && candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("Error adding ICE candidate:", err);
      }
    }
  }

  private setupPeerConnectionEvents() {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.targetPeerId) {
        this.signaling.send({
          type: "signal-ice",
          targetPeerId: this.targetPeerId,
          payload: event.candidate,
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc && this.onConnectionStateChange) {
        this.onConnectionStateChange(this.pc.connectionState);
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel, isInput: boolean) {
    channel.binaryType = "arraybuffer";

    channel.onopen = () => {
      if (isInput) {
        this.startP2PPingLoop();
      }
    };

    channel.onmessage = (event) => {
      if (isInput) {
        if (typeof event.data === "string" && event.data.startsWith("PING:")) {
          // Send pong back immediately
          channel.send("PONG:" + event.data.substring(5));
          return;
        } else if (typeof event.data === "string" && event.data.startsWith("PONG:")) {
          const parts = event.data.substring(5).split(",");
          const seq = parseInt(parts[0], 10);
          const sentTime = this.pingTimestamps.get(seq);
          if (sentTime) {
            const currentRtt = Date.now() - sentTime;
            this.jitter = Math.abs(currentRtt - this.rtt);
            this.rtt = currentRtt;
            this.pingTimestamps.delete(seq);
          }
          return;
        }

        if (this.onInputData) {
          const buffer = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
          this.onInputData(buffer);
        }
      } else {
        if (this.onStateData) {
          const buffer = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : event.data;
          this.onStateData(buffer);
        }
      }
    };

    channel.onerror = (err) => {
      console.warn(`DataChannel ${channel.label} error:`, err);
    };
  }

  private startP2PPingLoop() {
    window.setInterval(() => {
      if (this.inputChannel && this.inputChannel.readyState === "open") {
        this.pingSequence++;
        this.pingTimestamps.set(this.pingSequence, Date.now());
        this.inputChannel.send(`PING:${this.pingSequence},${Date.now()}`);

        // Clean up stale pings
        if (this.pingTimestamps.size > 20) {
          this.pingTimestamps.clear();
        }
      }
    }, 1000);
  }

  public sendInputPacket(frame: number, inputMask: number) {
    // Pack into ultra-compact 8-byte binary packet: [Frame 32-bit uint, InputMask 16-bit uint, Checksum 16-bit]
    if (this.inputChannel && this.inputChannel.readyState === "open") {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, frame, true);
      view.setUint16(4, inputMask, true);
      view.setUint16(6, 0xcafe, true); // magic marker
      this.inputChannel.send(buffer);
    } else {
      // Fallback to WebSocket relay
      this.signaling.send({
        type: "netplay-input-relay",
        frame,
        inputMask,
      });
    }
  }

  public sendStatePacket(payload: Record<string, unknown> | Uint8Array) {
    if (this.stateChannel && this.stateChannel.readyState === "open") {
      if (payload instanceof Uint8Array) {
        this.stateChannel.send(payload);
      } else {
        this.stateChannel.send(JSON.stringify(payload));
      }
    } else {
      // Fallback
      this.signaling.send({
        type: "netplay-sync-state",
        payload: payload instanceof Uint8Array ? Array.from(payload) : payload,
      });
    }
  }

  public isConnected(): boolean {
    return (
      this.pc !== null &&
      (this.pc.connectionState === "connected" ||
        (this.inputChannel !== null && this.inputChannel.readyState === "open"))
    );
  }

  public cleanupPeer() {
    if (this.inputChannel) {
      this.inputChannel.close();
      this.inputChannel = null;
    }
    if (this.stateChannel) {
      this.stateChannel.close();
      this.stateChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
