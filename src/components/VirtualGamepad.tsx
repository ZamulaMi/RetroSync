import React, { useEffect, useRef, useState, useCallback } from "react";
import { ConsoleSystem, ControllerState } from "../types";
import { Crosshair, CircleDot, Zap, Vibrate, Sparkles } from "lucide-react";

interface VirtualGamepadProps {
  touchState: ControllerState;
  system: ConsoleSystem;
  onOpenMenu?: () => void;
  onReset?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
}

type DPadMode = "glide-stick" | "classic-cross";

export const VirtualGamepad: React.FC<VirtualGamepadProps> = ({
  touchState,
  system,
  onOpenMenu,
  onReset,
  onTogglePause,
  isPaused = false,
}) => {
  const [dpadMode, setDpadMode] = useState<DPadMode>("glide-stick");
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  // Joystick visual offset
  const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState(false);

  // Active state indicators for UI lighting
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
    turboA: boolean;
    turboB: boolean;
    select: boolean;
    start: boolean;
  }>({
    a: false,
    b: false,
    x: false,
    y: false,
    turboA: false,
    turboB: false,
    select: false,
    start: false,
  });

  const dpadContainerRef = useRef<HTMLDivElement>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const turboIntervalRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });

  // Haptic feedback helper
  const triggerHaptic = useCallback(
    (durationMs = 12) => {
      if (!hapticsEnabled) return;
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(durationMs);
        }
      } catch {
        // Ignore haptics errors if blocked by browser policy
      }
    },
    [hapticsEnabled]
  );

  // Reset all directional states
  const clearDirections = useCallback(() => {
    touchState.up = false;
    touchState.down = false;
    touchState.left = false;
    touchState.right = false;
    setActiveDirections({ up: false, down: false, left: false, right: false });
    setStickOffset({ x: 0, y: 0 });
    setIsStickActive(false);
  }, [touchState]);

  // Process joystick / glide D-pad touch coordinates
  const processMovementCoord = useCallback(
    (clientX: number, clientY: number) => {
      const container = dpadContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxRadius = rect.width / 2;

      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Deadzone ratio (15% of radius)
      const deadzone = maxRadius * 0.18;

      if (distance < deadzone) {
        // In deadzone: release all directions but keep visual thumb slightly shifted
        clearDirections();
        setIsStickActive(true);
        setStickOffset({ x: deltaX * 0.4, y: deltaY * 0.4 });
        return;
      }

      // Clamped visual stick offset (max 65% of radius)
      const clampDist = Math.min(distance, maxRadius * 0.65);
      const angle = Math.atan2(deltaY, deltaX);
      setStickOffset({
        x: Math.cos(angle) * clampDist,
        y: Math.sin(angle) * clampDist,
      });
      setIsStickActive(true);

      // Calculate directional inputs with angular sectors (8-direction support)
      // Angle in degrees: 0 is Right, 90 is Down, 180/-180 is Left, -90 is Up
      const deg = (angle * 180) / Math.PI;

      let up = false;
      let down = false;
      let left = false;
      let right = false;

      // Sector thresholds with generous overlaps for seamless diagonal movement:
      // UP: -157.5° to -22.5°
      // RIGHT: -67.5° to 67.5°
      // DOWN: 22.5° to 157.5°
      // LEFT: > 112.5° or < -112.5°

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

      const prevUp = touchState.up;
      const prevDown = touchState.down;
      const prevLeft = touchState.left;
      const prevRight = touchState.right;

      touchState.up = up;
      touchState.down = down;
      touchState.left = left;
      touchState.right = right;

      setActiveDirections({ up, down, left, right });

      // Haptic bump when changing direction state
      if (up !== prevUp || down !== prevDown || left !== prevLeft || right !== prevRight) {
        triggerHaptic(10);
      }
    },
    [touchState, clearDirections, triggerHaptic]
  );

  // Attach non-passive native touch event listeners to D-Pad container to 100% block screen scrolling
  useEffect(() => {
    const el = dpadContainerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeTouchIdRef.current === null && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        activeTouchIdRef.current = touch.identifier;
        processMovementCoord(touch.clientX, touch.clientY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeTouchIdRef.current !== null) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          if (touch.identifier === activeTouchIdRef.current) {
            processMovementCoord(touch.clientX, touch.clientY);
            break;
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (activeTouchIdRef.current !== null) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
            activeTouchIdRef.current = null;
            clearDirections();
            break;
          }
        }
      }
    };

    const handleTouchCancel = (e: TouchEvent) => {
      e.preventDefault();
      activeTouchIdRef.current = null;
      clearDirections();
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    el.addEventListener("touchcancel", handleTouchCancel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [processMovementCoord, clearDirections]);

  // Handle standard action buttons (A, B, X, Y, Select, Start)
  const setButtonState = useCallback(
    (btn: keyof ControllerState, isPressed: boolean) => {
      touchState[btn] = isPressed;
      setActiveButtons((prev) => ({
        ...prev,
        [btn]: isPressed,
      }));
      if (isPressed) {
        triggerHaptic(14);
      }
    },
    [touchState, triggerHaptic]
  );

  // Handle Turbo buttons
  const startTurbo = useCallback(
    (btn: "a" | "b") => {
      setActiveButtons((prev) => ({
        ...prev,
        [btn === "a" ? "turboA" : "turboB"]: true,
      }));
      triggerHaptic(18);

      if (turboIntervalRef.current[btn]) {
        clearInterval(turboIntervalRef.current[btn]!);
      }

      let state = true;
      touchState[btn] = true;

      // Pulse at ~30Hz (toggle state every ~33ms)
      turboIntervalRef.current[btn] = window.setInterval(() => {
        state = !state;
        touchState[btn] = state;
      }, 33);
    },
    [touchState, triggerHaptic]
  );

  const stopTurbo = useCallback(
    (btn: "a" | "b") => {
      if (turboIntervalRef.current[btn]) {
        clearInterval(turboIntervalRef.current[btn]!);
        turboIntervalRef.current[btn] = null;
      }
      touchState[btn] = false;
      setActiveButtons((prev) => ({
        ...prev,
        [btn === "a" ? "turboA" : "turboB"]: false,
      }));
    },
    [touchState]
  );

  // Cleanup turbo intervals on unmount
  useEffect(() => {
    return () => {
      if (turboIntervalRef.current.a) clearInterval(turboIntervalRef.current.a);
      if (turboIntervalRef.current.b) clearInterval(turboIntervalRef.current.b);
      clearDirections();
    };
  }, [clearDirections]);

  // Helper for touch button event bindings to prevent page scroll and gestures
  const bindTouchEvents = (
    onPress: () => void,
    onRelease: () => void
  ) => {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      },
      onTouchEnd: (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onRelease();
      },
      onTouchCancel: (e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onRelease();
      },
      onMouseDown: (e: React.MouseEvent) => {
        e.preventDefault();
        onPress();
      },
      onMouseUp: (e: React.MouseEvent) => {
        e.preventDefault();
        onRelease();
      },
      onMouseLeave: () => {
        onRelease();
      },
    };
  };

  const isSnesOrGba = system === "SNES" || system === "GBA";

  return (
    <div
      id="virtual-gamepad-panel"
      className="touch-none-all w-full mt-3 bg-gradient-to-b from-slate-900/95 to-slate-950/98 border-2 border-slate-800/90 rounded-2xl p-3 sm:p-5 shadow-2xl backdrop-blur-md select-none flex flex-col gap-4 text-slate-100"
      style={{ touchAction: "none", userSelect: "none" }}
    >
      {/* Top Controller Status Bar & Settings */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-bold text-slate-200 tracking-wide">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Сенсорний Геймпад
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
            {system} Layout
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* D-Pad Mode Toggle */}
          <button
            onClick={() => setDpadMode(dpadMode === "glide-stick" ? "classic-cross" : "glide-stick")}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              dpadMode === "glide-stick"
                ? "bg-indigo-600/30 text-indigo-200 border-indigo-500/50"
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}
            title="Перемкнути режим стіка (Плавний джойстик / Класичний хрест)"
          >
            {dpadMode === "glide-stick" ? (
              <>
                <CircleDot className="w-3.5 h-3.5 text-indigo-400" />
                <span>Плавний Стік</span>
              </>
            ) : (
              <>
                <Crosshair className="w-3.5 h-3.5 text-amber-400" />
                <span>D-Pad Хрест</span>
              </>
            )}
          </button>

          {/* Haptics Toggle */}
          <button
            onClick={() => {
              setHapticsEnabled(!hapticsEnabled);
              triggerHaptic(25);
            }}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              hapticsEnabled
                ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-slate-500 border-slate-700"
            }`}
            title={hapticsEnabled ? "Вібрація (Haptics) увімкнена" : "Вібрація вимкнена"}
          >
            <Vibrate className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Touch Controls Ergonomic Layout: Left D-Pad | Center System Keys | Right Action Buttons */}
      <div className="grid grid-cols-12 gap-2 sm:gap-4 items-center justify-between">
        {/* LEFT SECTOR: Fluid Continuous Glide D-Pad / Thumbstick (5 cols) */}
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div
            ref={dpadContainerRef}
            id="virtual-dpad-touch-zone"
            className="touch-none-all relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-slate-950/90 border-2 border-slate-800 shadow-[inset_0_4px_16px_rgba(0,0,0,0.8)] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: "none" }}
          >
            {/* Directional Guide Tracks */}
            <div className="absolute inset-2 rounded-full border border-slate-800/60 pointer-events-none" />
            <div className="absolute inset-6 rounded-full border border-dashed border-slate-800/40 pointer-events-none" />

            {/* UP Sector Indicator */}
            <div
              className={`absolute top-1.5 left-1/2 -translate-x-1/2 w-10 sm:w-12 h-9 sm:h-11 rounded-t-xl flex items-center justify-center text-xs font-bold transition-all pointer-events-none ${
                activeDirections.up
                  ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.8)] scale-110"
                  : "bg-slate-850/80 text-slate-400 border-t border-slate-700"
              }`}
            >
              ▲
            </div>

            {/* DOWN Sector Indicator */}
            <div
              className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 w-10 sm:w-12 h-9 sm:h-11 rounded-b-xl flex items-center justify-center text-xs font-bold transition-all pointer-events-none ${
                activeDirections.down
                  ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.8)] scale-110"
                  : "bg-slate-850/80 text-slate-400 border-b border-slate-700"
              }`}
            >
              ▼
            </div>

            {/* LEFT Sector Indicator */}
            <div
              className={`absolute left-1.5 top-1/2 -translate-y-1/2 w-9 sm:w-11 h-10 sm:h-12 rounded-l-xl flex items-center justify-center text-xs font-bold transition-all pointer-events-none ${
                activeDirections.left
                  ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.8)] scale-110"
                  : "bg-slate-850/80 text-slate-400 border-l border-slate-700"
              }`}
            >
              ◀
            </div>

            {/* RIGHT Sector Indicator */}
            <div
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-9 sm:w-11 h-10 sm:h-12 rounded-r-xl flex items-center justify-center text-xs font-bold transition-all pointer-events-none ${
                activeDirections.right
                  ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.8)] scale-110"
                  : "bg-slate-850/80 text-slate-400 border-r border-slate-700"
              }`}
            >
              ▶
            </div>

            {/* Center Dynamic Thumbstick Knob */}
            <div
              className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 transition-transform duration-75 pointer-events-none flex items-center justify-center shadow-lg ${
                isStickActive
                  ? "bg-gradient-to-b from-indigo-500 to-indigo-700 border-indigo-300 shadow-[0_0_20px_rgba(99,102,241,0.6)] scale-105"
                  : "bg-gradient-to-b from-slate-750 to-slate-850 border-slate-600"
              }`}
              style={{
                transform: `translate(${stickOffset.x}px, ${stickOffset.y}px)`,
              }}
            >
              <div className="w-5 h-5 rounded-full bg-slate-900/60 border border-white/20 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 mt-1.5 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Сенсорний рух (ковзання)</span>
          </div>
        </div>

        {/* CENTER SECTOR: SELECT, START, MENU & UTILITIES (2 cols) */}
        <div className="col-span-2 flex flex-col items-center justify-center gap-3">
          {/* Select Button */}
          <div className="flex flex-col items-center">
            <button
              id="virtual-btn-select"
              {...bindTouchEvents(
                () => setButtonState("select", true),
                () => setButtonState("select", false)
              )}
              className={`touch-none-all w-14 sm:w-16 py-2 rounded-full border text-[10px] font-bold tracking-wider uppercase transition-all active:scale-95 shadow ${
                activeButtons.select
                  ? "bg-sky-500 text-white border-sky-300 shadow-[0_0_12px_rgba(14,165,233,0.7)]"
                  : "bg-slate-850 text-slate-300 border-slate-700 hover:bg-slate-800"
              }`}
            >
              Select
            </button>
          </div>

          {/* Start Button */}
          <div className="flex flex-col items-center">
            <button
              id="virtual-btn-start"
              {...bindTouchEvents(
                () => setButtonState("start", true),
                () => setButtonState("start", false)
              )}
              className={`touch-none-all w-14 sm:w-16 py-2 rounded-full border text-[10px] font-bold tracking-wider uppercase transition-all active:scale-95 shadow ${
                activeButtons.start
                  ? "bg-amber-500 text-white border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.7)]"
                  : "bg-slate-850 text-amber-300 border-slate-700 hover:bg-slate-800"
              }`}
            >
              Start
            </button>
          </div>

          {/* Quick Menu / Reset buttons */}
          <div className="flex items-center gap-1.5 mt-1">
            {onOpenMenu && (
              <button
                onClick={onOpenMenu}
                className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded text-[9px] font-bold uppercase transition-all active:scale-95"
                title="Меню гри"
              >
                Меню
              </button>
            )}
            {onTogglePause && (
              <button
                onClick={onTogglePause}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded text-[9px] font-bold uppercase transition-all active:scale-95"
                title="Пауза"
              >
                {isPaused ? "Play" : "Pause"}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT SECTOR: Action Buttons (A, B, Turbo A, Turbo B, + X/Y for SNES/GBA) (5 cols) */}
        <div className="col-span-5 flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            {/* SNES Top Row: Y and X buttons (if SNES/GBA) */}
            {isSnesOrGba && (
              <div className="flex items-center gap-3">
                {/* Y Button */}
                <button
                  id="virtual-btn-y"
                  {...bindTouchEvents(
                    () => setButtonState("y", true),
                    () => setButtonState("y", false)
                  )}
                  className={`touch-none-all w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center font-bold text-sm sm:text-base shadow-lg transition-all active:scale-90 cursor-pointer ${
                    activeButtons.y
                      ? "bg-amber-500 border-amber-300 text-white shadow-[0_0_15px_rgba(245,158,11,0.8)]"
                      : "bg-gradient-to-b from-amber-600/90 to-amber-700 border-amber-500/70 text-amber-100"
                  }`}
                >
                  Y
                </button>

                {/* X Button */}
                <button
                  id="virtual-btn-x"
                  {...bindTouchEvents(
                    () => setButtonState("x", true),
                    () => setButtonState("x", false)
                  )}
                  className={`touch-none-all w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center font-bold text-sm sm:text-base shadow-lg transition-all active:scale-90 cursor-pointer ${
                    activeButtons.x
                      ? "bg-sky-500 border-sky-300 text-white shadow-[0_0_15px_rgba(14,165,233,0.8)]"
                      : "bg-gradient-to-b from-sky-600/90 to-sky-700 border-sky-500/70 text-sky-100"
                  }`}
                >
                  X
                </button>
              </div>
            )}

            {/* Primary Action Row: B and A Buttons */}
            <div className="flex items-center gap-3 sm:gap-5">
              {/* B Button (Jump/Attack) */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="virtual-btn-b"
                  {...bindTouchEvents(
                    () => setButtonState("b", true),
                    () => setButtonState("b", false)
                  )}
                  className={`touch-none-all w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex items-center justify-center font-bold text-base sm:text-lg shadow-xl transition-all active:scale-90 cursor-pointer ${
                    activeButtons.b
                      ? "bg-rose-500 border-rose-200 text-white shadow-[0_0_20px_rgba(244,63,94,0.9)]"
                      : "bg-gradient-to-b from-rose-600 to-rose-700 border-rose-400/80 text-rose-50"
                  }`}
                >
                  B
                </button>
                <span className="text-[9px] text-rose-300/80 font-medium">Атака</span>
              </div>

              {/* A Button (Jump/Action) */}
              <div className="flex flex-col items-center gap-1">
                <button
                  id="virtual-btn-a"
                  {...bindTouchEvents(
                    () => setButtonState("a", true),
                    () => setButtonState("a", false)
                  )}
                  className={`touch-none-all w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex items-center justify-center font-bold text-base sm:text-lg shadow-xl transition-all active:scale-90 cursor-pointer ${
                    activeButtons.a
                      ? "bg-emerald-500 border-emerald-200 text-white shadow-[0_0_20px_rgba(16,185,129,0.9)]"
                      : "bg-gradient-to-b from-emerald-600 to-emerald-700 border-emerald-400/80 text-emerald-50"
                  }`}
                >
                  A
                </button>
                <span className="text-[9px] text-emerald-300/80 font-medium">Стрибок</span>
              </div>
            </div>

            {/* Turbo Row: Turbo B & Turbo A */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                id="virtual-btn-turbo-b"
                {...bindTouchEvents(
                  () => startTurbo("b"),
                  () => stopTurbo("b")
                )}
                className={`touch-none-all px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow ${
                  activeButtons.turboB
                    ? "bg-rose-600 text-white border-rose-300 shadow-[0_0_12px_rgba(225,29,72,0.8)]"
                    : "bg-slate-900 text-rose-300 border-rose-500/40 hover:bg-rose-950/40"
                }`}
              >
                <Zap className="w-3 h-3 text-rose-400" />
                <span>Turbo B</span>
              </button>

              <button
                id="virtual-btn-turbo-a"
                {...bindTouchEvents(
                  () => startTurbo("a"),
                  () => stopTurbo("a")
                )}
                className={`touch-none-all px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 shadow ${
                  activeButtons.turboA
                    ? "bg-emerald-600 text-white border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                    : "bg-slate-900 text-emerald-300 border-emerald-500/40 hover:bg-emerald-950/40"
                }`}
              >
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>Turbo A</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
