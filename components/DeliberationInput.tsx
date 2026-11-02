"use client";

import { useSyncExternalStore } from "react";

const PLACEHOLDERS: Record<string, string> = {
  zh: "輸入議題，按 Enter 送出...",
  ja: "議題を入力して Enter キーで送信...",
  en: "type question and press Enter...",
};



interface DeliberationInputProps {
  topic: string;
  onTopicChange: (v: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
}

export default function DeliberationInput({
  topic,
  onTopicChange,
  onSubmit,
  isProcessing,
}: DeliberationInputProps) {
  const placeholder = useSyncExternalStore(
    () => () => {},
    () => {
      const code = navigator.language || "";
      if (code.startsWith("zh")) return PLACEHOLDERS.zh;
      if (code.startsWith("ja")) return PLACEHOLDERS.ja;
      return PLACEHOLDERS.en;
    },
    () => PLACEHOLDERS.en,
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229 && !e.repeat && !isProcessing && topic.trim()) {
      e.preventDefault();
      e.currentTarget.blur();
      onSubmit();
    }
  };

  return (
    <div className="input-container">
      <span className="input-row-label">access code:</span>
      <span className="input-access-code">{"*".repeat(24)}</span>

      <span className="input-row-label">question:</span>
      <input
        className="input-question"
        type="text"
        value={topic}
        onChange={(e) => onTopicChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isProcessing}
        maxLength={500}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
