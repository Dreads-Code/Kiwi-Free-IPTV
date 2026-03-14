import React, { useEffect, useRef, useMemo } from "react";
import { Channel, EpgData, Programme } from "../types";
import ScheduleTimeline from "./ScheduleTimeline";
import ScheduleGrid from "./ScheduleGrid";

/**
 * Modal component that wraps the 7-day schedule grid and timeline.
 * Handles auto-scrolling to the current time when opened.
 */
interface ScheduleModalProps {
  isOpen: boolean;
  isCovered?: boolean;
  onClose: () => void;
  channels: Channel[];
  epg: EpgData;
  onProgrammeSelect: (programme: Programme, channel: Channel) => void;
}

const PIXELS_PER_HOUR = 120;
const PAST_HOURS_TO_SHOW = 2;

const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  isCovered,
  onClose,
  channels,
  epg,
  onProgrammeSelect,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [clientHeight, setClientHeight] = React.useState(1000);

  const { scheduleStartTime, nowLineOffset } = useMemo(() => {
    if (!isOpen) return { scheduleStartTime: null, nowLineOffset: 0 };

    const now = new Date();

    // Align start time to the beginning of the hour for clean timeline labels
    const startTime = new Date(now);
    startTime.setHours(startTime.getHours() - PAST_HOURS_TO_SHOW, 0, 0, 0);

    // Calculate offset based on absolute time difference
    const diffMs = now.getTime() - startTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const offset = diffHours * PIXELS_PER_HOUR;

    return { scheduleStartTime: startTime, nowLineOffset: offset };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && scrollContainerRef.current && nowLineOffset > 0) {
      const timer = setTimeout(() => {
        const scrollContainer = scrollContainerRef.current;
        if (scrollContainer) {
          const containerHeight = scrollContainer.clientHeight;
          const centeredScrollTop = nowLineOffset - containerHeight / 2;

          scrollContainer.scrollTo({
            top: centeredScrollTop,
            behavior: "instant",
          });
          setScrollTop(Math.max(0, centeredScrollTop));
          setClientHeight(containerHeight);
        }
      }, 50);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isOpen, nowLineOffset]);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      setClientHeight(target.clientHeight);
    });
  }, []);

  if (!isOpen || !scheduleStartTime) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-30 flex flex-col bg-black/80 p-4 backdrop-blur-md sm:p-6 lg:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h2 className="text-2xl font-bold text-white drop-shadow-lg">
          7-Day Schedule
        </h2>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-(--md-sys-color-outline) bg-(--md-sys-color-surface) text-2xl font-bold text-(--md-sys-color-on-surface) shadow-lg transition-colors hover:bg-(--md-sys-color-primary) hover:text-black"
          aria-label="Close schedule"
        >
          &times;
        </button>
      </div>
      <div className="relative flex grow overflow-hidden rounded-lg border border-(--md-sys-color-outline) bg-(--md-sys-color-background) shadow-2xl shadow-black/50">
        <div
          ref={scrollContainerRef}
          className="custom-scrollbar grow overflow-auto"
          onScroll={handleScroll}
        >
          <div className="relative flex w-fit min-w-full">
            <ScheduleTimeline
              pixelsPerHour={PIXELS_PER_HOUR}
              scheduleStartTime={scheduleStartTime}
              nowHourIndex={PAST_HOURS_TO_SHOW}
            />
            <ScheduleGrid
              channels={channels}
              epg={epg}
              pixelsPerHour={PIXELS_PER_HOUR}
              scheduleStartTime={scheduleStartTime}
              nowLineOffset={nowLineOffset}
              onProgrammeSelect={onProgrammeSelect}
              isCovered={isCovered}
              scrollTop={scrollTop}
              clientHeight={clientHeight}
            />
          </div>
        </div>
      </div>
      <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 0.2s ease-in-out;
                }
            `}</style>
    </div>
  );
};

export default ScheduleModal;
