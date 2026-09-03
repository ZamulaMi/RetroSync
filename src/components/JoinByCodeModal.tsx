import React, { useState, useRef, useEffect } from "react";
import { KeyRound, LogIn, X, Clipboard, ArrowRight } from "lucide-react";
import { parseRoomIdentifier } from "../utils/roomUtils";

interface JoinByCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (code: string) => void;
}

export const JoinByCodeModal: React.FC<JoinByCodeModalProps> = ({
  isOpen,
  onClose,
  onJoin,
}) => {
  const [chars, setChars] = useState<string[]>(["", "", "", ""]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    if (isOpen) {
      setChars(["", "", "", ""]);
      setErrorMsg(null);
      setTimeout(() => {
        inputRefs[0].current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fullCode = chars.join("").trim().toUpperCase();

  const handleCharChange = (index: number, val: string) => {
    setErrorMsg(null);
    const sanitized = val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    if (sanitized.length > 1) {
      applyCodeString(sanitized, index);
      return;
    }

    const next = [...chars];
    next[index] = sanitized;
    setChars(next);

    if (sanitized && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!chars[index] && index > 0) {
        inputRefs[index - 1].current?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs[index - 1].current?.focus();
    } else if (e.key === "ArrowRight" && index < 3) {
      inputRefs[index + 1].current?.focus();
    } else if (e.key === "Enter" && fullCode.length === 4) {
      handleSubmit();
    }
  };

  const applyCodeString = (str: string, startIndex: number = 0) => {
    const parsed = parseRoomIdentifier(str);
    const clean = parsed || str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    // If a 6-digit room number was pasted into this modal, join directly
    if (clean.length === 6 && /^\d{6}$/.test(clean)) {
      onJoin(clean);
      onClose();
      return;
    }

    const next = [...chars];
    for (let i = 0; i < 4; i++) {
      const targetIdx = startIndex + i;
      if (targetIdx < 4 && i < clean.length) {
        next[targetIdx] = clean[i];
      }
    }
    setChars(next);
    const lastFilled = Math.min(3, startIndex + clean.length);
    inputRefs[lastFilled].current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    applyCodeString(pasted, 0);
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        applyCodeString(text, 0);
      }
    } catch {
      setErrorMsg("Буфер обміну недоступний. Вставте код клавішами Ctrl+V");
    }
  };

  const handleSubmit = () => {
    if (fullCode.length !== 4) {
      setErrorMsg("Код кімнати має містити рівно 4 символи (наприклад: A7X9).");
      return;
    }
    onJoin(fullCode);
    onClose();
  };

  return (
    <div
      id="join-by-code-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-slate-900 border-b border-indigo-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/30 border border-indigo-500/50 text-indigo-300">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Вхід за кодом кімнати
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                  4 знаки
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Окреме вікно для введення символьного 4-значного коду
              </p>
            </div>
          </div>
          <button
            id="close-code-modal-btn"
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
              Введіть 4 символи коду у віконця нижче або вставте код кімнати:
            </p>
          </div>

          {/* 4 Separate Segmented Input Windows */}
          <div className="flex justify-center gap-3">
            {chars.map((char, index) => (
              <input
                key={index}
                id={`code-input-char-${index + 1}`}
                ref={inputRefs[index]}
                type="text"
                maxLength={1}
                value={char}
                onChange={(e) => handleCharChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                autoComplete="off"
                className={`w-14 h-16 text-2xl font-mono font-black text-center uppercase rounded-xl border-2 transition-all outline-none shadow-inner ${
                  char
                    ? "bg-indigo-950/60 border-indigo-400 text-white shadow-indigo-900/30 scale-105"
                    : "bg-slate-950/70 border-slate-700 text-slate-400 focus:border-indigo-500 focus:bg-slate-900"
                }`}
              />
            ))}
          </div>

          {/* Clipboard Paste Helper Button */}
          <div className="flex items-center justify-center">
            <button
              id="paste-code-btn"
              type="button"
              onClick={handlePasteFromClipboard}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-indigo-950/30 transition-colors cursor-pointer"
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
            id="submit-join-by-code-btn"
            type="button"
            disabled={fullCode.length !== 4}
            onClick={handleSubmit}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
          >
            <LogIn className="w-4 h-4" />
            <span>Підключитися за кодом</span>
            {fullCode && <span className="font-mono text-cyan-300 font-bold">#{fullCode}</span>}
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
};
