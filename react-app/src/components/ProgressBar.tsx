import React, { useState, useEffect } from "react";

interface ProgressBarProps {
  start: Date;
  stop: Date;
}

const calculateProgress = (start: Date, stop: Date): number => {
  const now = Date.now();
  const startTime = start.getTime();
  const stopTime = stop.getTime();

  if (now < startTime) return 0;
  if (now > stopTime) return 100;

  const totalDuration = stopTime - startTime;
  const elapsed = now - startTime;

  return (elapsed / totalDuration) * 100;
};

const ProgressBar: React.FC<ProgressBarProps> = ({ start, stop }) => {
  const [progress, setProgress] = useState(() => calculateProgress(start, stop));

  useEffect(() => {
    // Recalculate when props change is handled by key prop in parent

    const interval = setInterval(() => {
      setProgress(calculateProgress(start, stop));
    }, 30_000); // Update every 30 seconds

    return () => {
      clearInterval(interval);
    };
  }, [start, stop]);

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/30">
      <div
        className="h-full rounded-full bg-(--md-sys-color-primary) transition-all duration-500 ease-linear"
        style={{
          width: `${progress.toString()}%`,
          boxShadow: "0 0 8px var(--md-sys-color-primary)",
        }}
      ></div>
    </div>
  );
};

export default ProgressBar;
