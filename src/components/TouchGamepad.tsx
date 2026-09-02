/**
 * Dedicated On-Screen Touch Gamepad
 * Optimized specifically for touchscreens and mobile devices:
 * - Positioned directly beneath the screen canvas.
 * - Exactly 2 LARGE Action Buttons (B and A) with ergonomic thumb spacing.
 * - Complete screen movement & scroll lock (touch-action: none, preventDefault).
 * - Continuous 8-directional thumb tracking (Smooth 360° Joystick & Precision 8-Way D-Pad).
 * - True multi-touch support for simultaneous movement + jump/attack button combos.
 * - Haptic feedback and visual tactile depression.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Gamepad2,
  Compass,
  RotateCcw,
  Menu,
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

  // Active state for visual highlighting of directions
  const [activeDirections, setActiveDirections] = useState<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
  }>({ up: false, down: false, left: false, right: false });

  // Active state for B, A, SELECT, START
  const [activeButtons, setActiveButtons] = useState<{
    a: boolean;
    b: boolean;
    select: boolean;
    start: boolean;
  }>({
    a: false,
    b: false,
    select: false,
    start: false,
  });

  // Joystick knob offset position in px from center
  const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState<boolean>(false);

  // Refs for tracking touches
  const stickAreaRef = useRef<HTMLDivElement>(null);
  const stickTouchIdRef = useRef<number | null>(null);

  // Trigger brief haptic feedback on supported touch devices
  const triggerHaptic = useCallback(
    (durationMs = 15) => {
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
        triggerHaptic(10);
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
   * Attached directly with preventDefault() to guarantee zero screen scroll
   */
  const handleStickTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length > 0) {
      const touch = e.changedTouches[0];
      stickTouchIdRef.current = touch.identifier;
      setIsStickActive(true);
      processMovement(touch.clientX, touch.clientY);
      triggerHaptic(18);
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
   * Action button handlers (Only 2 large buttons: B and A)
   */
  const handleButtonDown = (
    btn: "a" | "b" | "select" | "start",
    e?: React.TouchEvent | React.PointerEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    triggerHaptic(20);
    controller.touchState[btn] = true;
    setActiveButtons((prev) => ({ ...prev, [btn]: true }));
  };

  const handleButtonUp = (
    btn: "a" | "b" | "select" | "start",
    e?: React.TouchEvent | React.PointerEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    controller.touchState[btn] = false;
    setActiveButtons((prev) => ({ ...prev, [btn]: false }));
  };

  // Sizing styles with Extra Large Action Buttons
  const sizeStyles = {
    compact: {
      padHeight: "min-h-[220px]",
      stickSize: "w-36 h-36 sm:w-40 sm:h-40",
      btnSize: "w-18 h-18 sm:w-20 sm:h-20 text-2xl font-black",
    },
    normal: {
      padHeight: "min-h-[260px]",
      stickSize: "w-44 h-44 sm:w-48 sm:h-48",
      btnSize: "w-22 h-22 sm:w-26 sm:h-26 text-3xl sm:text-4xl font-black",
    },
    large: {
      padHeight: "min-h-[300px]",
      stickSize: "w-52 h-52 sm:w-56 sm:h-56",
      btnSize: "w-26 h-26 sm:w-30 sm:h-30 text-4xl sm:text-5xl font-black",
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
      {/* Top Controller Bar: Mode switch & Size config */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        {/* Stick Mode Switcher (Joystick vs D-Pad) */}
        <button
          id="touch-toggle-stick-mode"
          onClick={() => {
            setStickMode(stickMode === "joystick" ? "dpad" : "joystick");
            triggerHaptic(20);
          }}
          className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-750 border border-slate-700/80 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          title="Перемкнути тип керування рухом (Стік / Хрестовина)"
        >
          {stickMode === "joystick" ? (
            <>
              <Compass className="w-4 h-4 text-indigo-400" />
              <span>360° Стік</span>
            </>
          ) : (
            <>
              <Gamepad2 className="w-4 h-4 text-emerald-400" />
              <span>8-Way Хрестовина</span>
            </>
          )}
        </button>

        {/* Center Pad Configuration (Size & Haptics) */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              const next = padSize === "compact" ? "normal" : padSize === "normal" ? "large" : "compact";
              setPadSize(next);
              triggerHaptic(15);
            }}
            className="px-2.5 py-1 text-xs font-mono text-slate-300 hover:text-white rounded flex items-center gap-1.5 cursor-pointer"
            title="Змінити розмір кнопок"
          >
            {padSize === "large" ? (
              <Minimize2 className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="capitalize font-semibold">{padSize}</span>
          </button>

          <button
            onClick={() => {
              setHapticsEnabled(!hapticsEnabled);
              triggerHaptic(25);
            }}
            className={`px-2 py-1 text-xs rounded font-bold transition-colors cursor-pointer ${
              hapticsEnabled ? "text-amber-400 bg-amber-500/15" : "text-slate-500 hover:text-slate-400"
            }`}
            title="Вібровідгук (Vibration Haptics)"
          >
            VIB
          </button>
        </div>
      </div>

      {/* Main Interactive Touch Area */}
      <div className="grid grid-cols-12 gap-2 sm:gap-6 items-center flex-1 my-1">
        {/* LEFT AREA: Optimized Touch Movement (360° Thumbstick or D-Pad) */}
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
                ? "inset 0 0 24px rgba(99, 102, 241, 0.35), 0 0 18px rgba(99, 102, 241, 0.2)"
                : "inset 0 2px 12px rgba(0,0,0,0.7)",
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
                  className={`absolute top-1.5 text-xs font-bold transition-colors ${
                    activeDirections.up ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▲
                </span>
                <span
                  className={`absolute bottom-1.5 text-xs font-bold transition-colors ${
                    activeDirections.down ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▼
                </span>
                <span
                  className={`absolute left-2 text-xs font-bold transition-colors ${
                    activeDirections.left ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ◀
                </span>
                <span
                  className={`absolute right-2 text-xs font-bold transition-colors ${
                    activeDirections.right ? "text-indigo-400 font-extrabold scale-125" : "text-slate-600"
                  }`}
                >
                  ▶
                </span>

                {/* Floating Analog Stick Knob */}
                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 border-2 border-indigo-300/80 shadow-lg flex items-center justify-center transition-transform duration-75 pointer-events-none"
                  style={{
                    transform: `translate(${stickOffset.x}px, ${stickOffset.y}px) ${
                      isStickActive ? "scale(0.95)" : "scale(1)"
                    }`,
                    boxShadow: isStickActive
                      ? "0 0 20px rgba(99, 102, 241, 0.8), inset 0 2px 5px rgba(255,255,255,0.4)"
                      : "0 6px 12px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,255,255,0.3)",
                  }}
                >
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-indigo-900/80 border border-indigo-400/50 shadow-inner" />
                </div>
              </>
            ) : (
              /* --- Classic 8-Way Precision Cross D-Pad Mode --- */
              <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
                {/* Horizontal Bar */}
                <div className="absolute w-[88%] h-[34%] bg-slate-800/90 border border-slate-700/80 rounded-md shadow flex justify-between items-center px-1.5">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm transition-colors ${
                      activeDirections.left
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ◀
                  </div>
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm transition-colors ${
                      activeDirections.right
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ▶
                  </div>
                </div>

                {/* Vertical Bar */}
                <div className="absolute h-[88%] w-[34%] bg-slate-800/90 border border-slate-700/80 rounded-md shadow flex flex-col justify-between items-center py-1.5">
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm transition-colors ${
                      activeDirections.up
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/50"
                        : "text-slate-400"
                    }`}
                  >
                    ▲
                  </div>
                  <div
                    className={`w-9 h-9 rounded flex items-center justify-center font-bold text-sm transition-colors ${
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
                  className={`w-[34%] h-[34%] z-10 rounded-full border border-slate-600 flex items-center justify-center shadow-inner transition-colors ${
                    isStickActive ? "bg-indigo-600/40" : "bg-slate-900"
                  }`}
                >
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT AREA: Exactly TWO Large Action Buttons (B and A) positioned at 45° angle */}
        <div className="col-span-6 flex items-center justify-center touch-none py-3">
          <div
            className="flex items-center justify-center gap-5 sm:gap-7 -rotate-45 transform"
            style={{ touchAction: "none" }}
          >
            {/* LARGE B BUTTON (Bottom-Left at 45°) */}
            <button
              id="touch-btn-b"
              onTouchStart={(e) => handleButtonDown("b", e)}
              onTouchEnd={(e) => handleButtonUp("b", e)}
              onTouchCancel={(e) => handleButtonUp("b", e)}
              onPointerDown={(e) => handleButtonDown("b", e)}
              onPointerUp={(e) => handleButtonUp("b", e)}
              className={`${sizeStyles.btnSize} rounded-full border-3 flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xl ${
                activeButtons.b
                  ? "bg-rose-500 border-rose-100 text-white shadow-rose-500/80 scale-90"
                  : "bg-gradient-to-b from-rose-500 via-rose-600 to-rose-700 border-rose-300/90 text-white hover:brightness-110"
              }`}
              style={{
                boxShadow: activeButtons.b
                  ? "0 0 24px rgba(244, 63, 94, 0.9), inset 0 3px 6px rgba(0,0,0,0.5)"
                  : "0 8px 16px rgba(0,0,0,0.6), inset 0 3px 4px rgba(255,255,255,0.4)",
              }}
              title="Button B"
            >
              <span className="rotate-45 transform inline-block select-none">B</span>
            </button>

            {/* LARGE A BUTTON (Top-Right at 45°) */}
            <button
              id="touch-btn-a"
              onTouchStart={(e) => handleButtonDown("a", e)}
              onTouchEnd={(e) => handleButtonUp("a", e)}
              onTouchCancel={(e) => handleButtonUp("a", e)}
              onPointerDown={(e) => handleButtonDown("a", e)}
              onPointerUp={(e) => handleButtonUp("a", e)}
              className={`${sizeStyles.btnSize} rounded-full border-3 flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xl ${
                activeButtons.a
                  ? "bg-emerald-500 border-emerald-100 text-white shadow-emerald-500/80 scale-90"
                  : "bg-gradient-to-b from-emerald-500 via-emerald-600 to-emerald-700 border-emerald-300/90 text-white hover:brightness-110"
              }`}
              style={{
                boxShadow: activeButtons.a
                  ? "0 0 24px rgba(16, 185, 129, 0.9), inset 0 3px 6px rgba(0,0,0,0.5)"
                  : "0 8px 16px rgba(0,0,0,0.6), inset 0 3px 4px rgba(255,255,255,0.4)",
              }}
              title="Button A"
            >
              <span className="rotate-45 transform inline-block select-none">A</span>
            </button>
          </div>
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
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-lg border border-slate-700 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Перезапуск гри"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Скинути</span>
            </button>
          )}
        </div>

        {/* Center Rubber Console Switches: SELECT & START */}
        <div className="flex items-center gap-4 sm:gap-6 bg-slate-950/90 px-4 sm:px-6 py-1.5 rounded-full border border-slate-800 shadow-inner">
          {/* SELECT Button */}
          <button
            id="touch-btn-select"
            onTouchStart={(e) => handleButtonDown("select", e)}
            onTouchEnd={(e) => handleButtonUp("select", e)}
            onTouchCancel={(e) => handleButtonUp("select", e)}
            onPointerDown={(e) => handleButtonDown("select", e)}
            onPointerUp={(e) => handleButtonUp("select", e)}
            className={`px-3.5 py-1.5 rounded-full border text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-95 cursor-pointer ${
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
            className={`px-4 py-1.5 rounded-full border text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-95 cursor-pointer ${
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
              className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg border border-amber-500/30 text-xs flex items-center gap-1.5 transition-colors font-bold cursor-pointer"
              title="Головне меню гри (ESC)"
            >
              <Menu className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Меню</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
