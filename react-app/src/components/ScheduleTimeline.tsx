import React from "react";

interface ScheduleTimelineProps {
  pixelsPerHour: number;
  scheduleStartTime: Date;
  nowHourIndex: number;
}

const ScheduleTimeline: React.FC<ScheduleTimelineProps> = React.memo(
  ({ pixelsPerHour, scheduleStartTime, nowHourIndex }) => {
    const timelineItems = React.useMemo(() => {
      const hoursInAWeek = 24 * 7;
      const items = [];
      let lastDay = -1;

      const baseTimeMs = scheduleStartTime.getTime();
      for (let i = 0; i <= hoursInAWeek; i++) {
        const currentDate = new Date(baseTimeMs + i * 60 * 60 * 1000);
        const currentDayNum = currentDate.getDay();
        let showDayLabel = false;

        if (currentDayNum !== lastDay) {
          showDayLabel = true;
          lastDay = currentDayNum;
        }

        items.push({
          index: i,
          date: currentDate,
          showDayLabel,
          label: currentDate.toLocaleTimeString("en-NZ", {
            hour: "numeric",
            hour12: true,
          }),
          dayLabel: currentDate.toLocaleDateString("en-NZ", {
            weekday: "long",
          }),
        });
      }
      return items;
    }, [scheduleStartTime]);

    return (
      <div className="sticky left-0 z-50 w-24 shrink-0 bg-(--md-sys-color-background)">
        <div className="sticky top-0 z-60 flex h-24 items-center justify-center border-r border-b border-(--md-sys-color-outline) bg-(--md-sys-color-background)">
          <span className="font-bold text-(--md-sys-color-on-surface)">
            Time
          </span>
        </div>
        <div className="relative">
          {timelineItems.map((item) => (
            <div
              key={item.index}
              className="relative h-[120px] border-r border-b border-white/10 pr-2 text-right"
              style={{ height: `${pixelsPerHour.toString()}px` }}
            >
              {item.showDayLabel && (
                <div className="absolute -top-3 left-0 z-10 w-full text-center">
                  <span className="rounded-full border border-(--md-sys-color-outline) bg-(--md-sys-color-surface-variant) px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
                    {item.dayLabel}
                  </span>
                </div>
              )}
              <span
                className={`text-sm ${item.index === nowHourIndex ? "font-bold text-(--md-sys-color-primary)" : "text-white/60"}`}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

ScheduleTimeline.displayName = "ScheduleTimeline";

export default ScheduleTimeline;
