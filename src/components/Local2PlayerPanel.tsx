import React, { useState, useEffect } from "react";
import {
  Users,
  Gamepad,
  Keyboard,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  Layers,
} from "lucide-react";
import { ControllerState, GamepadButtonMap } from "../types";
import { NetplayController } from "../netplay/netplayController";

interface Local2PlayerPanelProps {
  controller: NetplayController;
  p1KeyMap: GamepadButtonMap;
  p2KeyMap: GamepadButtonMap;
  onOpenControls: () => void;
}

export const Local2PlayerPanel: React.FC<Local2PlayerPanelProps> = ({
  controller,
  p1KeyMap,
  p2KeyMap,
  onOpenControls,
}) => {
  const [touchAssignment, setTouchAssignment] = useState<1 | 2>(
    controller.touchPlayerAssignment || 1
  );
  const [connectedGamepads, setConnectedGamepads] = useState<
    Array<{ index: number; id: string }>
  >([]);

  // Live input states for glowing visual indicators
  const [p1State, setP1State] = useState<ControllerState>(controller.p1ActiveState);
  const [p2State, setP2State] = useState<ControllerState>(controller.p2ActiveState);

  // Subscribe to controller input activity
  useEffect(() => {
    controller.onInputActivity = (p1, p2) => {
      setP1State({ ...p1 });
      setP2State({ ...p2 });
    };

    return () => {
      controller.onInputActivity = null;
    };
  }, [controller]);

  // Detect connected gamepads
  useEffect(() => {
    const updateGamepads = () => {
      if (typeof navigator !== "undefined" && navigator.getGamepads) {
        const gps = navigator.getGamepads();
        const active: Array<{ index: number; id: string }> = [];
        for (let i = 0; i < gps.length; i++) {
          const gp = gps[i];
          if (gp && gp.connected) {
            active.push({ index: i, id: gp.id });
          }
        }
        setConnectedGamepads(active);
      }
    };

    updateGamepads();
    window.addEventListener("gamepadconnected", updateGamepads);
    window.addEventListener("gamepaddisconnected", updateGamepads);
    const interval = setInterval(updateGamepads, 2000);

    return () => {
      window.removeEventListener("gamepadconnected", updateGamepads);
      window.removeEventListener("gamepaddisconnected", updateGamepads);
      clearInterval(interval);
    };
  }, []);

  const handleSetTouchAssignment = (player: 1 | 2) => {
    setTouchAssignment(player);
    controller.touchPlayerAssignment = player;
  };

  return (
    <div id="local-2player-station" className="flex flex-col gap-3">
      {/* Station Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Гра на одному ПК (2 гравці)
              </h2>
              <p className="text-[11px] text-slate-400">
                Обидва керування підключено та активні одночасно
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            60 FPS Local
          </span>
        </div>

        <div className="text-[11px] text-slate-300 bg-slate-950/70 rounded-lg p-2 border border-slate-800/80 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            Грайте вдвох на одній клавіатурі або підключіть два USB/Bluetooth геймпади.
            Окремі незалежні клавіші для кожного гравця без залипань.
          </span>
        </div>
      </div>

      {/* PLAYER 1 CONTROLS CARD */}
      <div
        id="player-1-control-card"
        className="bg-slate-900/80 border border-indigo-500/40 rounded-xl p-3 shadow-md transition-all hover:border-indigo-500/60"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
              Гравець 1 (Player 1)
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {connectedGamepads[0] ? (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                <Gamepad className="w-3 h-3" /> Gamepad #1
              </span>
            ) : (
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Keyboard className="w-3 h-3" /> Клавіатура
              </span>
            )}
            {touchAssignment === 1 && (
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Smartphone className="w-3 h-3" /> Touch
              </span>
            )}
          </div>
        </div>

        {/* Keybindings Grid */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-2.5">
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Рух (D-Pad):</span>
            <span className="font-mono font-bold text-white tracking-wider">W / A / S / D</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Дії (B / A):</span>
            <span className="font-mono font-bold text-indigo-300">Z (J) / X (K)</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Special (Y / X):</span>
            <span className="font-mono font-bold text-slate-300">V / C</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Select / Start:</span>
            <span className="font-mono font-bold text-slate-300">Shift / Пробіл</span>
          </div>
        </div>

        {/* Live Input Visualizer for P1 */}
        <div className="bg-slate-950/90 rounded-lg p-2 border border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-semibold">Сигнал P1:</span>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p1State.up || p1State.down || p1State.left || p1State.right
                  ? "bg-indigo-600 text-white font-bold shadow-[0_0_8px_rgba(99,102,241,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              DPAD
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p1State.b
                  ? "bg-red-500 text-white font-bold shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              B
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p1State.a
                  ? "bg-emerald-500 text-white font-bold shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              A
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p1State.start
                  ? "bg-amber-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              START
            </span>
          </div>
        </div>
      </div>

      {/* PLAYER 2 CONTROLS CARD */}
      <div
        id="player-2-control-card"
        className="bg-slate-900/80 border border-amber-500/40 rounded-xl p-3 shadow-md transition-all hover:border-amber-500/60"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Гравець 2 (Player 2)
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            {connectedGamepads[1] ? (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                <Gamepad className="w-3 h-3" /> Gamepad #2
              </span>
            ) : (
              <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Keyboard className="w-3 h-3" /> Стрілки / Num
              </span>
            )}
            {touchAssignment === 2 && (
              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                <Smartphone className="w-3 h-3" /> Touch
              </span>
            )}
          </div>
        </div>

        {/* Keybindings Grid */}
        <div className="grid grid-cols-2 gap-1.5 text-[11px] mb-2.5">
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Рух (D-Pad):</span>
            <span className="font-mono font-bold text-white tracking-wider">↑ / ↓ / ← / →</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Дії (B / A):</span>
            <span className="font-mono font-bold text-amber-300">Num 1 (L) / Num 2 (;)</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Special (Y / X):</span>
            <span className="font-mono font-bold text-slate-300">Num 4 (O) / Num 5 (P)</span>
          </div>
          <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Select / Start:</span>
            <span className="font-mono font-bold text-slate-300">Num 0 / Num Enter</span>
          </div>
        </div>

        {/* Live Input Visualizer for P2 */}
        <div className="bg-slate-950/90 rounded-lg p-2 border border-slate-800/80 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-semibold">Сигнал P2:</span>
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p2State.up || p2State.down || p2State.left || p2State.right
                  ? "bg-amber-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              ARROWS
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p2State.b
                  ? "bg-red-500 text-white font-bold shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              B
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p2State.a
                  ? "bg-emerald-500 text-white font-bold shadow-[0_0_8px_rgba(16,185,129,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              A
            </span>
            <span
              className={`px-1.5 py-0.5 rounded transition-all ${
                p2State.start
                  ? "bg-amber-500 text-slate-950 font-bold shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              START
            </span>
          </div>
        </div>
      </div>

      {/* HARDWARE GAMEPAD & TOUCHPAD ASSIGNMENT */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1 font-semibold">
            <Gamepad className="w-3.5 h-3.5 text-indigo-400" />
            Підключені геймпади:
          </span>
          <span className="font-bold text-white font-mono">
            {connectedGamepads.length > 0
              ? `${connectedGamepads.length} підключено`
              : "0 підключено"}
          </span>
        </div>

        {connectedGamepads.length > 0 ? (
          <div className="space-y-1">
            {connectedGamepads.map((gp, i) => (
              <div
                key={gp.index}
                className="flex items-center justify-between bg-slate-950 p-1.5 rounded border border-slate-800 text-[11px]"
              >
                <span className="text-slate-300 truncate max-w-[160px] font-mono">
                  {gp.id.slice(0, 24)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                    i === 0
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {i === 0 ? "Гравець 1" : "Гравець 2"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            Підключіть будь-які USB або Bluetooth геймпади — вони автоматично призначаться Гравцю 1 та Гравцю 2.
          </p>
        )}

        {/* Touch Pad Assignment */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1 text-[11px]">
            <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
            Сенсорний екран:
          </span>
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => handleSetTouchAssignment(1)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                touchAssignment === 1
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Гравець 1
            </button>
            <button
              onClick={() => handleSetTouchAssignment(2)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                touchAssignment === 2
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Гравець 2
            </button>
          </div>
        </div>
      </div>

      {/* QUICK REMAP BUTTON */}
      <button
        id="open-controls-from-local2p-btn"
        onClick={onOpenControls}
        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
      >
        <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
        Налаштувати клавіші обох гравців
      </button>
    </div>
  );
};
