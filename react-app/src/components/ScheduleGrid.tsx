import React, { useEffect, useRef } from "react";
import { Channel, EpgData, Programme } from "../types";
import ProgramBlock from "./ProgramBlock";
import {
  findCurrentProgrammeIndex,
  findFirstVisibleProgrammeIndex,
  findFirstProgrammeStartingAfter,
} from "../utils/programmeUtils";

interface ScheduleGridProps {
  scrollTop: number;
  clientHeight: number;
  channels: Channel[];
  epg: EpgData;
  pixelsPerHour: number;
  scheduleStartTime: Date;
  nowLineOffset: number;
  onProgrammeSelect: (programme: Programme, channel: Channel) => void;
  isCovered?: boolean;
}

const ScheduleGrid: React.FC<ScheduleGridProps> = React.memo(
  ({
    channels,
    epg,
    pixelsPerHour,
    scheduleStartTime,
    nowLineOffset,
    onProgrammeSelect,
    isCovered,
    scrollTop,
    clientHeight,
  }) => {
    const gridRef = useRef<HTMLDivElement>(null);
    const lastFocusedCoordsRef = useRef<{
      channel: number;
      prog: number;
    } | null>(null);

    const memoizedSchedule = React.useMemo(() => {
      const start = scheduleStartTime.getTime();
      return channels
        .map((channel) => {
          const rawProgs = epg.get(channel.epg_id) ?? [];
          // Since programs are sorted by start time in tvService,
          // the first program that ENDS after our start time is the
          // starting point for what we need to render.
          const firstActiveIdx = findFirstVisibleProgrammeIndex(
            rawProgs,
            start,
          );

          return {
            channel,
            programmes:
              firstActiveIdx === -1 ? [] : rawProgs.slice(firstActiveIdx),
          };
        })
        .filter((item) => item.programmes.length > 0);
    }, [channels, epg, scheduleStartTime]);

    // Initial focus or focus restoration when uncovered
    useEffect(() => {
      if (isCovered) return;

      const focusTimer = setTimeout(
        () => {
          if (!gridRef.current) return;

          // If something is already focused in the grid, don't override
          if (gridRef.current.contains(document.activeElement)) return;

          let targetChannel: number;
          let targetProg: number;

          if (lastFocusedCoordsRef.current) {
            targetChannel = lastFocusedCoordsRef.current.channel;
            targetProg = lastFocusedCoordsRef.current.prog;

            // Safety check: ensure coordinates are still valid
            if (targetChannel >= memoizedSchedule.length) targetChannel = 0;
            if (
              targetProg >=
              (memoizedSchedule[targetChannel]?.programmes?.length || 0)
            )
              targetProg = 0;
          } else {
            // Default to "Now" for the first channel
            targetChannel = 0;
            const now = Date.now();
            const firstChannelProgs = memoizedSchedule[0]?.programmes ?? [];
            const nowIdx = findCurrentProgrammeIndex(
              firstChannelProgs,
              new Date(now),
            );
            targetProg = nowIdx === -1 ? 0 : nowIdx;
          }

          const targetEl = gridRef.current.querySelector<HTMLElement>(
            `[data-channel="${targetChannel.toString()}"][data-prog="${targetProg.toString()}"]`,
          );
          if (targetEl) {
            targetEl.focus({ preventScroll: true });
          }
        },
        isCovered === undefined ? 300 : 50,
      ); // Shorter delay when just uncovering

      return () => {
        clearTimeout(focusTimer);
      };
    }, [memoizedSchedule, isCovered]);

    const handleHorizontalNav = (
      key: string,
      channelIdx: number,
      progIdx: number,
    ) => {
      const currentProg = memoizedSchedule[channelIdx].programmes[progIdx];
      const currentTime = currentProg.startMs + 1000;
      const nextChannel =
        key === "ArrowLeft"
          ? Math.max(0, channelIdx - 1)
          : Math.min(memoizedSchedule.length - 1, channelIdx + 1);
      if (nextChannel === channelIdx) return { nextChannel, nextProg: progIdx };

      const nextProgs = memoizedSchedule[nextChannel].programmes;

      const foundIdx = findCurrentProgrammeIndex(
        nextProgs,
        new Date(currentTime),
      );
      if (foundIdx === -1) {
        const closestIdx = findFirstProgrammeStartingAfter(
          nextProgs,
          currentTime,
        );
        return {
          nextChannel,
          nextProg: closestIdx === -1 ? nextProgs.length - 1 : closestIdx,
        };
      }
      return { nextChannel, nextProg: foundIdx };
    };

    const getNextIndices = (
      key: string,
      channelIdx: number,
      progIdx: number,
    ) => {
      if (key === "ArrowLeft" || key === "ArrowRight") {
        return handleHorizontalNav(key, channelIdx, progIdx);
      }
      if (key === "ArrowUp") {
        return { nextChannel: channelIdx, nextProg: Math.max(0, progIdx - 1) };
      }
      if (key === "ArrowDown") {
        const programmesLen =
          memoizedSchedule[channelIdx]?.programmes.length || 1;
        return {
          nextChannel: channelIdx,
          nextProg: Math.min(programmesLen - 1, progIdx + 1),
        };
      }
      return { nextChannel: channelIdx, nextProg: progIdx };
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const grid = gridRef.current;
      if (!grid) return;

      const isInternalFocus = active !== null && grid.contains(active);
      const channelIdxStr = isInternalFocus
        ? (active.dataset.channel ?? null)
        : null;
      const progIdxStr = isInternalFocus ? (active.dataset.prog ?? null) : null;

      if (channelIdxStr === null || progIdxStr === null) {
        if (
          ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)
        ) {
          e.preventDefault();
          const targetChannel = lastFocusedCoordsRef.current?.channel ?? 0;
          const targetProg = lastFocusedCoordsRef.current?.prog ?? 0;
          const el = grid.querySelector<HTMLElement>(
            `[data-channel="${targetChannel.toString()}"][data-prog="${targetProg.toString()}"]`,
          );
          el?.focus();
        }
        return;
      }

      const channelIdx = Number.parseInt(channelIdxStr, 10);
      const progIdx = Number.parseInt(progIdxStr, 10);

      if (
        !["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        return;
      }

      const { nextChannel, nextProg } = getNextIndices(
        e.key,
        channelIdx,
        progIdx,
      );

      if (nextChannel !== channelIdx || nextProg !== progIdx) {
        e.preventDefault();
        const nextEl = grid.querySelector<HTMLElement>(
          `[data-channel="${nextChannel.toString()}"][data-prog="${nextProg.toString()}"]`,
        );
        if (nextEl) {
          lastFocusedCoordsRef.current = {
            channel: nextChannel,
            prog: nextProg,
          };
          nextEl.focus();
          nextEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
        }
      }
    };

    return (
      <div
        ref={gridRef}
        className="relative shrink-0 grow outline-none"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        role="grid"
      >
        <div className="sticky top-0 z-40 flex bg-(--md-sys-color-background)">
          {memoizedSchedule.map(({ channel }) => (
            <div
              key={channel.id}
              className="flex h-24 w-48 shrink-0 items-center justify-center border-r border-b border-(--md-sys-color-outline) bg-[#1a1a1a] p-4"
            >
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-600 p-2 shadow-sm">
                <img
                  src={channel.logo}
                  alt={`${channel.name} logo`}
                  className="max-h-full max-w-full object-contain drop-shadow-sm"
                  loading="lazy"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex">
          {memoizedSchedule.map(({ channel, programmes }, cIdx) => {
            // Virtualization: Only render programs within the visible window (+ buffer)
            const bufferPx = pixelsPerHour * 4; // 4 hours buffer above and below
            const visibleTop = scrollTop - bufferPx;
            const visibleBottom = scrollTop + clientHeight + bufferPx;

            const visibleTopTime =
              (visibleTop / pixelsPerHour) * (1000 * 60 * 60) +
              scheduleStartTime.getTime();
            const visibleBottomTime =
              (visibleBottom / pixelsPerHour) * (1000 * 60 * 60) +
              scheduleStartTime.getTime();

            const startIndex = findFirstVisibleProgrammeIndex(
              programmes,
              visibleTopTime,
            );

            const lastIndex =
              startIndex === -1
                ? -1
                : findFirstProgrammeStartingAfter(
                    programmes,
                    visibleBottomTime,
                  );

            const endIndex = lastIndex === -1 ? programmes.length : lastIndex;

            const visibleProgrammes =
              startIndex === -1
                ? []
                : programmes.slice(startIndex, endIndex).map((prog, i) => ({
                    prog,
                    originalIdx: startIndex + i,
                  }));

            return (
              <div
                key={channel.id}
                className="relative w-48 shrink-0 border-r border-white/10"
                role="row"
              >
                {visibleProgrammes.map(({ prog, originalIdx: pIdx }) => (
                  <ProgramBlock
                    key={prog.start.toISOString() + prog.title}
                    programme={prog}
                    pixelsPerHour={pixelsPerHour}
                    scheduleStartTime={scheduleStartTime}
                    onSelect={() => {
                      lastFocusedCoordsRef.current = {
                        channel: cIdx,
                        prog: pIdx,
                      };
                      onProgrammeSelect(prog, channel);
                    }}
                    data-channel={cIdx.toString()}
                    data-prog={pIdx.toString()}
                    id={`prog-${cIdx.toString()}-${pIdx.toString()}`}
                    className="focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  />
                ))}
              </div>
            );
          })}
          <div
            className="absolute left-0 z-30 h-0.5 w-full bg-(--md-sys-color-primary)"
            style={{
              top: `${nowLineOffset.toString()}px`,
              boxShadow: "var(--glow-shadow-primary)",
            }}
            role="presentation"
          >
            <div className="absolute -top-1.5 -left-2 h-3 w-3 rounded-full border-2 border-white bg-(--md-sys-color-primary)"></div>
          </div>
        </div>
      </div>
    );
  },
);

ScheduleGrid.displayName = "ScheduleGrid";

export default ScheduleGrid;
