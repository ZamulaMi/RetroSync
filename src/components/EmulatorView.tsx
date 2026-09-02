import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Save,
  Download,
  Flame,
  Gamepad,
  Volume2,
  Keyboard,
  Menu,
} from "lucide-react";
import { UniversalEmulator } from "../emulator/emulatorManager";
import { NetplayController } from "../netplay/netplayController";
import { ConsoleSystem, ScreenFilter } from "../types";
import { TouchGamepad } from "./TouchGamepad";

interface EmulatorViewProps {
  controller: NetplayController;
  system: ConsoleSystem;
  currentTitle?: string;
  filter: ScreenFilter;
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  activeSaveSlot: number;
  setActiveSaveSlot: (slot: number) => void;
  onOpenMenu?: () => void;
}

export const EmulatorView: React.FC<EmulatorViewProps> = ({
  controller,
  system,
  currentTitle,
  filter,
  onSaveState,
  onLoadState,
  activeSaveSlot,
  setActiveSaveSlot,
  onOpenMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isAudioStarted, setIsAudioStarted] = useState(false);
  const [speed, setSpeed] = useState<number>(1.0);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return (
        "ontouchstart" in window ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
        window.innerWidth < 1024
      );
    }
    return false;
  });
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      controller.emulator.attachCanvas(canvasRef.current);
    }
  }, [controller, system]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if ((e.key === "Escape" || e.code === "KeyM" || e.key === "F1") && onOpenMenu) {
        e.preventDefault();
        onOpenMenu();
      }

      if (e.key === "F2" || (e.ctrlKey && e.code === "KeyR" && !e.shiftKey)) {
        // Prevent browser page reload on Ctrl+R or F2 if playing game, and reset game instead
        if (isAudioStarted) {
          e.preventDefault();
          handleReset();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenMenu, isAudioStarted, controller]);

  const triggerButtonPress = (button: keyof typeof controller.touchState) => {
    controller.touchState[button] = true;
    setTimeout(() => {
      controller.touchState[button] = false;
    }, 150);
  };

  const handleStartAudio = async () => {
    await controller.emulator.initAudio();
    setIsAudioStarted(true);
    controller.start();
  };

  const handleTogglePause = () => {
    controller.emulator.isPaused = !controller.emulator.isPaused;
    showToast(controller.emulator.isPaused ? "Пауза" : "Гру відновлено");
  };

  const handleReset = () => {
    controller.reset();
    showToast("Гру перезапущено (Reset)");
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    controller.emulator.speedMultiplier = newSpeed;
    showToast(`Speed: ${newSpeed}x`);
  };

  const showToast = (msg: string) => {
    setFlashMessage(msg);
    setTimeout(() => setFlashMessage(null), 1500);
  };

  // Screen scaling mode: "4:3" (Standard CRT TV), "1:1" (Pixel-Perfect), "stretch" (Full Width)
  const [scaleMode, setScaleMode] = useState<"4:3" | "1:1" | "stretch">("4:3");

  // Determine Aspect Ratio based on system & scale mode
  const getAspectRatioClass = () => {
    if (scaleMode === "stretch") {
      return "w-full max-w-[620px] aspect-auto h-[320px] sm:h-[420px]";
    }
    switch (system) {
      case "GB":
      case "GBC":
        return "aspect-[160/144] max-w-[440px] w-full";
      case "GBA":
        return "aspect-[240/160] max-w-[540px] w-full";
      case "SNES":
      case "NES":
      default:
        if (scaleMode === "1:1") {
          return "aspect-[256/240] max-w-[520px] w-full";
        }
        return "aspect-[4/3] max-w-[560px] w-full";
    }
  };

  const getCanvasObjectFit = () => {
    return "w-full h-full block";
  };

  const getFilterStyle = (): string => {
    switch (filter) {
      case "crt-scanlines":
        return "crt-scanlines-effect";
      case "lcd-grid":
        return "lcd-grid-effect";
      case "gameboy-green":
        return "gameboy-green-effect";
      case "smooth-bilinear":
        return "image-rendering-auto";
      case "pixel-perfect":
      default:
        return "image-rendering-pixelated";
    }
  };

  const getCanvasDimensions = () => {
    if (system === "GB" || system === "GBC") {
      return { width: 160, height: 144 };
    }
    return { width: 256, height: 240 };
  };

  const dims = getCanvasDimensions();

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full bg-slate-950 p-2 sm:p-4 rounded-xl border border-slate-800/80 shadow-2xl overflow-hidden select-none">
      {/* Screen Container */}
      <div
        id="emulator-screen-wrapper"
        className={`relative ${getAspectRatioClass()} bg-black flex items-center justify-center overflow-hidden transition-all duration-200 mx-auto rounded-md touch-none select-none`}
        style={{ touchAction: "none" }}
      >
        <canvas
          id="emulator-canvas"
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className={`${getCanvasObjectFit()} ${getFilterStyle()} block touch-none`}
          style={{ touchAction: "none" }}
          tabIndex={0}
        />

        {/* Shader Overlay for Scanlines / CRT effect */}
        {filter === "crt-scanlines" && (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.4)_50%)] bg-[length:100%_4px] opacity-70" />
        )}

        {/* Overlay Toast Notification */}
        {flashMessage && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-indigo-600/90 text-white font-mono text-xs px-3 py-1.5 rounded-md shadow-lg border border-indigo-400 backdrop-blur-sm animate-fade-in pointer-events-none z-30">
            {flashMessage}
          </div>
        )}

        {/* In-Game Paused Screen Overlay */}
        {isAudioStarted && controller.emulator.isPaused && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-15 select-none animate-fade-in">
            <div className="bg-slate-900/90 border border-slate-700 p-4 rounded-2xl shadow-2xl flex flex-col items-center max-w-xs w-full gap-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <Pause className="w-4 h-4" /> Гра призупинена
              </div>
              <div className="flex flex-col gap-2 w-full">
                <button
                  id="paused-overlay-resume-btn"
                  onClick={handleTogglePause}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> Продовжити гру
                </button>
                {onOpenMenu && (
                  <button
                    id="paused-overlay-open-menu-btn"
                    onClick={onOpenMenu}
                    className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <Menu className="w-3.5 h-3.5" /> Головне меню гри
                  </button>
                )}
                <button
                  id="paused-overlay-reset-btn"
                  onClick={handleReset}
                  className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Перезапустити
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Start Game & Audio Splash (if not started) */}
        {!isAudioStarted && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center z-20">
            <div className="bg-indigo-600/20 p-4 rounded-full border border-indigo-500/30 mb-3 animate-pulse">
              <Gamepad className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1">Interactive ROM Emulator</h2>
            <p className="text-xs text-slate-300 max-w-sm mb-4">
              Click below to unlock Web Audio synthesis and start low-latency P2P netplay.
            </p>
            <button
              id="start-audio-btn"
              onClick={handleStartAudio}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-lg shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Volume2 className="w-4 h-4" /> Start Game & Audio
            </button>
          </div>
        )}
      </div>

      {/* On-Screen Dedicated Touch Gamepad (Positioned DIRECTLY underneath the screen) */}
      {showTouchControls && (
        <div className="w-full mt-2 sm:mt-3">
          <TouchGamepad
            controller={controller}
            system={system}
            onOpenMenu={onOpenMenu}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Quick Action Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 w-full mt-3 px-1">
        {/* Playback Controls, Menu & Scale Mode */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {onOpenMenu && (
            <button
              id="toolbar-open-menu-btn"
              onClick={onOpenMenu}
              className="px-2.5 py-1 text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded flex items-center gap-1.5 text-xs font-bold transition-colors"
              title="Головне меню / Вибір гри (ESC)"
            >
              <Menu className="w-3.5 h-3.5" />
              <span>Меню</span>
            </button>
          )}
          <button
            id="pause-resume-btn"
            onClick={handleTogglePause}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Pause / Resume"
          >
            {controller.emulator.isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            id="reset-emulator-btn"
            onClick={handleReset}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Перезапустити гру / Reset Game (F2)"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
          </button>

          {/* Speed toggles */}
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <button
            id="speed-1x-btn"
            onClick={() => handleSpeedChange(1.0)}
            className={`px-2 py-0.5 text-xs font-mono rounded ${
              speed === 1.0 ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            1x
          </button>
          <button
            id="speed-2x-btn"
            onClick={() => handleSpeedChange(2.0)}
            className={`px-2 py-0.5 text-xs font-mono rounded flex items-center gap-0.5 ${
              speed === 2.0 ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
            }`}
            title="Turbo 2x Speed"
          >
            <FastForward className="w-3 h-3" /> 2x
          </button>

          {/* Screen Fit Mode Toggle */}
          <div className="h-4 w-px bg-slate-800 mx-1" />
          <button
            id="screen-fit-btn"
            onClick={() => {
              const nextMode = scaleMode === "4:3" ? "1:1" : scaleMode === "1:1" ? "stretch" : "4:3";
              setScaleMode(nextMode);
              showToast(nextMode === "4:3" ? "Aspect: 4:3 CRT Standard" : nextMode === "1:1" ? "Aspect: 1:1 Pixel Match" : "Aspect: Full Fill");
            }}
            className={`px-2 py-0.5 text-[11px] font-mono rounded flex items-center gap-1 ${
              scaleMode === "4:3"
                ? "bg-slate-800 text-indigo-300 font-semibold"
                : scaleMode === "1:1"
                ? "bg-indigo-600 text-white font-semibold"
                : "bg-slate-800 text-slate-300"
            }`}
            title="Toggle Screen Aspect (4:3 CRT / 1:1 Pixel Match / Full Fill)"
          >
            {scaleMode === "4:3" ? "4:3 CRT" : scaleMode === "1:1" ? "1:1 Pixel" : "Full Fill"}
          </button>
        </div>

        {/* Quick Gamepad Buttons (START, SELECT, A, B) */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            id="quick-btn-start"
            onClick={() => {
              triggerButtonPress("start");
              showToast("Pressed START");
            }}
            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded font-mono font-bold text-[11px] transition-all active:scale-95 cursor-pointer"
            title="Press START (Enter)"
          >
            START
          </button>
          <button
            id="quick-btn-select"
            onClick={() => {
              triggerButtonPress("select");
              showToast("Pressed SELECT");
            }}
            className="px-2 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded font-mono font-bold text-[11px] transition-all active:scale-95 cursor-pointer"
            title="Press SELECT (Shift)"
          >
            SELECT
          </button>
          <button
            id="quick-btn-b"
            onClick={() => {
              triggerButtonPress("b");
              showToast("Pressed B");
            }}
            className="w-7 h-7 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-full font-bold text-xs flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="Press B (Z)"
          >
            B
          </button>
          <button
            id="quick-btn-a"
            onClick={() => {
              triggerButtonPress("a");
              showToast("Pressed A");
            }}
            className="w-7 h-7 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-full font-bold text-xs flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            title="Press A (X)"
          >
            A
          </button>
        </div>

        {/* Save State Quick Slots */}
        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <span className="text-slate-400 font-medium hidden sm:inline">State Slot:</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((slot) => (
              <button
                key={slot}
                onClick={() => setActiveSaveSlot(slot)}
                className={`w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs transition-colors ${
                  activeSaveSlot === slot
                    ? "bg-indigo-600 text-white border border-indigo-400"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                {slot}
              </button>
            ))}
          </div>

          <button
            id="quicksave-btn"
            onClick={() => {
              onSaveState(activeSaveSlot);
              showToast(`Saved to Slot #${activeSaveSlot}`);
            }}
            className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 rounded border border-emerald-500/30 flex items-center gap-1 transition-colors font-medium"
            title="Quick Save (F1)"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button>
          <button
            id="quickload-btn"
            onClick={() => {
              onLoadState(activeSaveSlot);
              showToast(`Loaded Slot #${activeSaveSlot}`);
            }}
            className="px-2 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded border border-amber-500/30 flex items-center gap-1 transition-colors font-medium"
            title="Quick Load (F2)"
          >
            <Download className="w-3.5 h-3.5" /> Load
          </button>
        </div>

        {/* Mobile Touch Controller Toggle */}
        <button
          id="touch-controls-toggle-btn"
          onClick={() => setShowTouchControls(!showTouchControls)}
          className={`p-1.5 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer font-medium transition-colors ${
            showTouchControls
              ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
              : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Увімкнути/Вимкнути Сенсорний Пад"
        >
          <Gamepad className="w-4 h-4" />
          <span>{showTouchControls ? "Сховати Touch Pad" : "Touch Pad"}</span>
        </button>
      </div>

      {/* Primary Visual Controls Legend & Instructions Bar (Placed underneath Touch Pad) */}
      <div
        id="quick-controls-legend"
        className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-2 mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mr-1 flex items-center gap-1">
            <Keyboard className="w-3.5 h-3.5 text-indigo-400" /> Керування:
          </span>
          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-slate-400 text-[11px]">Рух:</span>
            <kbd className="font-mono font-bold text-indigo-300">WASD</kbd>
            <span className="text-slate-500 text-[10px]">або</span>
            <kbd className="font-mono font-bold text-indigo-300">↑ ↓ ← →</kbd>
          </div>
          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-rose-400 font-semibold text-[11px]">B (Атака):</span>
            <kbd className="font-mono font-bold text-rose-300">Z</kbd>
            <span className="text-slate-500 text-[10px]">/</span>
            <kbd className="font-mono font-bold text-rose-300">J</kbd>
          </div>
          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-emerald-400 font-semibold text-[11px]">A (Стрибок):</span>
            <kbd className="font-mono font-bold text-emerald-300">X</kbd>
            <span className="text-slate-500 text-[10px]">/</span>
            <kbd className="font-mono font-bold text-emerald-300">K</kbd>
            <span className="text-slate-500 text-[10px]">/</span>
            <kbd className="font-mono font-bold text-emerald-300">Space</kbd>
          </div>
          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-amber-400 font-semibold text-[11px]">START:</span>
            <kbd className="font-mono font-bold text-amber-300">Enter</kbd>
          </div>
          <div className="inline-flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
            <span className="text-sky-400 font-semibold text-[11px]">SELECT:</span>
            <kbd className="font-mono font-bold text-sky-300">Shift</kbd>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenMenu && (
            <button
              id="legend-menu-btn"
              onClick={onOpenMenu}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 transition-colors cursor-pointer"
            >
              <Menu className="w-3.5 h-3.5" />
              Меню (ESC)
            </button>
          )}
          <button
            onClick={() => setShowTouchControls(!showTouchControls)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium flex items-center gap-1 cursor-pointer"
          >
            <Gamepad className="w-3.5 h-3.5" />
            {showTouchControls ? "Сховати сенсорний пад" : "Сенсорний пад"}
          </button>
        </div>
      </div>
    </div>
  );
};
