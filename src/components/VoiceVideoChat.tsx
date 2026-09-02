import React, { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneCall,
  PhoneOff,
  Volume2,
  User,
  Activity,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { WebRTCVideoChat, AVMediaStatus } from "../netplay/videoChat";
import { PlayerRole, RoomInfo } from "../types";

interface VoiceVideoChatProps {
  videoChat: WebRTCVideoChat;
  room: RoomInfo | null;
  myRole: PlayerRole;
  myUsername: string;
  opponentPeerId?: string;
  opponentName?: string;
}

export const VoiceVideoChat: React.FC<VoiceVideoChatProps> = ({
  videoChat,
  room,
  myRole,
  myUsername,
  opponentPeerId,
  opponentName = "Player 2",
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [avStatus, setAvStatus] = useState<AVMediaStatus>({
    isCallActive: false,
    isMicMuted: false,
    isCameraOff: false,
    hasLocalStream: false,
    hasRemoteStream: false,
    localSpeaking: false,
    remoteSpeaking: false,
  });

  const [localAudioLvl, setLocalAudioLvl] = useState<number>(0);
  const [remoteAudioLvl, setRemoteAudioLvl] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    videoChat.onStatusChange = (status) => {
      setAvStatus({ ...status });
      if (status.error) {
        setErrorMessage(status.error);
      } else {
        setErrorMessage(null);
      }
    };

    videoChat.onAudioLevels = (localLvl, remoteLvl) => {
      setLocalAudioLvl(localLvl);
      setRemoteAudioLvl(remoteLvl);
    };

    videoChat.onLocalStream = (stream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    };

    videoChat.onRemoteStream = (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };
  }, [videoChat]);

  const handleStartCall = async () => {
    setIsConnecting(true);
    setErrorMessage(null);

    if (opponentPeerId) {
      await videoChat.callPeer(opponentPeerId);
    } else {
      await videoChat.startMedia(true, true);
    }
    setIsConnecting(false);
  };

  const handleEndCall = () => {
    videoChat.stopMedia();
  };

  const handleToggleMic = () => {
    videoChat.toggleMuteMic();
  };

  const handleToggleCamera = () => {
    videoChat.toggleCamera();
  };

  const isPlayer2Present = room && room.participants.length > 1;

  return (
    <div
      id="voice-video-chat-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col gap-3"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              Live Voice & Video Chat
              {avStatus.isCallActive && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                  ● ACTIVE
                </span>
              )}
            </h3>
            <span className="text-[10px] text-slate-400">P2P Low-Latency WebRTC Stream</span>
          </div>
        </div>

        {/* Call Toggle Button */}
        {!avStatus.isCallActive ? (
          <button
            id="start-av-call-button"
            onClick={handleStartCall}
            disabled={isConnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all disabled:opacity-50"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            {isConnecting ? "Connecting..." : "Join AV Call"}
          </button>
        ) : (
          <button
            id="end-av-call-button"
            onClick={handleEndCall}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Leave Call
          </button>
        )}
      </div>

      {/* Error / Permission Notice */}
      {errorMessage && (
        <div className="p-2 bg-rose-950/50 border border-rose-800/80 rounded-lg text-[11px] text-rose-300 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorMessage} (Check browser camera & microphone permissions)</span>
        </div>
      )}

      {/* Video Feeds Grid (Local & Remote) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Local Video Feed */}
        <div
          id="local-video-feed"
          className={`relative aspect-[4/3] bg-slate-950 rounded-lg border overflow-hidden transition-all flex flex-col items-center justify-center ${
            localAudioLvl > 15
              ? "border-indigo-500 shadow-md shadow-indigo-500/20"
              : "border-slate-800"
          }`}
        >
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover -scale-x-100 ${
              avStatus.isCameraOff || !avStatus.hasLocalStream ? "hidden" : "block"
            }`}
          />

          {/* Placeholder Avatar when Camera Off */}
          {(avStatus.isCameraOff || !avStatus.hasLocalStream) && (
            <div className="flex flex-col items-center justify-center p-2 text-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-300 transition-all ${
                  localAudioLvl > 15
                    ? "bg-indigo-600 ring-4 ring-indigo-400/40"
                    : "bg-slate-800"
                }`}
              >
                <User className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-medium">
                {avStatus.isCallActive ? "Camera Off" : "Not In Call"}
              </span>
            </div>
          )}

          {/* Local Name Badge & Audio Waveform */}
          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between px-1.5 py-0.5 bg-slate-900/85 backdrop-blur-sm rounded text-[9px] text-slate-200 border border-slate-700/60">
            <span className="font-semibold truncate max-w-[65px]">{myUsername} (You)</span>
            <div className="flex items-center gap-1">
              {avStatus.isMicMuted ? (
                <MicOff className="w-2.5 h-2.5 text-rose-400" />
              ) : (
                <div className="flex items-end gap-0.5 h-2.5">
                  <div
                    className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                    style={{ height: `${Math.max(2, (localAudioLvl / 100) * 10)}px` }}
                  />
                  <div
                    className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                    style={{ height: `${Math.max(2, (localAudioLvl / 100) * 12)}px` }}
                  />
                  <div
                    className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                    style={{ height: `${Math.max(2, (localAudioLvl / 100) * 8)}px` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Remote Video Feed */}
        <div
          id="remote-video-feed"
          className={`relative aspect-[4/3] bg-slate-950 rounded-lg border overflow-hidden transition-all flex flex-col items-center justify-center ${
            remoteAudioLvl > 15
              ? "border-emerald-500 shadow-md shadow-emerald-500/20"
              : "border-slate-800"
          }`}
        >
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${
              avStatus.hasRemoteStream ? "block" : "hidden"
            }`}
          />

          {/* Placeholder Avatar for Remote Peer */}
          {!avStatus.hasRemoteStream && (
            <div className="flex flex-col items-center justify-center p-2 text-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-300 transition-all ${
                  remoteAudioLvl > 15
                    ? "bg-emerald-600 ring-4 ring-emerald-400/40"
                    : "bg-slate-800"
                }`}
              >
                <User className="w-5 h-5" />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-medium">
                {isPlayer2Present ? "Waiting for video" : "Waiting for Player 2"}
              </span>
            </div>
          )}

          {/* Remote Name Badge & Audio Waveform */}
          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between px-1.5 py-0.5 bg-slate-900/85 backdrop-blur-sm rounded text-[9px] text-slate-200 border border-slate-700/60">
            <span className="font-semibold truncate max-w-[65px]">{opponentName}</span>
            <div className="flex items-center gap-1">
              <div className="flex items-end gap-0.5 h-2.5">
                <div
                  className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(2, (remoteAudioLvl / 100) * 10)}px` }}
                />
                <div
                  className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(2, (remoteAudioLvl / 100) * 12)}px` }}
                />
                <div
                  className="w-0.5 bg-emerald-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(2, (remoteAudioLvl / 100) * 8)}px` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AV Controls Bar */}
      {avStatus.isCallActive && (
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800/80">
          <button
            id="toggle-mic-button"
            onClick={handleToggleMic}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              avStatus.isMicMuted
                ? "bg-rose-900/60 border border-rose-600 text-rose-200"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            }`}
          >
            {avStatus.isMicMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
            {avStatus.isMicMuted ? "Unmute Mic" : "Mute Mic"}
          </button>

          <button
            id="toggle-camera-button"
            onClick={handleToggleCamera}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              avStatus.isCameraOff
                ? "bg-rose-900/60 border border-rose-600 text-rose-200"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            }`}
          >
            {avStatus.isCameraOff ? <VideoOff className="w-3.5 h-3.5 text-rose-400" /> : <Video className="w-3.5 h-3.5 text-indigo-400" />}
            {avStatus.isCameraOff ? "Turn On Camera" : "Turn Off Camera"}
          </button>
        </div>
      )}
    </div>
  );
};
