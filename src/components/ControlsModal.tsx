import React, { useState, useEffect } from "react";
import { X, Gamepad, Keyboard, RotateCcw, Check } from "lucide-react";
import { GamepadButtonMap } from "../types";

interface ControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  p1KeyMap: GamepadButtonMap;
  p2KeyMap: GamepadButtonMap;
  onUpdateP1KeyMap: (map: GamepadButtonMap) => void;
  onUpdateP2KeyMap: (map: GamepadButtonMap) => void;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({
  isOpen,
  onClose,
  p1KeyMap,
  p2KeyMap,
  onUpdateP1KeyMap,
  onUpdateP2KeyMap,
}) => {
  const [activeTab, setActiveTab] = useState<"p1" | "p2">("p1");
  const [listeningKey, setListeningKey] = useState<string | null>(null);
  const [connectedGamepad, setConnectedGamepad] = useState<string | null>(null);

  useEffect(() => {
    const checkGamepad = () => {
      if (navigator.getGamepads) {
        const gps = navigator.getGamepads();
        const found = Array.from(gps).find((g) => g !== null && g.connected);
        if (found) {
          setConnectedGamepad(found.id);
        } else {
          setConnectedGamepad(null);
        }
      }
    };

    checkGamepad();
    window.addEventListener("gamepadconnected", checkGamepad);
    window.addEventListener("gamepaddisconnected", checkGamepad);

    return () => {
      window.removeEventListener("gamepadconnected", checkGamepad);
      window.removeEventListener("gamepaddisconnected", checkGamepad);
    };
  }, []);

  useEffect(() => {
    if (!listeningKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const code = e.code;
      const target = listeningKey;

      if (activeTab === "p1") {
        onUpdateP1KeyMap({
          ...p1KeyMap,
          [target]: code,
        });
      } else {
        onUpdateP2KeyMap({
          ...p2KeyMap,
          [target]: code,
        });
      }
      setListeningKey(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [listeningKey, activeTab, p1KeyMap, p2KeyMap, onUpdateP1KeyMap, onUpdateP2KeyMap]);

  if (!isOpen) return null;

  const currentMap = activeTab === "p1" ? p1KeyMap : p2KeyMap;

  const buttonLabels: Array<{ key: keyof GamepadButtonMap; label: string; desc: string }> = [
    { key: "up", label: "D-Pad Up", desc: "Move character up / climb" },
    { key: "down", label: "D-Pad Down", desc: "Crouch / move down" },
    { key: "left", label: "D-Pad Left", desc: "Move character left" },
    { key: "right", label: "D-Pad Right", desc: "Move character right" },
    { key: "a", label: "Button A", desc: "Primary action / Jump" },
    { key: "b", label: "Button B", desc: "Secondary action / Attack / Run" },
    { key: "x", label: "Button X (SNES/GBA)", desc: "Special action" },
    { key: "y", label: "Button Y (SNES/GBA)", desc: "Secondary special" },
    { key: "select", label: "Select", desc: "Menu select / change weapon" },
    { key: "start", label: "Start / Pause", desc: "Game pause & start" },
    { key: "turboA", label: "Turbo A (30Hz)", desc: "Rapid autofire A" },
    { key: "turboB", label: "Turbo B (30Hz)", desc: "Rapid autofire B" },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div
        id="controls-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scale-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Gamepad className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Controls & Input Mapping</h2>
          </div>
          <button
            id="close-controls-modal-btn"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Gamepad Detection Banner */}
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Gamepad className="w-4 h-4 text-emerald-400" /> Gamepad API:
          </span>
          <span className="font-semibold text-emerald-400">
            {connectedGamepad ? connectedGamepad.slice(0, 32) : "Plug in any USB/Bluetooth Controller"}
          </span>
        </div>

        {/* Player Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30">
          <button
            onClick={() => {
              setActiveTab("p1");
              setListeningKey(null);
            }}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === "p1"
                ? "border-indigo-500 text-indigo-300 bg-indigo-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Player 1 (WASD + Z/X або J/K)
          </button>
          <button
            onClick={() => {
              setActiveTab("p2");
              setListeningKey(null);
            }}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              activeTab === "p2"
                ? "border-amber-500 text-amber-300 bg-amber-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Player 2 (Arrows + Numpad 1/2)
          </button>
        </div>

        {/* Remap Key List */}
        <div className="p-4 max-h-[360px] overflow-y-auto space-y-2">
          {buttonLabels.map((btn) => {
            const currentCode = currentMap[btn.key] || "None";
            const isListening = listeningKey === btn.key;

            return (
              <div
                key={btn.key}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs"
              >
                <div>
                  <span className="font-bold text-white block">{btn.label}</span>
                  <span className="text-[11px] text-slate-400">{btn.desc}</span>
                </div>

                <button
                  id={`remap-${activeTab}-${btn.key}`}
                  onClick={() => setListeningKey(btn.key)}
                  className={`px-3 py-1.5 rounded font-mono font-bold text-xs border transition-all ${
                    isListening
                      ? "bg-amber-500 text-slate-950 border-amber-300 animate-pulse"
                      : "bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700"
                  }`}
                >
                  {isListening ? "Press Key..." : currentCode}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> Done
          </button>
        </div>
      </div>
    </div>
  );
};
