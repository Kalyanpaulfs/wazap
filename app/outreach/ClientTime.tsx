"use client";
// FEAT-QUEUE: hydration-safe local time - the ISO string from the API is
// rendered in the visitor's own browser timezone via useEffect, never
// inline during render, so there's no server/client mismatch.
import { useEffect, useState } from "react";

export default function ClientTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    // Intentional: this is what makes the render hydration-safe (server
    // renders nothing, the viewer's own browser fills in local time).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  }, [iso]);

  return <span suppressHydrationWarning>{text}</span>;
}
