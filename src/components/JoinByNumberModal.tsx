import React, { useState, useRef, useEffect } from "react";
import { Hash, LogIn, X, Clipboard, ArrowRight } from "lucide-react";

interface JoinByNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (roomNumber: string) => void;
}

export const JoinByNumberModal: React.FC<JoinByNumberModalProps> = ({
  isOpen,
  onClose,
  onJoin,
}) => {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Auto focus first input on open
  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", "", "", ""]);
      setErrorMsg(null);
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fullNumber = digits.join("").trim();

  const handleDigitChange = (index: number, val: string) => {
    setErrorMsg(null);
    // Sanitize to only numeric digits 0-9
    const sanitized = val.replace(/[^0-9]/g, "");

    if (sanitized.length > 1) {
      // Pasted or multiple digits entered
      applyNumberString(sanitized, index);
      return;
    }

    const next = [...digits];
    next[index] = sanitized;
    setDigits(next);

    // Auto advance if digit entered
    if (sanitized && index < 5) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs[index + 1].current?.focus();
    } else if (e.key === "Enter" && fullNumber.length === 6) {
      handleSubmit();
    }
  };

  const applyNumberString = (str: string, startIndex: number = 0) => {
    // Check if it's a URL or formatted text
    let text = str.trim();
    if (text.includes("num=") || text.includes("number=")) {
      const match = text.match(/(?:num|number)=([0-9]{6})/i);
      if (match) text = match[1];
    }
    const clean = text.replace(/[^0-9]/g, "");
    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      const targetIdx = startIndex + i;
      if (targetIdx < 6 && i < clean.length) {
        next[targetIdx] = clean[i];
      }
    }
    setDigits(next);
    const lastFilled = Math.min(5, startIndex + clean.length);
    inputRefs[lastFilled].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    applyNumberString(pasted, 0);
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        applyNumberString(text, 0);
      }
    } catch {
      setErrorMsg("Буфер обміну недоступний. Вставте номер клавішами Ctrl+V");
    }
  };

  const handleSubmit = () => {
    if (fullNumber.length !== 6) {
      setErrorMsg("Номер кімнати має містити рівно 6 цифр (від 100000 до 999999).");
      return;
    }
    onJoin(fullNumber);
    onClose();
  };

  return (
    <div
      id="join-by-number-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-slate-900 border-b border-emerald-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600/30 border border-emerald-500/50 text-emerald-300">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Вхід за номером кімнати
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  6 цифр
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Окреме вікно для введення числового 6-значного номера
              </p>
            </div>
          </div>
          <button
            id="close-number-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          <div className="text-center">
            <p className="text-xs text-slate-300">
              Введіть 6 цифр у віконця нижче або вставте номер кімнати:
            </p>
          </div>

          {/* 6 Separate Segmented Input Windows */}
          <div className="flex justify-center gap-2">
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`number-input-digit-${index + 1}`}
                ref={inputRefs[index]}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                autoComplete="off"
                className={`w-11 h-14 text-xl font-mono font-black text-center rounded-xl border-2 transition-all outline-none shadow-inner ${
                  digit
                    ? "bg-emerald-950/60 border-emerald-400 text-white shadow-emerald-900/30 scale-105"
                    : "bg-slate-950/70 border-slate-700 text-slate-400 focus:border-emerald-500 focus:bg-slate-900"
                }`}
              />
            ))}
          </div>

          {/* Clipboard Paste Helper Button */}
          <div className="flex items-center justify-center">
            <button
              id="paste-number-btn"
              type="button"
              onClick={handlePasteFromClipboard}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-emerald-950/30 transition-colors cursor-pointer"
            >
              <Clipboard className="w-3.5 h-3.5" /> Вставити з буфера обміну
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs text-center font-medium">
              {errorMsg}
            </div>
          )}

          {/* Action Button */}
          <button
            id="submit-join-by-number-btn"
            type="button"
            disabled={fullNumber.length !== 6}
            onClick={handleSubmit}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
          >
            <LogIn className="w-4 h-4" />
            <span>Приєднатися за номером</span>
            {fullNumber && <span className="font-mono text-amber-300 font-bold">#{fullNumber}</span>}
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
