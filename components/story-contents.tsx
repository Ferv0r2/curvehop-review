"use client";

import { useEffect, useState } from "react";

type Section = { id: string; title: string };

export function StoryContents({ sections, placement }: {
  sections: Section[];
  placement: "inline" | "sidebar";
}) {
  const [active, setActive] = useState("");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const targets = [...sections.map(s => `story-${s.id}`), "reading-sources"];
      // A section becomes current as its heading reaches the reading position.
      const current = targets.filter(id => {
        const node = document.getElementById(id);
        return node && node.getBoundingClientRect().top <= 140;
      }).at(-1);
      setActive(current ?? "");
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  return <nav className={`story-contents story-contents-${placement}`} aria-label="이 이야기의 목차">
    <h2>이 글의 목차</h2>
    {sections.map((s, i) => <a key={s.id} href={`#story-${s.id}`} aria-current={active === `story-${s.id}` ? "location" : undefined}>
      <span aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>{s.title}
    </a>)}
    <a className="story-contents-evidence" href="#reading-sources" aria-current={active === "reading-sources" ? "location" : undefined}>참고 자료</a>
  </nav>;
}
