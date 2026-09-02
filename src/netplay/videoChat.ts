/**
 * WebRTC Audio & Video Communication Manager
 * Provides 2-way peer video and audio chat with real-time audio level meters,
 * camera/mic toggles, and signaling over WebSocket / WebRTC.
 */

import { SignalingClient } from "./signaling";

export interface AVMediaStatus {
  isCallActive: boolean;
  isMicMuted: boolean;
  isCameraOff: boolean;
  hasLocalStream: boolean;
  hasRemoteStream: boolean;
  localSpeaking: boolean;
  remoteSpeaking: boolean;
  error?: string;
}

export class WebRTCVideoChat {
  private signaling: SignalingClient;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  public targetPeerId: string | null = null;
  public isInitiator: boolean = false;
  public isMicMuted: boolean = false;
  public isCameraOff: boolean = false;
  public isCallActive: boolean = false;

  // Web Audio Analysers for voice activity
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private remoteAnalyser: AnalyserNode | null = null;
  private animInterval: number | null = null;

  public localAudioLevel: number = 0;
  public remoteAudioLevel: number = 0;

  // Callbacks for UI
  public onLocalStream: ((stream: MediaStream | null) => void) | null = null;
  public onRemoteStream: ((stream: MediaStream | null) => void) | null = null;
  public onAudioLevels: ((local: number, remote: number) => void) | null = null;
  public onStatusChange: ((status: AVMediaStatus) => void) | null = null;

  // ICE Servers (STUN)
  private iceServers: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  constructor(signaling: SignalingClient) {
    this.signaling = signaling;
    this.setupSignaling();
  }

  private setupSignaling() {
    this.signaling.on("av-offer", async (data) => {
      const sender = data.senderPeerId as string;
      const payload = data.payload as RTCSessionDescriptionInit;
      this.targetPeerId = sender;
      this.isInitiator = false;
      await this.handleIncomingOffer(payload);
    });

    this.signaling.on("av-answer", async (data) => {
      const payload = data.payload as RTCSessionDescriptionInit;
      await this.handleIncomingAnswer(payload);
    });

    this.signaling.on("av-ice", async (data) => {
      const candidate = data.payload as RTCIceCandidateInit;
      await this.handleIncomingIce(candidate);
    });

    this.signaling.on("av-state-update", (data) => {
      this.notifyStatus();
    });
  }

  /**
   * Acquire local camera & microphone streams
   */
  public async startMedia(video: boolean = true, audio: boolean = true): Promise<boolean> {
    try {
      if (this.localStream) {
        this.stopMedia();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 } } : false,
        audio: audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false,
      });

      this.localStream = stream;
      this.isMicMuted = !audio;
      this.isCameraOff = !video;
      this.isCallActive = true;

      this.setupAudioAnalysis(stream, true);

      if (this.onLocalStream) {
        this.onLocalStream(stream);
      }

      this.notifyStatus();
      this.startAudioLevelLoop();
      return true;
    } catch (err: unknown) {
      console.warn("Could not access camera/mic:", err);
      const errMsg = err instanceof Error ? err.message : "Media device access denied";
      if (this.onStatusChange) {
        this.onStatusChange({
          isCallActive: false,
          isMicMuted: true,
          isCameraOff: true,
          hasLocalStream: false,
          hasRemoteStream: false,
          localSpeaking: false,
          remoteSpeaking: false,
          error: errMsg,
        });
      }
      return false;
    }
  }

  /**
   * Initiate 2-Way Audio/Video call with Peer
   */
  public async callPeer(targetPeerId: string) {
    this.targetPeerId = targetPeerId;
    this.isInitiator = true;

    if (!this.localStream) {
      const acquired = await this.startMedia(true, true);
      if (!acquired) return;
    }

    this.cleanupPeerConnection();

    this.pc = new RTCPeerConnection(this.iceServers);
    this.setupPCEvents();

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });
    }

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);

    this.signaling.send({
      type: "av-offer",
      targetPeerId,
      payload: offer,
    });

    this.isCallActive = true;
    this.notifyStatus();
  }

  private async handleIncomingOffer(offer: RTCSessionDescriptionInit) {
    if (!this.localStream) {
      await this.startMedia(true, true);
    }

    this.cleanupPeerConnection();

    this.pc = new RTCPeerConnection(this.iceServers);
    this.setupPCEvents();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc?.addTrack(track, this.localStream!);
      });
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.signaling.send({
      type: "av-answer",
      targetPeerId: this.targetPeerId,
      payload: answer,
    });

    this.isCallActive = true;
    this.notifyStatus();
  }

  private async handleIncomingAnswer(answer: RTCSessionDescriptionInit) {
    if (this.pc && this.pc.signalingState !== "closed") {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.isCallActive = true;
      this.notifyStatus();
    }
  }

  private async handleIncomingIce(candidate: RTCIceCandidateInit) {
    if (this.pc && this.pc.remoteDescription && candidate) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("AV ICE error:", err);
      }
    }
  }

  private setupPCEvents() {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.targetPeerId) {
        this.signaling.send({
          type: "av-ice",
          targetPeerId: this.targetPeerId,
          payload: event.candidate,
        });
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.setupAudioAnalysis(this.remoteStream, false);
        if (this.onRemoteStream) {
          this.onRemoteStream(this.remoteStream);
        }
        this.notifyStatus();
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === "disconnected" || this.pc?.connectionState === "failed") {
        this.remoteStream = null;
        if (this.onRemoteStream) this.onRemoteStream(null);
        this.notifyStatus();
      }
    };
  }

  /**
   * Mute / Unmute Microphone
   */
  public toggleMuteMic(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isMicMuted = !this.isMicMuted;
    audioTracks.forEach((track) => {
      track.enabled = !this.isMicMuted;
    });

    this.notifyStatus();
    return this.isMicMuted;
  }

  /**
   * Turn On / Off Camera
   */
  public toggleCamera(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    this.isCameraOff = !this.isCameraOff;
    videoTracks.forEach((track) => {
      track.enabled = !this.isCameraOff;
    });

    this.notifyStatus();
    return this.isCameraOff;
  }

  private setupAudioAnalysis(stream: MediaStream, isLocal: boolean) {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }

      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      if (isLocal) {
        this.localAnalyser = analyser;
      } else {
        this.remoteAnalyser = analyser;
      }
    } catch (e) {
      console.warn("Audio analysis setup warning:", e);
    }
  }

  private startAudioLevelLoop() {
    if (this.animInterval) return;

    const dataArray = new Uint8Array(32);
    this.animInterval = window.setInterval(() => {
      let localLvl = 0;
      let remoteLvl = 0;

      if (this.localAnalyser && !this.isMicMuted) {
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        localLvl = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
      }

      if (this.remoteAnalyser) {
        this.remoteAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        remoteLvl = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
      }

      this.localAudioLevel = localLvl;
      this.remoteAudioLevel = remoteLvl;

      if (this.onAudioLevels) {
        this.onAudioLevels(localLvl, remoteLvl);
      }
    }, 100);
  }

  private notifyStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({
        isCallActive: this.isCallActive,
        isMicMuted: this.isMicMuted,
        isCameraOff: this.isCameraOff,
        hasLocalStream: Boolean(this.localStream),
        hasRemoteStream: Boolean(this.remoteStream),
        localSpeaking: this.localAudioLevel > 15,
        remoteSpeaking: this.remoteAudioLevel > 15,
      });
    }
  }

  public stopMedia() {
    if (this.animInterval) {
      clearInterval(this.animInterval);
      this.animInterval = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.cleanupPeerConnection();

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.localAnalyser = null;
    this.remoteAnalyser = null;
    this.isCallActive = false;

    if (this.onLocalStream) this.onLocalStream(null);
    if (this.onRemoteStream) this.onRemoteStream(null);
    this.notifyStatus();
  }

  private cleanupPeerConnection() {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  public destroy() {
    this.stopMedia();
  }
}
