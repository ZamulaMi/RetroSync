/**
 * Dedicated On-Screen Touch Gamepad
 * Optimized specifically for touchscreens and mobile devices:
 * - Positioned directly beneath the screen canvas.
 * - Complete screen movement & scroll lock (touch-action: none, preventDefault).
 * - Continuous 8-directional thumb tracking (Smooth Joystick & Precision D-Pad modes).
 * - True multi-touch support for simultaneous movement + action button combos.
 * - Turbo Fire buttons and Haptic feedback.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Gamepad2,
  Compass,
  Zap,
  RotateCcw,
  Menu,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { NetplayController } from "../netplay/netplayController";
import { ConsoleSystem } from "../types";

interface TouchGamepadProps {
  controller: NetplayController;
  system: ConsoleSystem;
  onOpenMenu?: () => void;
  onReset?: () => void;
}

type StickMode = "dpad" | "joystick";
type PadSize = "compact" | "normal" | "large";

export const TouchGamepad: React.FC<TouchGamepadProps> = ({
  controller,
  system,
  onOpenMenu,
  onReset,
}) => {
  const [stickMode, setStickMode] = useState<StickMode>("joystick");
  const [padSize, setPadSize] = useState<PadSize>("normal");
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(true);

  // Active state for visual highlighting
  const [activeDirections, setActiveDirections] = useState<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }>({ up: false, down: false, left: false, right: false });

  const [activeButtons, setActiveButtons] = useState<{
    a: boolean;
    b: boolean;
    x: boolean;
    y: boolean;
    l: boolean;
    r: boolean;
    turboA: boolean;
    turboB: boolean;
    select: boolean;
    start: boolean;
  }>({
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    turboA: false,
    turboB: false,
    select: false,
    start: false,
  });

  // Joystick knob offset position in px from center
  const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState<boolean>(false);

  // Turbo timers
  const turboIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTurboButtonsRef = useRef<{ a: boolean; b: boolean }>({ a: false, b: false });

  // Refs for tracking touches
  const stickAreaRef = useRef<HTMLDivElement>(null);
  const stickTouchIdRef = useRef<number | null>(null);
  const actionAreaRef = useRef<HTMLDivElement>(null);

  // Trigger brief haptic feedback on supported touch devices
  const triggerHaptic = useCallback(
    (durationMs = 12) => {
      if (hapticsEnabled && typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(durationMs);
        } catch {
          // ignore error if vibration not permitted
        }
      }
    },
    [hapticsEnabled]
  );

  // Setup Turbo button cycle
  useEffect(() => {
    let toggle = false;
    turboIntervalRef.current = setInterval(() => {
      toggle = !toggle;
      if (activeTurboButtonsRef.current.a) {
        controller.touchState.a = toggle;
      }
      if (activeTurboButtonsRef.current.b) {
        controller.touchState.b = toggle;
      }
    }, 45); // ~22Hz rapid fire

    return () => {
      if (turboIntervalRef.current) {
        clearInterval(turboIntervalRef.current);
      }
    };
  }, [controller]);

  // Clean up all touch states on unmount
  useEffect(() => {
    return () => {
      controller.touchState.up = false;
      controller.touchState.down = false;
      controller.touchState.left = false;
      controller.touchState.right = false;
      controller.touchState.a = false;
      controller.touchState.b = false;
      controller.touchState.x = false;
      controller.touchState.y = false;
      controller.touchState.l = false;
      controller.touchState.r = false;
      controller.touchState.select = false;
      controller.touchState.start = false;
    };
  }, [controller]);

  /**
   * Process thumbstick / D-pad continuous movement from a touch position relative to the pad center
   */
  const processMovement = useCallback(
    (clientX: number, clientY: number) => {
      if (!stickAreaRef.current) return;
      const rect = stickAreaRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      const maxRadius = rect.width * 0.42; // Limit thumbstick travel

      // Visual stick knob coordinates clamped to circle
      const clampedDist = Math.min(distance, maxRadius);
      const angle = Math.atan2(deltaY, deltaX);
      const knobX = Math.cos(angle) * clampedDist;
      const knobY = Math.sin(angle) * clampedDist;
      setStickOffset({ x: knobX, y: knobY });

      // Deadzone threshold in pixels (~12% of pad width)
      const deadzone = rect.width * 0.12;

      if (distance < deadzone) {
        // Center deadzone - release all directions
        controller.touchState.up = false;
        controller.touchState.down = false;
        controller.touchState.left = false;
        controller.touchState.right = false;
        setActiveDirections({ up: false, down: false, left: false, right: false });
        return;
      }

      // Convert angle to degrees (-180 to 180)
      const deg = (angle * 180) / Math.PI;

      // 8-directional sector calculation with 45° sectors for seamless diagonals
      let up = false;
      let down = false;
      let left = false;
      let right = false;

      if (deg >= -157.5 && deg <= -22.5) {
        up = true;
      }
      if (deg >= 22.5 && deg <= 157.5) {
        down = true;
      }
      if (deg >= -67.5 && deg <= 67.5) {
        right = true;
      }
      if (deg >= 112.5 || deg <= -112.5) {
        left = true;
      }

      // Check if state changed for haptic cue
      if (
        up !== controller.touchState.up ||
        down !== controller.touchState.down ||
        left !== controller.touchState.left ||
        right !== controller.touchState.right
      ) {
        triggerHaptic(8);
      }

      // Apply to controller touch state
      controller.touchState.up = up;
      controller.touchState.down = down;
      controller.touchState.left = left;
      controller.touchState.right = right;

      setActiveDirections({ up, down, left, right });
    },
    [controller, triggerHaptic]
  );

  const resetMovement = useCallback(() => {
    stickTouchIdRef.current = null;
    setIsStickActive(false);
    setStickOffset({ x: 0, y: 0 });
    controller.touchState.up = false;
    controller.touchState.down = false;
    controller.touchState.left = false;
    controller.touchState.right = false;
    setActiveDirections({ up: false, down: false, left: false, right: false });
  }, [controller]);

  /**
   * Dedicated Touch Events for Movement Pad
   * Attached directly to elements with non-passive preventDefault() to guarantee zero screen scroll
   */
  const handleStickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length > 0) {
      const touch = e.changedTouches[0];
      stickTouchIdRef.current = touch.identifier;
      setIsStickActive(true);
      processMovement(touch.clientX, touch.clientY);
      triggerHaptic(14);
    }
  };

  const handleStickTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (stickTouchIdRef.current === null) return;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === stickTouchIdRef.current) {
        processMovement(e.touches[i].clientX, e.touches[i].clientY);
        break;
      }
    }
  };

  const handleStickTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (stickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === stickTouchIdRef.current) {
        resetMovement();
        break;
      }
    }
  };

  /**
   * Action button handlers with zero scroll and multi-touch support
   */
  const handleButtonDown = (
    btn: "a" | "b" | "x" | "y" | "l" | "r" | "turboA" | "turboB" | "select" | "start",
    e?: React.TouchEvent | React.PointerEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerHaptic(15);

    if (btn === "turboA") {
      activeTurboButtonsRef.current.a = true;
      setActiveButtons((prev) => ({ ...prev, turboA: true }));
      return;
    }
    if (btn === "turboB") {
      activeTurboButtonsRef.current.b = true;
      setActiveButtons((prev) => ({ ...prev, turboB: true }));
      return;
    }

    controller.touchState[btn] = true;
    setActiveButtons((prev) => ({ ...prev, [btn]: true }));
  };

  const handleButtonUp = (
    btn: "a" | "b" | "x" | "y" | "l" | "r" | "turboA" | "turboB" | "select" | "start",
    e?: React.TouchEvent | React.PointerEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (btn === "turboA") {
      activeTurboButtonsRef.current.a = false;
      controller.touchState.a = false;
      setActiveButtons((prev) => ({ ...prev, turboA: false }));
      return;
    }
    if (btn === "turboB") {
      activeTurboButtonsRef.current.b = false;
      controller.touchState.b = false;
      setActiveButtons((prev) => ({ ...prev, turboB: false }));
      return;
    }

    controller.touchState[btn] = false;
    setActiveButtons((prev) => ({ ...prev, [btn]: false }));
  };

  const isAdvancedSystem = system === "SNES" || system === "GBA";

  // Size multipliers
  const sizeStyles = {
    compact: {
      padHeight: "min-h-[220px]",
      stickSize: "w-36 h-36",
      btnSize: "w-13 h-13 text-sm",
      turboSize: "w-10 h-10 text-[11px]",
      shoulderSize: "px-4 py-2 text-xs",
    },
    normal: {
      padHeight: "min-h-[260px]",
      stickSize: "w-44 h-44",
      btnSize: "w-15 h-15 text-base",
      turboSize: "w-11 h-11 text-xs",
      shoulderSize: "px-5 py-2.5 text-xs font-bold",
    },
    large: {
      padHeight: "min-h-[300px]",
      stickSize: "w-52 h-52",
      btnSize: "w-18 h-18 text-lg",
      turboSize: "w-13 h-13 text-sm font-bold",
      shoulderSize: "px-6 py-3 text-sm font-bold",
    },
  }[padSize];

  return (
    <div
      id="touch-gamepad-container"
      className={`w-full ${sizeStyles.padHeight} bg-gradient-to-b from-slate-900/95 via-slate-925 to-slate-950 border border-slate-800/90 rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-col justify-between select-none touch-none`}
      style={{
        touchAction: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
      onTouchMove={(e) => {
        // Prevent all viewport bounce / screen scroll inside gamepad boundary
        e.preventDefault();
      }}
    >
      {/* Top Controller Bar: Shoulder Buttons (L/R) & Modes */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        {/* Left Shoulder L */}
        <div className="flex items-center gap-2">
          {isAdvancedSystem && (
            <button
              id="touch-btn-l"
              onTouchStart={(e) => handleButtonDown("l", e)}
              onTouchEnd={(e) => handleButtonUp("l", e)}
              onTouchCancel={(e) => handleButtonUp("l", e)}
              onPointerDown={(e) => handleButtonDown("l", e)}
              onPointerUp={(e) => handleButtonUp("l", e)}
              className={`${sizeStyles.shoulderSize} rounded-lg border transition-all active:scale-95 shadow-md uppercase tracking-wider ${
                activeButtons.l
                  ? "bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/40 scale-95"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              L-Trigger
            </button>
          )}

          {/* Stick Mode Switcher */}
          <button
            id="touch-toggle-stick-mode"
            onClick={() => {
              setStickMode(stickMode === "joystick" ? "dpad" : "joystick");
              triggerHaptic(15);
            }}
            className="px-2.5 py-1.5 bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 rounded-lg text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 transition-colors shadow-xs"
            title="Перемкнути тип керування рухом (Стік / Хрестовина)"
          >
            {stickMode === "joystick" ? (
              <>
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Режим:</span> 360° Стік
              </>
            ) : (
              <>
                <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Режим:</span> 8-Way D-Pad
              </>
            )}
          </button>
        </div>

        {/* Center Pad Configuration (Size & Haptic) */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              const next = padSize === "compact" ? "normal" : padSize === "normal" ? "large" : "compact";
              setPadSize(next);
              triggerHaptic(10);
            }}
            className="px-2 py-0.5 text-[11px] font-mono text-slate-400 hover:text-slate-200 rounded flex items-center gap-1"
            title="Розмір сенсорного паду"
          >
            {padSize === "large" ? (
              <Minimize2 className="w-3 h-3 text-indigo-400" />
            ) : (
              <Maximize2 className="w-3 h-3 text-indigo-400" />
            )}
            <span className="capitalize">{padSize}</span>
          </button>

          <button
            onClick={() => {
              setHapticsEnabled(!hapticsEnabled);
              triggerHaptic(20);
            }}
            className={`px-1.5 py-0.5 text-[10px] rounded font-semibold transition-colors ${
              hapticsEnabled ? "text-amber-400 bg-amber-500/15" : "text-slate-500 hover:text-slate-400"
            }`}
            title="Вібровідгук (Haptics)"
          >
            VIB
          </button>
        </div>

        {/* Right Shoulder R */}
        <div className="flex items-center gap-2">
          {isAdvancedSystem && (
            <button
              id="touch-btn-r"
              onTouchStart={(e) => handleButtonDown("r", e)}
              onTouchEnd={(e) => handleButtonUp("r", e)}
              onTouchCancel={(e) => handleButtonUp("r", e)}
              onPointerDown={(e) => handleButtonDown("r", e)}
              onPointerUp={(e) => handleButtonUp("r", e)}
              className={`${sizeStyles.shoulderSize} rounded-lg border transition-all active:scale-95 shadow-md uppercase tracking-wider ${
                activeButtons.r
                  ? "bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/40 scale-95"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
              }`}
            >
              R-Trigger
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Touch Controls Body */}
      <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center flex-1">
        {/* LEFT AREA: Optimized Touch Movement Surface (D-Pad / 360° Floating Thumbstick) */}
        <div className="col-span-6 flex flex-col items-center justify-center relative">
          <div
            id="touch-movement-surface"
            ref={stickAreaRef}
            onTouchStart={handleStickTouchStart}
            onTouchMove={handleStickTouchMove}
            onTouchEnd={handleStickTouchEnd}
            onTouchCancel={handleStickTouchEnd}
            className={`${sizeStyles.stickSize} relative rounded-full bg-slate-950/90 border-2 border-slate-800/90 shadow-inner flex items-center justify-center touch-none cursor-grab active:cursor-grabbing transition-shadow`}
            style={{
              boxShadow: isStickActive
                ? "inset 0 0 20px rgba(99, 102, 241, 0.25), 0 0 15px rgba(99, 102, 241, 0.15)"
                : "inset 0 2px 10px rgba(0,0,0,0.6)",
            }}
          >
            {stickMode === "joystick" ? (
              /* --- 360° Smooth Analog Thumbstick Mode --- */
              <>
                {/* 8-Directional Background Sector Guidelines */}
                <div className="absolute inset-2 rounded-full border border-slate-800/50 pointer-events-none" />
                <div className="absolute w-full h-0.5 bg-slate-800/30 pointer-events-none" />
                <div className="absolute h-full w-0.5 bg-slate-800/30 pointer-events-none" />

                {/* Cardinal Direction Highlights */}
                <span
                  className={`absolute top-1 text-[11px] font-bold transition-colors ${
                    activeDirections.up ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▲
                </span>
                <span
                  className={`absolute bottom-1 text-[11px] font-bold transition-colors ${
                    activeDirections.down ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▼
                </span>
                <span
                  className={`absolute left-1.5 text-[11px] font-bold transition-colors ${
                    activeDirections.left ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ◀
                </span>
                <span
                  className={`absolute right-1.5 text-[11px] font-bold transition-colors ${
                    activeDirections.right ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▶
                </span>

                {/* Floating Analog Stick Knob */}
                <div
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 border-2 border-indigo-300/80 shadow-lg flex items-center justify-center transition-transform duration-75 pointer-events-none"
                  style={{
                    transform: `translate(${stickOffset.x}px, ${stickOffset.y}px) ${
                      isStickActive ? "scale(0.95)" : "scale(1)"
                    }`,
                    boxShadow: isStickActive
                      ? "0 0 16px rgba(99, 102, 241, 0.7), inset 0 2px 4px rgba(255,255,255,0.4)"
                      : "0 4px 8px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.3)",
                  }}
                >
                  <div className="w-5 h-5 rounded-full bg-indigo-900/80 border border-indigo-400/50 shadow-inner" />
                </div>
              </>
            ) : (
              /* --- Classic 8-Way Precision Cross D-Pad Mode --- */
              <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
                {/* Horizontal Bar */}
                <div className="absolute w-[86%] h-[32%] bg-slate-800/90 border border-slate-700/80 rounded-md shadow flex justify-between items-center px-1">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                      activeDirections.left
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ◀
                  </div>
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                      activeDirections.right
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ▶
                  </div>
                </div>

                {/* Vertical Bar */}
                <div className="absolute h-[86%] w-[32%] bg-slate-800/90 border border-slate-700/80 rounded-md shadow flex flex-col justify-between items-center py-1">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                      activeDirections.up
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ▲
                  </div>
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs transition-colors ${
                      activeDirections.down
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ▼
                  </div>
                </div>

                {/* Center Core */}
                <div
                  className={`w-[32%] h-[32%] z-10 rounded-full border border-slate-600 flex items-center justify-center shadow-inner transition-colors ${
                    isStickActive ? "bg-indigo-600/40" : "bg-slate-900"
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                </div>
              </div>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 uppercase tracking-wider">
            {stickMode === "joystick" ? "Сенсорний Стік" : "D-Pad Хрестовина"}
          </span>
        </div>

        {/* RIGHT AREA: Ergonomic Action Buttons with Turbo & Multi-Touch */}
        <div
          ref={actionAreaRef}
          className="col-span-6 flex flex-col items-center justify-center touch-none"
        >
          {/* Turbo Row for high-frequency shooting */}
          <div className="flex items-center gap-4 mb-2">
            <button
              id="touch-btn-turbo-b"
              onTouchStart={(e) => handleButtonDown("turboB", e)}
              onTouchEnd={(e) => handleButtonUp("turboB", e)}
              onTouchCancel={(e) => handleButtonUp("turboB", e)}
              onPointerDown={(e) => handleButtonDown("turboB", e)}
              onPointerUp={(e) => handleButtonUp("turboB", e)}
              className={`${sizeStyles.turboSize} rounded-full border border-rose-500/40 flex items-center justify-center font-bold text-rose-300 transition-all active:scale-95 shadow-md ${
                activeButtons.turboB
                  ? "bg-rose-600 text-white border-rose-300 shadow-rose-500/60 scale-95"
                  : "bg-rose-950/40 hover:bg-rose-900/50"
              }`}
              title="Turbo B (Auto Rapid Fire)"
            >
              <span className="flex items-center">
                <Zap className="w-2.5 h-2.5 inline mr-0.5" />B
              </span>
            </button>

            <button
              id="touch-btn-turbo-a"
              onTouchStart={(e) => handleButtonDown("turboA", e)}
              onTouchEnd={(e) => handleButtonUp("turboA", e)}
              onTouchCancel={(e) => handleButtonUp("turboA", e)}
              onPointerDown={(e) => handleButtonDown("turboA", e)}
              onPointerUp={(e) => handleButtonUp("turboA", e)}
              className={`${sizeStyles.turboSize} rounded-full border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-300 transition-all active:scale-95 shadow-md ${
                activeButtons.turboA
                  ? "bg-emerald-600 text-white border-emerald-300 shadow-emerald-500/60 scale-95"
                  : "bg-emerald-950/40 hover:bg-emerald-900/50"
              }`}
              title="Turbo A (Auto Rapid Fire)"
            >
              <span className="flex items-center">
                <Zap className="w-2.5 h-2.5 inline mr-0.5" />A
              </span>
            </button>
          </div>

          {/* Primary Action Diamond / Cluster (Y, X, B, A) */}
          <div className="relative flex items-center justify-center">
            {isAdvancedSystem ? (
              /* SNES/GBA 4-Button Diamond Layout (Y, X, B, A) */
              <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center">
                {/* Top: X */}
                <button
                  id="touch-btn-x"
                  onTouchStart={(e) => handleButtonDown("x", e)}
                  onTouchEnd={(e) => handleButtonUp("x", e)}
                  onTouchCancel={(e) => handleButtonUp("x", e)}
                  onPointerDown={(e) => handleButtonDown("x", e)}
                  onPointerUp={(e) => handleButtonUp("x", e)}
                  className={`absolute top-0 w-12 h-12 rounded-full border-2 font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${
                    activeButtons.x
                      ? "bg-sky-500 border-sky-200 text-white shadow-sky-500/60 scale-95"
                      : "bg-sky-600/80 border-sky-400/80 text-white hover:bg-sky-500"
                  }`}
                >
                  X
                </button>

                {/* Left: Y */}
                <button
                  id="touch-btn-y"
                  onTouchStart={(e) => handleButtonDown("y", e)}
                  onTouchEnd={(e) => handleButtonUp("y", e)}
                  onTouchCancel={(e) => handleButtonUp("y", e)}
                  onPointerDown={(e) => handleButtonDown("y", e)}
                  onPointerUp={(e) => handleButtonUp("y", e)}
                  className={`absolute left-0 w-12 h-12 rounded-full border-2 font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${
                    activeButtons.y
                      ? "bg-amber-500 border-amber-200 text-white shadow-amber-500/60 scale-95"
                      : "bg-amber-600/80 border-amber-400/80 text-white hover:bg-amber-500"
                  }`}
                >
                  Y
                </button>

                {/* Bottom: B */}
                <button
                  id="touch-btn-b"
                  onTouchStart={(e) => handleButtonDown("b", e)}
                  onTouchEnd={(e) => handleButtonUp("b", e)}
                  onTouchCancel={(e) => handleButtonUp("b", e)}
                  onPointerDown={(e) => handleButtonDown("b", e)}
                  onPointerUp={(e) => handleButtonUp("b", e)}
                  className={`absolute bottom-0 w-12 h-12 rounded-full border-2 font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${
                    activeButtons.b
                      ? "bg-rose-500 border-rose-200 text-white shadow-rose-500/60 scale-95"
                      : "bg-rose-600/90 border-rose-400 text-white hover:bg-rose-500"
                  }`}
                >
                  B
                </button>

                {/* Right: A */}
                <button
                  id="touch-btn-a"
                  onTouchStart={(e) => handleButtonDown("a", e)}
                  onTouchEnd={(e) => handleButtonUp("a", e)}
                  onTouchCancel={(e) => handleButtonUp("a", e)}
                  onPointerDown={(e) => handleButtonDown("a", e)}
                  onPointerUp={(e) => handleButtonUp("a", e)}
                  className={`absolute right-0 w-12 h-12 rounded-full border-2 font-bold transition-all active:scale-95 shadow-lg flex items-center justify-center ${
                    activeButtons.a
                      ? "bg-emerald-500 border-emerald-200 text-white shadow-emerald-500/60 scale-95"
                      : "bg-emerald-600/90 border-emerald-400 text-white hover:bg-emerald-500"
                  }`}
                >
                  A
                </button>
              </div>
            ) : (
              /* Classic NES / Game Boy Slanted 2-Button Layout (B, A) */
              <div className="flex items-center gap-3 sm:gap-5 -rotate-12 transform">
                {/* B Button (Red/Attack/Dash) */}
                <button
                  id="touch-btn-b"
                  onTouchStart={(e) => handleButtonDown("b", e)}
                  onTouchEnd={(e) => handleButtonUp("b", e)}
                  onTouchCancel={(e) => handleButtonUp("b", e)}
                  onPointerDown={(e) => handleButtonDown("b", e)}
                  onPointerUp={(e) => handleButtonUp("b", e)}
                  className={`${sizeStyles.btnSize} rounded-full border-2 font-bold transition-all active:scale-95 shadow-xl flex items-center justify-center cursor-pointer ${
                    activeButtons.b
                      ? "bg-rose-500 border-rose-200 text-white shadow-rose-500/70 scale-95"
                      : "bg-gradient-to-b from-rose-600 to-rose-700 border-rose-400 text-white hover:brightness-110"
                  }`}
                  style={{
                    boxShadow: activeButtons.b
                      ? "0 0 16px rgba(244, 63, 94, 0.8), inset 0 2px 4px rgba(0,0,0,0.4)"
                      : "0 4px 10px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.3)",
                  }}
                >
                  B
                </button>

                {/* A Button (Emerald/Jump/Action) */}
                <button
                  id="touch-btn-a"
                  onTouchStart={(e) => handleButtonDown("a", e)}
                  onTouchEnd={(e) => handleButtonUp("a", e)}
                  onTouchCancel={(e) => handleButtonUp("a", e)}
                  onPointerDown={(e) => handleButtonDown("a", e)}
                  onPointerUp={(e) => handleButtonUp("a", e)}
                  className={`${sizeStyles.btnSize} rounded-full border-2 font-bold transition-all active:scale-95 shadow-xl flex items-center justify-center cursor-pointer ${
                    activeButtons.a
                      ? "bg-emerald-500 border-emerald-200 text-white shadow-emerald-500/70 scale-95"
                      : "bg-gradient-to-b from-emerald-600 to-emerald-700 border-emerald-400 text-white hover:brightness-110"
                  }`}
                  style={{
                    boxShadow: activeButtons.a
                      ? "0 0 16px rgba(16, 185, 129, 0.8), inset 0 2px 4px rgba(0,0,0,0.4)"
                      : "0 4px 10px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.3)",
                  }}
                >
                  A
                </button>
              </div>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-semibold mt-1 uppercase tracking-wider">
            Дії (Action Pad)
          </span>
        </div>
      </div>

      {/* Bottom Center Console: SELECT, START & Quick Utility Buttons */}
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 mt-2 px-1">
        {/* Left utility (Reset / Restart) */}
        <div className="flex items-center gap-1.5">
          {onReset && (
            <button
              id="touch-quick-reset-btn"
              onClick={onReset}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 rounded-lg border border-slate-700 text-xs flex items-center gap-1 transition-colors"
              title="Перезапуск"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Center Rubber Console Switches: SELECT & START */}
        <div className="flex items-center gap-4 sm:gap-6 bg-slate-950/90 px-4 py-1.5 rounded-full border border-slate-800 shadow-inner">
          {/* SELECT Button */}
          <button
            id="touch-btn-select"
            onTouchStart={(e) => handleButtonDown("select", e)}
            onTouchEnd={(e) => handleButtonUp("select", e)}
            onTouchCancel={(e) => handleButtonUp("select", e)}
            onPointerDown={(e) => handleButtonDown("select", e)}
            onPointerUp={(e) => handleButtonUp("select", e)}
            className={`px-3 py-1 rounded-full border text-[11px] font-mono font-bold tracking-wider uppercase transition-all active:scale-95 ${
              activeButtons.select
                ? "bg-sky-600 text-white border-sky-400 shadow-sky-500/50 scale-95"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            SELECT
          </button>

          {/* START Button */}
          <button
            id="touch-btn-start"
            onTouchStart={(e) => handleButtonDown("start", e)}
            onTouchEnd={(e) => handleButtonUp("start", e)}
            onTouchCancel={(e) => handleButtonUp("start", e)}
            onPointerDown={(e) => handleButtonDown("start", e)}
            onPointerUp={(e) => handleButtonUp("start", e)}
            className={`px-3.5 py-1 rounded-full border text-[11px] font-mono font-bold tracking-wider uppercase transition-all active:scale-95 ${
              activeButtons.start
                ? "bg-emerald-600 text-white border-emerald-400 shadow-emerald-500/50 scale-95"
                : "bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-750"
            }`}
          >
            START
          </button>
        </div>

        {/* Right utility (Main In-Game Menu) */}
        <div className="flex items-center gap-1.5">
          {onOpenMenu && (
            <button
              id="touch-quick-menu-btn"
              onClick={onOpenMenu}
              className="p-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg border border-amber-500/30 text-xs flex items-center gap-1 transition-colors font-bold"
              title="Головне меню гри (ESC)"
            >
              <Menu className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
