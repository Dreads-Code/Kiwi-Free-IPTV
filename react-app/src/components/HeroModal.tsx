import React, { useMemo, useEffect, useRef } from "react";
import { Channel, EpgData, Programme } from "../types";
import ProgressBar from "./ProgressBar";
import { useProgramImage } from "../hooks/useShowImage";
import RatingBadge from "./RatingBadge";
import { countryCodeMap } from "../utils/countryCodes";

/**
 * Component for the expanded modal showing detailed information about a programme.
 * Includes poster, description, rating, next-up list, and playback controls.
 */
interface ExpandedDetailProps {
  config: {
    programme: Programme;
    channel: Channel;
    context: "live" | "schedule";
  } | null;
  onClose: () => void;
  onPlay: (url: string) => void;
  onOpenSchedule: () => void;
  epg: EpgData;
}

const FlagIcon: React.FC<{ countryName: string }> = ({ countryName }) => {
  const countryCode = countryCodeMap[countryName];
  if (countryCode) {
    return (
      <img
        src={`https://flagsapi.com/${countryCode}/shiny/24.png`}
        alt={countryName}
        className="h-4 w-4 rounded-sm object-cover"
        // Add an error handler to show a fallback icon if the flag fails to load
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
    );
  }
  // Fallback to globe icon
  return <span className="material-symbols-outlined">public</span>;
};

const InfoTag: React.FC<{
  icon: React.ReactNode;
  label: string;
  title?: string;
}> = ({ icon, label, title }) => (
  <div
    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 backdrop-blur-sm"
    title={title ?? label}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </div>
);

const findNextProgrammes = (
  programmes: Programme[] | undefined,
  currentProgramme: Programme,
  count: number,
): Programme[] => {
  if (!programmes) return [];

  // Find index using a simple scan.
  const currentIndex = programmes.findIndex(
    (p) =>
      p.start.getTime() === currentProgramme.start.getTime() &&
      p.title === currentProgramme.title,
  );

  return currentIndex === -1
    ? []
    : programmes.slice(currentIndex + 1, currentIndex + 1 + count);
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const ExpandedDetail: React.FC<ExpandedDetailProps> = React.memo(
  ({ config, onClose, onPlay, onOpenSchedule, epg }) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const watchNowButtonRef = useRef<HTMLButtonElement>(null);
    const scheduleButtonRef = useRef<HTMLButtonElement>(null);

    const isOpen = !!config;
    const { programme, channel, context } = config ?? {};

    const isLive = useMemo(() => {
      if (!programme) return false;
      const now = new Date();
      return now >= programme.start && now < programme.stop;
    }, [programme]);

    const channelProgrammes = useMemo(
      () => (channel ? epg.get(channel.epg_id) : []),
      [channel, epg],
    );
    const nextProgrammes = useMemo(
      () =>
        (context === "live" || isLive) && programme
          ? findNextProgrammes(channelProgrammes, programme, 2)
          : [],
      [channelProgrammes, programme, context, isLive],
    );

    const { posterUrl } = useProgramImage(programme, channel);

    const displayCategory = useMemo(() => {
      const categories = programme?.categories;
      if (!categories || categories.length === 0) return null;
      // Prefer a more specific category over a generic one like "Lifestyle"
      return (
        categories.find(
          (c) => !["lifestyle", "other"].includes(c.toLowerCase()),
        ) ?? categories[0]
      );
    }, [programme?.categories]);

    useEffect(() => {
      if (isOpen && (context === "live" || isLive)) {
        const timer = setTimeout(() => {
          watchNowButtonRef.current?.focus();
        }, 150);
        return () => {
          clearTimeout(timer);
        };
      } else if (isOpen) {
        const timer = setTimeout(() => {
          closeButtonRef.current?.focus();
        }, 150);
        return () => {
          clearTimeout(timer);
        };
      }
    }, [isOpen, context, isLive]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const focusableElements = [
        watchNowButtonRef.current,
        scheduleButtonRef.current,
        closeButtonRef.current,
      ].filter(Boolean) as HTMLElement[];

      if (focusableElements.length === 0) return;

      if (e.key === "Tab") {
        e.preventDefault();
        const activeElement = document.activeElement;
        const currentIndex = focusableElements.indexOf(
          activeElement as HTMLElement,
        );
        const nextIndex =
          (currentIndex + (e.shiftKey ? -1 : 1) + focusableElements.length) %
          focusableElements.length;
        focusableElements[nextIndex].focus();
        return;
      }

      if (
        ["ArrowLeft", "ArrowRight"].includes(e.key) &&
        (context === "live" || isLive)
      ) {
        const activeElement = document.activeElement;
        if (
          activeElement === watchNowButtonRef.current &&
          e.key === "ArrowRight"
        ) {
          scheduleButtonRef.current?.focus();
        } else if (
          activeElement === scheduleButtonRef.current &&
          e.key === "ArrowLeft"
        ) {
          watchNowButtonRef.current?.focus();
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (
        ["Enter", " "].includes(e.key) &&
        document.activeElement !== modalRef.current
      ) {
        e.stopPropagation();
      }
    };

    const handlePlayClick = () => {
      if (channel) onPlay(channel.url);
    };

    return (
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          handleKeyDown(e);
        }}
        role="button"
        // Ensure the backend handles keyboard events for accessibility
        tabIndex={0}
        // aria-modal is handled by the inner dialog container
        aria-hidden={!isOpen}
        aria-labelledby={programme ? "detail-program-title" : undefined}
      >
        <div className="absolute inset-0 bg-black/60"></div>

        <div
          ref={modalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          className={`absolute right-0 bottom-0 left-0 mx-auto w-full max-w-5xl rounded-t-(--border-radius-xl) border-t-2 border-(--md-sys-color-primary) bg-(--md-sys-color-surface) p-4 shadow-2xl shadow-black/50 backdrop-blur-(--glass-backdrop-blur) transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none md:p-6 lg:p-8 ${isOpen ? "translate-y-0" : "translate-y-full"} custom-scrollbar max-h-[90vh] overflow-y-auto`}
        >
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="absolute top-4 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-(--md-sys-color-outline) bg-(--md-sys-color-surface) text-2xl font-bold text-(--md-sys-color-on-surface) shadow-lg transition-colors hover:bg-(--md-sys-color-primary) hover:text-(--md-sys-color-on-primary) focus:ring-2 focus:ring-(--md-sys-color-primary) focus:outline-none"
            aria-label="Close details"
          >
            &times;
          </button>

          {!channel || !programme ? (
            <div className="py-10 text-center">
              <p className="text-lg text-gray-400">
                Program information not available.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="md:col-span-1">
                <img
                  src={posterUrl ?? channel.logo}
                  alt={programme.title}
                  className={`aspect-video w-full rounded-(--border-radius-lg) object-cover shadow-xl md:aspect-2/3 ${posterUrl ? "" : "p-8"}`}
                />
              </div>
              <div className="flex flex-col md:col-span-2">
                <div className="grow">
                  <div className="mb-2 flex items-end gap-3">
                    <img
                      src={channel.logo}
                      alt=""
                      className="h-10 max-h-10 object-contain"
                    />
                    <p className="pb-1 text-lg font-medium text-gray-400">
                      {channel.name}
                    </p>
                  </div>

                  <h3
                    id="detail-program-title"
                    className="mb-2 text-xl font-bold text-white md:text-2xl"
                  >
                    {programme.title}
                  </h3>

                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {programme.rating && (
                      <RatingBadge rating={programme.rating} />
                    )}
                    {programme.isNew && (
                      <div className="rounded-md bg-(--md-sys-color-primary) px-2 py-1 text-xs font-bold text-(--md-sys-color-on-primary)">
                        NEW
                      </div>
                    )}
                    {programme.episodeNum && (
                      <span className="truncate text-sm text-gray-300">
                        {programme.episodeNum}
                      </span>
                    )}
                  </div>

                  <p className="mb-4 text-sm text-(--md-sys-color-on-surface-variant)">
                    {programme.description}
                  </p>

                  {/* Info Tags Bar */}
                  <div className="my-4 flex flex-wrap items-center gap-2">
                    {programme.starRating &&
                      programme.starRating !== "0/10" && (
                        <InfoTag
                          icon={
                            <span className="material-symbols-outlined text-amber-400">
                              grade
                            </span>
                          }
                          label={programme.starRating}
                          title="Star Rating"
                        />
                      )}
                    {displayCategory && (
                      <InfoTag
                        icon={
                          <span className="material-symbols-outlined">
                            movie
                          </span>
                        }
                        label={displayCategory}
                        title="Category"
                      />
                    )}
                    {programme.country && (
                      <InfoTag
                        icon={<FlagIcon countryName={programme.country} />}
                        label={programme.country}
                        title="Country of Origin"
                      />
                    )}
                    {programme.videoQuality && (
                      <InfoTag
                        icon={
                          <span className="material-symbols-outlined">hd</span>
                        }
                        label={programme.videoQuality}
                        title="Video Quality"
                      />
                    )}
                    {programme.audio && (
                      <InfoTag
                        icon={
                          <span className="material-symbols-outlined">
                            surround_sound
                          </span>
                        }
                        label={
                          programme.audio.charAt(0).toUpperCase() +
                          programme.audio.slice(1)
                        }
                        title="Audio Format"
                      />
                    )}
                    {programme.subtitles && (
                      <InfoTag
                        icon={
                          <span className="material-symbols-outlined">
                            subtitles
                          </span>
                        }
                        label={programme.subtitles}
                        title="Subtitles Available"
                      />
                    )}
                  </div>

                  {isLive ? (
                    <div className="mt-4">
                      <ProgressBar
                        key={programme.start.getTime()}
                        start={programme.start}
                        stop={programme.stop}
                      />
                      <div className="mt-1 flex justify-between text-xs text-gray-300">
                        <span>{formatTime(programme.start)}</span>
                        <span>{formatTime(programme.stop)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-center">
                      <p className="text-xs font-semibold tracking-wider text-gray-300 uppercase">
                        Airs At
                      </p>
                      <p className="font-mono text-lg text-white">
                        {formatTime(programme.start)} -{" "}
                        {formatTime(programme.stop)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {programme.start.toLocaleDateString("en-NZ", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                  )}

                  {context === "live" && nextProgrammes.length > 0 && (
                    <div className="mt-6">
                      <h4 className="mb-2 text-sm font-semibold tracking-wider text-gray-300 uppercase">
                        Next Up
                      </h4>
                      <div className="space-y-2">
                        {nextProgrammes.map((prog) => (
                          <div
                            key={prog.start.toISOString()}
                            className="flex items-center justify-between border-t border-white/10 pt-2 text-sm first:border-t-0 first:pt-0"
                          >
                            <p className="truncate pr-4 text-gray-200">
                              {prog.title}
                            </p>
                            <p className="shrink-0 font-mono text-gray-400">
                              {formatTime(prog.start)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {(context === "live" || isLive) && (
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      ref={watchNowButtonRef}
                      onClick={handlePlayClick}
                      className="flex items-center gap-2 rounded-full bg-(--md-sys-color-primary) px-6 py-3 font-bold text-(--md-sys-color-on-primary) shadow-lg transition-transform hover:scale-105 focus:ring-2 focus:ring-(--md-sys-color-primary) focus:ring-offset-2 focus:ring-offset-(--md-sys-color-surface) focus:outline-none"
                      style={{ textShadow: "1px 1px 2px rgba(0,0,0,0.3)" }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-6 w-6"
                      >
                        <path
                          fillRule="evenodd"
                          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm14.024-.983a1.125 1.125 0 010 1.966l-5.603 3.113A1.125 1.125 0 019 15.113V8.887c0-.857.921-1.4 1.671-.983l5.603 3.113z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Watch Now
                    </button>
                    <button
                      ref={scheduleButtonRef}
                      onClick={onOpenSchedule}
                      className="flex items-center gap-2 rounded-full border border-(--md-sys-color-outline) bg-white/10 px-6 py-3 font-bold text-(--md-sys-color-on-surface) transition-all hover:scale-105 hover:border-white/50 hover:bg-white/20 focus:ring-2 focus:ring-(--md-sys-color-primary) focus:ring-offset-2 focus:ring-offset-(--md-sys-color-surface) focus:outline-none"
                    >
                      Full Schedule
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
);

ExpandedDetail.displayName = "ExpandedDetail";

export default ExpandedDetail;
