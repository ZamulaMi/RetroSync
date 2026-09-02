import React from "react";
import { Users, Wifi, WifiOff, Crown, Gamepad2, Activity, Zap, RefreshCw } from "lucide-react";
import { NetplayMetrics, NetplayMode, PlayerRole, RoomInfo } from "../types";

interface PlayerStatusProps {
  room: RoomInfo | null;
  metrics: NetplayMetrics;
  myRole: PlayerRole;
  myUsername: string;
  netplayMode: NetplayMode;
  onForceResync?: () => void;
}

export const PlayerStatus: React.FC<PlayerStatusProps> = ({
  room,
  metrics,
  myRole,
  myUsername,
  netplayMode,
  onForceResync,
}) => {
  const p1 = room?.participants.find((p) => p.role === "player1");
  const p2 = room?.participants.find((p) => p.role === "player2");

  const getStatusBadge = (player: typeof p1, isP2: boolean) => {
    if (!room) {
      if (!isP2) {
        return {
          label: "Connected (Solo)",
          color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          dot: "bg-emerald-400",
        };
      }
      return {
        label: "Disconnected",
        color: "bg-slate-800 text-slate-400 border-slate-700",
        dot: "bg-slate-500",
      };
    }

    if (!player) {
      return {
        label: "Disconnected (Slot Open)",
        color: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        dot: "bg-amber-400 animate-pulse",
      };
    }

    if (metrics.desyncCount > 0 && isP2) {
      return {
        label: "Syncing / Rollback",
        color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
        dot: "bg-yellow-400 animate-pulse",
      };
    }

    if (metrics.p2pConnected || room.participants.length > 1) {
      return {
        label: "Connected (P2P)",
        color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        dot: "bg-emerald-400 animate-pulse",
      };
    }

    return {
      label: "Connected",
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      dot: "bg-emerald-400",
    };
  };

  const p1Status = getStatusBadge(p1, false);
  const p2Status = getStatusBadge(p2, true);

  return (
    <div
      id="player-status-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">Player Connection Status</h3>
            <span className="text-[10px] text-slate-400">2-Player Netplay Session</span>
          </div>
        </div>

        {metrics.desyncCount > 0 && onForceResync && (
          <button
            onClick={onForceResync}
            className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 rounded text-[10px] font-semibold transition-all"
            title="Force Full State Re-sync"
          >
            <RefreshCw className="w-3 h-3" /> Re-sync
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Player 1 (Host) Card */}
        <div
          id="player1-status-card"
          className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
            myRole === "player1"
              ? "bg-indigo-950/30 border-indigo-500/60 shadow-sm"
              : "bg-slate-950/60 border-slate-800"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Crown className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-200">
                    {p1?.username || (myRole === "player1" ? myUsername : "Player 1 (Host)")}
                  </span>
                  {myRole === "player1" && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 rounded font-mono">
                      YOU
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">Player 1 (Host)</span>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${p1Status.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${p1Status.dot}`} />
              {p1Status.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
            <div>
              <span className="text-slate-500 block">Ping:</span>
              <span className="font-mono font-semibold text-slate-200">
                {metrics.ping > 0 ? `${metrics.ping}ms` : "0ms (Host)"}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Input Delay:</span>
              <span className="font-mono font-semibold text-slate-200">0 Frames (Instant)</span>
            </div>
          </div>
        </div>

        {/* Player 2 (Peer / Client) Card */}
        <div
          id="player2-status-card"
          className={`p-3 rounded-lg border flex flex-col justify-between transition-all ${
            myRole === "player2"
              ? "bg-indigo-950/30 border-indigo-500/60 shadow-sm"
              : "bg-slate-950/60 border-slate-800"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-md bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Gamepad2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-200">
                    {p2?.username || (myRole === "player2" ? myUsername : "Player 2 (Peer)")}
                  </span>
                  {myRole === "player2" && (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1 rounded font-mono">
                      YOU
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">Player 2 (Challenger)</span>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${p2Status.color}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${p2Status.dot}`} />
              {p2Status.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
            <div>
              <span className="text-slate-500 block">Ping / RTT:</span>
              <span className="font-mono font-semibold text-slate-200">
                {metrics.ping > 0 ? `${metrics.ping}ms` : "Waiting..."}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Netplay Engine:</span>
              <span className="font-mono font-semibold text-indigo-300 capitalize">
                {netplayMode} (0 delay)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
