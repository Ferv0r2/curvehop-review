"use client";

import { useEffect, useState } from "react";
import { trackAnalytics } from "@/lib/analytics-client";
import { bookmarkPrefix, bookmarkChanged } from "@/lib/bookmarks";

/**
 * The button's words and name start alike. With words, they tell the state; the
 * icon alone is a toggle with a fixed name, and aria-pressed tells the state.
 */
export function bookmarkLabel(saved: boolean, expanded: boolean, title: string) {
  const text = saved ? "저장한 공고" : "공고 저장하기";
  return expanded
    ? { text, name: `${text}: ${title}`, pressed: undefined }
    : { text: "", name: `공고 저장: ${title}`, pressed: saved };
}

export function Bookmark({
  id,
  title,
  expanded = false,
}: {
  id: string;
  title: string;
  expanded?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const key = `${bookmarkPrefix}${id}`;
  useEffect(() => {
    function sync() {
      try {
        setSaved(localStorage.getItem(key) === "1");
        setReady(true);
      } catch {
        setError("이 브라우저에서는 저장할 수 없어요.");
      }
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(bookmarkChanged, sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(bookmarkChanged, sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [key]);
  function toggle() {
    try {
      const next = localStorage.getItem(key) !== "1";
      if (next) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
      trackAnalytics({ name: "bookmark_change", job_id: id, action: next ? "add" : "remove" });
      setSaved(next);
      setError("");
      window.dispatchEvent(new Event(bookmarkChanged));
    } catch {
      setError("저장하지 못했어요. 브라우저 설정을 확인해 주세요.");
    }
  }
  const label = bookmarkLabel(saved, expanded, title);
  return (
    <span className={expanded ? "bookmark-wrap expanded" : "bookmark-wrap"}>
      <button
        type="button"
        className={`bookmark ${saved ? "is-saved" : ""} ${expanded ? "wide" : ""}`}
        onClick={toggle}
        disabled={!ready}
        aria-label={label.name}
        aria-pressed={label.pressed}
        title="이 브라우저에 저장"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={saved ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M6 4h12v17l-6-4-6 4z" />
        </svg>
        {label.text}
      </button>
      {error && (
        <span className="storage-error" role="status">
          {error}
        </span>
      )}
    </span>
  );
}
