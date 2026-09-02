import React, { useState } from "react";
import {
  RotateCw,
  Play,
  Pause,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  Zap,
  Gamepad2,
  AlertTriangle,
  FileCode,
} from "lucide-react";
import { DEMO_ROMS } from "../emulator/demoRoms";
import { GameSyncState } from "../netplay/netplayController";
import { ConsoleSystem, DemoROM, PlayerRole, RoomInfo } from "../types";

interface GameChangeWorkflowProps {
  room: RoomInfo | null;
  myRole: PlayerRole;
  syncState: GameSyncState;
  onInitiateGameSwitch: (
    gameTitle: string,
    system: ConsoleSystem,
    gameId?: string,
    romBytes?: Uint8Array,
    romHash?: string
  ) => void;
}

export const GameChangeWorkflow: React.FC<GameChangeWorkflowProps> = ({
  room,
  myRole,
  syncState,
  onInitiateGameSwitch,
}) => {
  const [selectedDemoId, setSelectedDemoId] = useState<string>("snes-space-combat-2p");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const isHost = myRole === "player1" || (room && room.hostId === myRole);
  const is2PlayerSession = room && room.participants.length > 1;

  const handleSelectAndSwitch = (demo: DemoROM) => {
    setSelectedDemoId(demo.id);
    onInitiateGameSwitch(demo.title, demo.system, demo.id);
  };

  const steps = [
    {
      num: 1,
      title: "Host Pauses & Transmits ROM Hash",
      desc: "Host pauses emulation, computes ROM hash, and notifies peer of new game title.",
    },
    {
      num: 2,
      title: "Peer Loads & Verifies Checksum",
      desc: "Second client pauses emulation, loads identical ROM into RAM, and sends acknowledgment.",
    },
    {
      num: 3,
      title: "Frame 0 State Snapshot Transfer",
      desc: "Host saves clean Frame-0 state snapshot and transfers RAM/VRAM state to second client.",
    },
    {
      num: 4,
      title: "Rollback Reset & Synchronized Resume",
      desc: "Both emulators clear input buffers, reset clocks to Frame 0, and unpause in lockstep.",
    },
  ];

  return (
    <div
      id="game-change-workflow-panel"
      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-xl flex flex-col gap-3"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
            <RotateCw className={`w-4 h-4 ${syncState.phase !== "idle" ? "animate-spin text-amber-400" : ""}`} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              Host Game Switching & Re-sync
              {is2PlayerSession && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-300">
                  2P SESSION
                </span>
              )}
            </h3>
            <span className="text-[10px] text-slate-400">
              Zero-Desync Game Transfer & Re-synchronization Protocol
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {/* Active Sync Progress Banner */}
      {syncState.phase !== "idle" && (
        <div
          id="sync-progress-banner"
          className="p-3 bg-indigo-950/70 border border-indigo-500/60 rounded-lg flex flex-col gap-2 animate-pulse"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              {syncState.message}
            </span>
            <span className="font-mono text-xs font-semibold text-indigo-300">
              {syncState.progress}%
            </span>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 via-amber-400 to-emerald-400 h-1.5 transition-all duration-300"
              style={{ width: `${syncState.progress}%` }}
            />
          </div>
        </div>
      )}

      {isExpanded && (
        <>
          {/* Host Switch Trigger Controls */}
          {isHost ? (
            <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5 text-indigo-400" /> Choose New Game to Switch:
                </span>
                <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded font-medium">
                  Host Permissions Enabled
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_ROMS.map((demo) => (
                  <button
                    key={demo.id}
                    onClick={() => handleSelectAndSwitch(demo)}
                    disabled={syncState.phase !== "idle"}
                    className={`p-2 rounded-lg border text-left flex items-center justify-between transition-all text-xs disabled:opacity-50 ${
                      selectedDemoId === demo.id
                        ? "bg-indigo-900/40 border-indigo-500 text-white"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white"
                    }`}
                  >
                    <div className="truncate mr-1">
                      <span className="font-semibold block truncate">{demo.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">[{demo.system}] {demo.genre}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-2.5 bg-slate-950/40 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                You are playing as <strong className="text-slate-200">{myRole}</strong>. The room host controls game switching and will automatically sync your emulator.
              </span>
            </div>
          )}

          {/* Detailed 4-Step Resynchronization Workflow Diagram */}
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Synchronization Workflow Protocol:
            </span>

            <div className="grid grid-cols-1 gap-1.5">
              {steps.map((step) => {
                const isActive = syncState.stepIndex === step.num;
                const isCompleted = syncState.stepIndex > step.num || syncState.phase === "resumed";

                return (
                  <div
                    key={step.num}
                    className={`p-2 rounded-lg border transition-all flex items-start gap-2 text-xs ${
                      isActive
                        ? "bg-indigo-950/60 border-indigo-500 text-slate-100"
                        : isCompleted
                        ? "bg-emerald-950/20 border-emerald-500/30 text-slate-300"
                        : "bg-slate-950/40 border-slate-800/80 text-slate-400"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                        isCompleted
                          ? "bg-emerald-500 text-black"
                          : isActive
                          ? "bg-indigo-500 text-white animate-pulse"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : step.num}
                    </div>

                    <div className="flex-1">
                      <div className="font-semibold text-[11px] flex items-center justify-between">
                        <span>{step.title}</span>
                        {isActive && (
                          <span className="text-[9px] text-amber-300 font-mono font-semibold">
                            IN PROGRESS
                          </span>
                        )}
                        {isCompleted && (
                          <span className="text-[9px] text-emerald-400 font-mono font-semibold">
                            DONE
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
