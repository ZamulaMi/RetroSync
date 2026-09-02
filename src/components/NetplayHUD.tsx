import React from "react";
import {
  Activity,
  Zap,
  Gauge,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  RefreshCw,
} from "lucide-react";
import { NetplayMetrics, NetplayMode, PlayerRole } from "../types";

interface NetplayHUDProps {
  metrics: NetplayMetrics;
  mode: NetplayMode;
  localRole: PlayerRole;
  onForceResync?: () => void;
}

export const NetplayHUD: React.FC<NetplayHUDProps> = ({
  metrics,
  mode,
  localRole,
  onForceResync,
}) => {
  const getPingColor = (ping: number) => {
    if (ping === 0) return "text-slate-400";
    if (ping < 35) return "text-emerald-400";
    if (ping < 80) return "text-amber-400";
    return "text-rose-400";
  };

  const getPingBadge = (ping: number) => {
    if (ping === 0) return "bg-slate-800 text-slate-400";
    if (ping < 35) return "bg-emerald-950/60 text-emerald-300 border-emerald-500/40";
    if (ping < 80) return "bg-amber-950/60 text-amber-300 border-amber-500/40";
    return "bg-rose-950/60 text-rose-300 border-rose-500/40";
  };

  return (
    <div id="netplay-hud" className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-xl">
      {/* Title & Status */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Netplay Telemetry & Diagnostics
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {mode === "rollback" ? "GGPO Rollback" : "Lockstep Delay"}
          </span>
          <span
            className={`font-mono text-[11px] px-2 py-0.5 rounded border font-semibold ${
              localRole === "player1"
                ? "bg-indigo-950 text-indigo-300 border-indigo-500/40"
                : localRole === "player2"
                ? "bg-amber-950 text-amber-300 border-amber-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {localRole.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Grid of Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {/* Latency RTT */}
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> RTT Latency
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-base font-black font-mono ${getPingColor(metrics.ping)}`}>
              {metrics.ping > 0 ? metrics.ping : "--"}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">ms</span>
            {metrics.ping > 0 && (
              <span className={`text-[9px] font-bold px-1 py-0.2 rounded border ml-auto ${getPingBadge(metrics.ping)}`}>
                {metrics.ping < 35 ? "OPTIMAL" : metrics.ping < 80 ? "GOOD" : "HIGH"}
              </span>
            )}
          </div>
        </div>

        {/* Jitter */}
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Gauge className="w-3 h-3 text-cyan-400" /> Jitter
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-black font-mono text-cyan-300">
              {metrics.jitter > 0 ? `±${metrics.jitter}` : "0"}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">ms</span>
          </div>
        </div>

        {/* Rollback Events */}
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3 text-purple-400" /> Rollbacks / s
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-base font-black font-mono text-purple-300">
              {metrics.rollbacksPerSec}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              (max: {metrics.maxRollbackFrames}f)
            </span>
          </div>
        </div>

        {/* Checksum / Desync Health */}
        <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              {metrics.desyncCount === 0 ? (
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-3 h-3 text-rose-400" />
              )}
              State CRC
            </span>
            {onForceResync && (
              <button
                id="force-resync-btn"
                onClick={onForceResync}
                title="Force Authoritative Sync"
                className="text-slate-400 hover:text-white"
              >
                <RefreshCw className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-xs font-bold font-mono ${
                metrics.desyncCount === 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {metrics.desyncCount === 0 ? "SYNCHRONIZED" : `${metrics.desyncCount} DESYNC`}
            </span>
          </div>
        </div>
      </div>

      {/* Frame Timeline & Channel Mode */}
      <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/80 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-300">
            <span className="text-slate-500">Local Frame:</span>
            <span className="font-mono font-bold text-white">{metrics.localFrame}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-300">
            <span className="text-slate-500">Remote Frame:</span>
            <span className="font-mono font-bold text-indigo-300">{metrics.remoteFrame}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-300">
            <span className="text-slate-500">Advantage:</span>
            <span
              className={`font-mono font-bold ${
                metrics.frameAdvantage > 4 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {metrics.frameAdvantage >= 0 ? `+${metrics.frameAdvantage}` : metrics.frameAdvantage}f
            </span>
          </div>
        </div>

        {/* Transport Type */}
        <div className="flex items-center gap-1 font-mono text-[11px]">
          {metrics.p2pConnected ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
              <Wifi className="w-3.5 h-3.5" /> WebRTC DataChannel (P2P)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /> WebSocket Relay
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
