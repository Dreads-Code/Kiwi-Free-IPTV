/**
 * Player component - The main view of the IPTV application.
 * Handles channel navigation, EPG data loading, and modal management.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Channel, EpgData, Programme } from "./types";
import { fetchAllData } from "./services/tvService";
import ChannelDeck from "./components/ChannelList";
import ExpandedDetail from "./components/HeroModal";
import logo from "./assets/logo.png";

const VideoPlayer = React.lazy(() => import("./components/VideoPlayer"));
const ScheduleModal = React.lazy(() => import("./components/ScheduleModal"));
const StremioModal = React.lazy(() => import("./components/StremioModal"));

const AppHeader: React.FC<{
  onOpenSchedule: () => void;
  onOpenStremio: () => void;
  scheduleButtonRef: React.RefObject<HTMLButtonElement | null>;
  stremioButtonRef: React.RefObject<HTMLButtonElement | null>;
  headerFocusAnchor: "stremio" | "schedule";
  focusLocation: "deck" | "header";
}> = ({
  onOpenSchedule,
  onOpenStremio,
  scheduleButtonRef,
  stremioButtonRef,
  headerFocusAnchor,
  focusLocation,
}) => (
  <header className="pointer-events-none fixed top-0 right-0 left-0 z-20 flex h-20 items-center justify-between bg-linear-to-b from-black/50 to-transparent px-4 sm:px-6 lg:px-8">
    <div className="pointer-events-auto flex items-center gap-4">
      <div className="flex items-center gap-2">
        <img
          src={logo}
          alt="KiwiFreeTV Logo"
          className="h-10 w-auto drop-shadow-lg"
        />
        <span className="hidden text-2xl font-bold text-white drop-shadow-lg sm:block">
          Free<span className="text-(--md-sys-color-primary)">TV</span>
        </span>
      </div>
    </div>

    <div className="pointer-events-auto flex items-center gap-3">
      <button
        ref={stremioButtonRef}
        onClick={onOpenStremio}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 font-bold shadow-lg backdrop-blur-sm transition-all hover:scale-105 focus:ring-2 focus:ring-(--md-sys-color-primary) focus:ring-offset-2 focus:ring-offset-(--md-sys-color-background) focus:outline-none ${
          focusLocation === "header" && headerFocusAnchor === "stremio"
            ? "border-(--md-sys-color-primary) bg-(--md-sys-color-primary-container) text-(--md-sys-color-on-primary-container)"
            : "border-(--md-sys-color-outline) bg-(--md-sys-color-surface) text-(--md-sys-color-on-surface) hover:border-(--md-sys-color-primary) hover:text-(--md-sys-color-primary)"
        }`}
      >
        <span className="material-symbols-outlined text-sm">settings</span>
        Stremio
      </button>

      <button
        ref={scheduleButtonRef}
        onClick={onOpenSchedule}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 font-bold shadow-lg backdrop-blur-sm transition-all hover:scale-105 focus:ring-2 focus:ring-(--md-sys-color-primary) focus:ring-offset-2 focus:ring-offset-(--md-sys-color-background) focus:outline-none ${
          focusLocation === "header" && headerFocusAnchor === "schedule"
            ? "border-(--md-sys-color-primary) bg-(--md-sys-color-primary-container) text-(--md-sys-color-on-primary-container)"
            : "border-(--md-sys-color-outline) bg-(--md-sys-color-surface) text-(--md-sys-color-on-surface) hover:border-(--md-sys-color-primary) hover:text-(--md-sys-color-primary)"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        Schedule
      </button>
    </div>
  </header>
);

/**
 * Binary search for the current programme in a sorted list of programmes.
 * @param programmes List of programmes for a channel
 * @param nowMs Current timestamp in milliseconds
 * @returns The current programme or undefined
 */
const findCurrentProgramme = (
  programmes: Programme[] | undefined,
  nowMs: number,
): Programme | undefined => {
  if (!programmes || programmes.length === 0) return undefined;

  let low = 0;
  let high = programmes.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const p = programmes[mid];
    if (nowMs >= p.startMs && nowMs < p.stopMs) {
      return p;
    }
    if (nowMs < p.startMs) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return undefined;
};

const Player: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [epg, setEpg] = useState<EpgData>(new Map());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    null,
  );
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<{
    programme: Programme;
    channel: Channel;
  } | null>(null);

  const [scheduleViewConfig, setScheduleViewConfig] = useState<{
    isOpen: boolean;
    channelContext: Channel | null;
  }>({ isOpen: false, channelContext: null });

  const [isStremioOpen, setIsStremioOpen] = useState<boolean>(false);
  const [headerFocusAnchor, setHeaderFocusAnchor] = useState<
    "stremio" | "schedule"
  >("schedule");

  const [focusLocation, setFocusLocation] = useState<"deck" | "header">("deck");
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const stremioButtonRef = useRef<HTMLButtonElement>(null);
  const keyPressCooldown = useRef(false);
  const modalDepthRef = useRef(0);

  // Internal state clearers (no history side effects)
  const closePlayer = useCallback(() => {
    if (stateRef.current.playingChannel) {
      setActiveChannelId(stateRef.current.playingChannel.id);
    }
    setPlayingChannel(null);
    setCurrentStreamUrl(null);
    setFocusLocation("deck");
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedChannelId(null);
    setSelectedScheduleItem(null);
    if (!stateRef.current.scheduleViewConfig.isOpen) {
      setFocusLocation("deck");
    }
  }, []);

  const closeSchedule = useCallback(() => {
    setScheduleViewConfig({ isOpen: false, channelContext: null });
    setFocusLocation("deck");
  }, []);

  const closeStremio = useCallback(() => {
    setIsStremioOpen(false);
    setFocusLocation("deck");
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { channels: channelsData, epg: epgData } = await fetchAllData();

      setChannels(channelsData);
      setEpg(epgData);

      if (channelsData.length > 0) {
        setActiveChannelId(channelsData[0].id);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "An unknown error occurred.",
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const detailData = useMemo(() => {
    if (selectedScheduleItem) {
      return {
        programme: selectedScheduleItem.programme,
        channel: selectedScheduleItem.channel,
        context: "schedule" as const,
      };
    }
    if (selectedChannelId) {
      const channel = channels.find((c) => c.id === selectedChannelId);
      if (!channel) return null;

      const programmes = epg.get(channel.epg_id);
      const now = new Date();
      let programme = findCurrentProgramme(programmes, now.getTime());

      // Fallback
      const sDate = new Date(now.getTime() - 10 * 60 * 1000);
      const eDate = new Date(now.getTime() + 60 * 60 * 1000);
      programme ??= {
        channelId: channel.epg_id,
        start: sDate,
        stop: eDate,
        startMs: sDate.getTime(),
        stopMs: eDate.getTime(),
        title: channel.name,
        description: `Live feed from ${channel.name}. Detailed programme information is not available at this time.`,
      };

      return {
        programme,
        channel,
        context: "live" as const,
      };
    }
    return null;
  }, [selectedChannelId, selectedScheduleItem, channels, epg]);

  const handleChannelSelect = useCallback((channelId: string) => {
    setActiveChannelId(channelId);
    setSelectedChannelId(channelId);
  }, []);

  const handlePlay = (url: string) => {
    if (detailData) {
      setActiveChannelId(detailData.channel.id);
      setPlayingChannel(detailData.channel);
      setCurrentStreamUrl(url);
      closeDetail();
      if (scheduleViewConfig.isOpen) {
        closeSchedule();
      }
    }
  };

  const handleClosePlayer = useCallback(() => {
    if (modalDepthRef.current > 0) {
      window.history.back();
    } else {
      closePlayer();
    }
  }, [closePlayer]);

  const handleCloseDetail = useCallback(() => {
    if (modalDepthRef.current > 0) {
      window.history.back();
    } else {
      closeDetail();
    }
  }, [closeDetail]);

  const handleOpenSchedule = useCallback(
    (channel: Channel | null) => {
      if (selectedChannelId || selectedScheduleItem) {
        closeDetail();
      }
      setScheduleViewConfig({ isOpen: true, channelContext: channel });
    },
    [selectedChannelId, selectedScheduleItem, closeDetail],
  );

  const handleCloseSchedule = useCallback(() => {
    if (modalDepthRef.current > 0) {
      window.history.back();
    } else {
      closeSchedule();
    }
  }, [closeSchedule]);

  const handleOpenStremio = useCallback(() => {
    if (selectedChannelId || selectedScheduleItem) {
      closeDetail();
    }
    setIsStremioOpen(true);
  }, [selectedChannelId, selectedScheduleItem, closeDetail]);

  const handleCloseStremio = useCallback(() => {
    if (modalDepthRef.current > 0) {
      window.history.back();
    } else {
      closeStremio();
    }
  }, [closeStremio]);

  const handleProgrammeSelect = useCallback(
    (programme: Programme, channel: Channel) => {
      setSelectedScheduleItem({ programme, channel });
    },
    [],
  );

  const stateRef = useRef({
    playingChannel,
    detailData,
    scheduleViewConfig,
    isStremioOpen,
    channels,
    activeChannelId,
    focusLocation,
    headerFocusAnchor,
    keyPressCooldown,
  });

  useEffect(() => {
    stateRef.current = {
      playingChannel,
      detailData,
      scheduleViewConfig,
      isStremioOpen,
      channels,
      activeChannelId,
      focusLocation,
      headerFocusAnchor,
      keyPressCooldown,
    };
  }, [
    playingChannel,
    detailData,
    scheduleViewConfig,
    isStremioOpen,
    channels,
    activeChannelId,
    focusLocation,
    headerFocusAnchor,
  ]);

  // Push state to history when a modal opens
  useEffect(() => {
    const depth = [
      !!playingChannel,
      !!detailData,
      !!scheduleViewConfig.isOpen,
      !!isStremioOpen,
    ].filter(Boolean).length;

    if (depth > modalDepthRef.current) {
      window.history.pushState({ isModal: true, depth }, "");
    }
    modalDepthRef.current = depth;
  }, [playingChannel, detailData, scheduleViewConfig.isOpen, isStremioOpen]);

  // Handle hardware back button
  useEffect(() => {
    const handlePopState = () => {
      const { playingChannel, detailData, scheduleViewConfig, isStremioOpen } =
        stateRef.current;

      // Close top-most layer
      if (playingChannel) {
        closePlayer();
      } else if (detailData) {
        closeDetail();
      } else if (scheduleViewConfig.isOpen) {
        closeSchedule();
      } else if (isStremioOpen) {
        closeStremio();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [closePlayer, closeDetail, closeSchedule, closeStremio]);

  useEffect(() => {
    const handleEscape = () => {
      const { playingChannel, detailData, scheduleViewConfig } =
        stateRef.current;
      if (playingChannel) {
        handleClosePlayer();
      } else if (detailData) {
        handleCloseDetail();
      } else if (scheduleViewConfig.isOpen) {
        handleCloseSchedule();
      }
    };

    const handleArrowVertical = (direction: "up" | "down") => {
      const { focusLocation, headerFocusAnchor } = stateRef.current;
      if (direction === "up" && focusLocation === "deck") {
        setFocusLocation("header");
        if (headerFocusAnchor === "schedule") {
          scheduleButtonRef.current?.focus();
        } else {
          stremioButtonRef.current?.focus();
        }
      } else if (direction === "down" && focusLocation === "header") {
        setFocusLocation("deck");
        scheduleButtonRef.current?.blur();
        stremioButtonRef.current?.blur();
      }
    };

    const handleHeaderNavigation = (direction: "left" | "right") => {
      const { focusLocation, headerFocusAnchor } = stateRef.current;
      if (focusLocation !== "header") return;

      if (direction === "left" && headerFocusAnchor === "schedule") {
        setHeaderFocusAnchor("stremio");
        stremioButtonRef.current?.focus();
      } else if (direction === "right" && headerFocusAnchor === "stremio") {
        setHeaderFocusAnchor("schedule");
        scheduleButtonRef.current?.focus();
      }
    };

    const handleChannelNavigation = (direction: "left" | "right") => {
      const { focusLocation, channels, activeChannelId, keyPressCooldown } =
        stateRef.current;
      if (focusLocation !== "deck" || channels.length === 0 || !activeChannelId)
        return;

      if (keyPressCooldown.current) return;
      keyPressCooldown.current = true;
      setTimeout(() => {
        keyPressCooldown.current = false;
      }, 150);

      const currentIndex = channels.findIndex((c) => c.id === activeChannelId);
      if (currentIndex === -1) return;

      const dir = direction === "right" ? 1 : -1;
      const nextIndex =
        (currentIndex + dir + channels.length) % channels.length;
      setActiveChannelId(channels[nextIndex].id);
    };

    const handleSelection = () => {
      const { focusLocation, activeChannelId, headerFocusAnchor } =
        stateRef.current;
      if (focusLocation === "header") {
        if (headerFocusAnchor === "schedule") {
          handleOpenSchedule(null);
        } else {
          handleOpenStremio();
        }
      } else if (activeChannelId) {
        handleChannelSelect(activeChannelId);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const { playingChannel, detailData, scheduleViewConfig, isStremioOpen } =
        stateRef.current;

      if (e.key === "Escape") {
        handleEscape();
        return;
      }

      const isNavigationActive =
        !playingChannel &&
        !detailData &&
        !scheduleViewConfig.isOpen &&
        !isStremioOpen;
      if (!isNavigationActive) return;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          handleArrowVertical("up");
          break;
        case "ArrowDown":
          e.preventDefault();
          handleArrowVertical("down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (stateRef.current.focusLocation === "header") {
            handleHeaderNavigation("left");
          } else {
            handleChannelNavigation("left");
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (stateRef.current.focusLocation === "header") {
            handleHeaderNavigation("right");
          } else {
            handleChannelNavigation("right");
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          handleSelection();
          break;
        default:
          break;
      }
    };

    const handleKeyWrapper = (e: KeyboardEvent) => {
      handleKeyDown(e);
    };
    globalThis.addEventListener("keydown", handleKeyWrapper);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyWrapper);
    };
  }, [
    handleClosePlayer,
    handleCloseDetail,
    handleCloseSchedule,
    handleOpenSchedule,
    handleChannelSelect,
    handleOpenStremio,
  ]);

  const [currentStreamUrl, setCurrentStreamUrl] = useState<string | null>(null);

  const channelsForSchedule = useMemo(() => {
    return scheduleViewConfig.channelContext
      ? [scheduleViewConfig.channelContext]
      : channels;
  }, [scheduleViewConfig.channelContext, channels]);

  return (
    <div className="relative z-0 flex h-screen w-screen flex-col">
      <div className="fixed inset-0 z-[-1] overflow-hidden bg-(--md-sys-color-background)">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/80"></div>
      </div>

      <AppHeader
        scheduleButtonRef={scheduleButtonRef}
        stremioButtonRef={stremioButtonRef}
        headerFocusAnchor={headerFocusAnchor}
        focusLocation={focusLocation}
        onOpenSchedule={() => {
          handleOpenSchedule(null);
        }}
        onOpenStremio={handleOpenStremio}
      />

      <main className="relative flex grow flex-col items-center justify-center overflow-hidden pt-20">
        {loading && (
          <div className="flex h-96 flex-col items-center justify-center gap-4">
            <div className="h-16 w-16 animate-spin rounded-full border-t-2 border-b-2 border-(--md-sys-color-primary)"></div>
            <p className="text-lg">Loading Channels...</p>
          </div>
        )}

        {error && (
          <div
            className="mx-auto max-w-md rounded-lg border border-(--md-sys-color-primary)/50 bg-(--md-sys-color-primary)/20 px-4 py-3 text-center text-(--md-sys-color-primary)"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="ml-2 block sm:inline">{error}</span>
            <button
              onClick={() => {
                void loadData();
              }}
              className="mt-4 rounded-full bg-(--md-sys-color-primary) px-4 py-2 font-semibold text-(--md-sys-color-on-primary)"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && channels.length > 0 && (
          <ChannelDeck
            channels={channels}
            epg={epg}
            activeChannelId={activeChannelId}
            onChannelActivate={setActiveChannelId}
            onChannelSelect={handleChannelSelect}
          />
        )}

        <ExpandedDetail
          config={detailData}
          onClose={handleCloseDetail}
          onPlay={handlePlay}
          onOpenSchedule={() => {
            handleOpenSchedule(detailData?.channel ?? null);
          }}
          epg={epg}
        />
      </main>

      {currentStreamUrl && playingChannel && (
        <React.Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white">
              Loading Player...
            </div>
          }
        >
          <VideoPlayer
            key={currentStreamUrl}
            streamUrl={currentStreamUrl}
            onClose={handleClosePlayer}
            channel={playingChannel}
            epg={epg}
          />
        </React.Suspense>
      )}

      <React.Suspense fallback={null}>
        <ScheduleModal
          isOpen={scheduleViewConfig.isOpen}
          isCovered={!!detailData}
          onClose={handleCloseSchedule}
          channels={channelsForSchedule}
          epg={epg}
          onProgrammeSelect={handleProgrammeSelect}
        />
        <StremioModal isOpen={isStremioOpen} onClose={handleCloseStremio} />
      </React.Suspense>
    </div>
  );
};

export default Player;
