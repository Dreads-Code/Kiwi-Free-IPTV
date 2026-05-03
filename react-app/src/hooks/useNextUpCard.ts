import { useState, useEffect } from "react";
import type { Programme } from "../types";

function computeShowNextUp(programme: Programme | null): boolean {
  if (!programme) return false;
  const now = Date.now();
  const endTime = programme.stop.getTime();
  return now >= endTime - 60_000 && now < endTime;
}

export function useNextUpCard(currentProgramme: Programme | null) {
  const [showNextUp, setShowNextUp] = useState(() =>
    computeShowNextUp(currentProgramme),
  );

  // React-approved: setState during render to sync derived state when programme changes
  const [prevProgramme, setPrevProgramme] = useState(currentProgramme);
  if (prevProgramme !== currentProgramme) {
    setPrevProgramme(currentProgramme);
    setShowNextUp(computeShowNextUp(currentProgramme));
  }

  useEffect(() => {
    if (!currentProgramme) return;

    const now = Date.now();
    const endTime = currentProgramme.stop.getTime();
    const showTime = endTime - 60_000;

    let showTimeout: ReturnType<typeof setTimeout> | null = null;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    if (showTime > now) {
      showTimeout = setTimeout(() => {
        setShowNextUp(true);
      }, showTime - now);
    }

    if (endTime > now) {
      hideTimeout = setTimeout(() => {
        setShowNextUp(false);
      }, endTime - now);
    }

    return () => {
      if (showTimeout) clearTimeout(showTimeout);
      if (hideTimeout) clearTimeout(hideTimeout);
    };
  }, [currentProgramme]);

  return showNextUp;
}
