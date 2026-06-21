import React from "react";
import { Programme } from "../types";
import RatingBadge from "./RatingBadge";

/**
 * Component representing a single programme block in the schedule grid.
 * Positioned and sized based on start time and duration.
 */
interface ProgramBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  programme: Programme;
  pixelsPerHour: number;
  scheduleStartTime: Date;
  onSelect: () => void;
}

const MIN_HEIGHT = 60; // Enforce a minimum height for visibility

const getCategoryColor = (category?: string): string => {
  if (!category) return "bg-slate-800/60 border-slate-700 hover:bg-slate-700/80";

  const cat = category.toLowerCase();
  if (cat.includes("movie")) return "bg-blue-900/90 border-blue-700 hover:bg-blue-800";
  if (cat.includes("sport")) return "bg-green-900/90 border-green-700 hover:bg-green-800";
  if (cat.includes("news")) return "bg-amber-900/90 border-amber-700 hover:bg-amber-800";
  if (cat.includes("drama")) return "bg-purple-900/90 border-purple-700 hover:bg-purple-800";
  if (cat.includes("children") || cat.includes("kids"))
    return "bg-pink-900/90 border-pink-700 hover:bg-pink-800";

  return "bg-slate-800/90 border-slate-700 hover:bg-slate-700";
};

const ProgramBlock: React.FC<ProgramBlockProps> = React.memo(
  ({ programme, pixelsPerHour, scheduleStartTime, onSelect, className, ...rest }) => {
    const startTimeMs = programme.startMs;
    const stopTimeMs = programme.stopMs;
    const scheduleStartMs = scheduleStartTime.getTime();

    const effectiveStartMs = Math.max(startTimeMs, scheduleStartMs);

    const startOffsetMs = effectiveStartMs - scheduleStartMs;
    const top = (startOffsetMs / (1000 * 60 * 60)) * pixelsPerHour;

    const durationMs = stopTimeMs - startTimeMs;
    const calculatedHeight = (durationMs / (1000 * 60 * 60)) * pixelsPerHour;

    const height = Math.max(calculatedHeight, MIN_HEIGHT);

    if (stopTimeMs < scheduleStartMs) {
      return null;
    }

    const showDetails = height > 40;
    const bgColor = getCategoryColor(programme.categories?.[0]);

    return (
      <div
        {...rest}
        onClick={() => {
          onSelect();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`absolute w-full overflow-hidden rounded-lg border p-2 text-white transition-all duration-200 ${bgColor} cursor-pointer hover:z-10 focus:z-30 focus:scale-[1.02] focus:shadow-[0_0_20px_rgba(255,255,255,0.4)] focus:ring-4 focus:ring-white focus:outline-none ${className ?? ""}`}
        style={{
          top: `${top.toString()}px`,
          height: `${(height - 2).toString()}px`,
          left: "2px",
          width: "calc(100% - 4px)",
        }}
        title={`${programme.title}\n${programme.description}`}
      >
        <p className="line-clamp-2 text-sm leading-tight font-bold">{programme.title}</p>
        {showDetails && (
          <div className="mt-1 space-y-1">
            <p className="line-clamp-3 text-xs text-white/70">{programme.description}</p>
            <div className="flex items-center gap-2 pt-1">
              {programme.isNew && (
                <span className="shrink-0 rounded-full bg-(--md-sys-color-primary) px-2 py-0.5 text-[10px] font-bold text-(--md-sys-color-on-primary)">
                  NEW
                </span>
              )}
              {programme.rating && <RatingBadge rating={programme.rating} />}
            </div>
          </div>
        )}
      </div>
    );
  },
);

ProgramBlock.displayName = "ProgramBlock";

export default ProgramBlock;
