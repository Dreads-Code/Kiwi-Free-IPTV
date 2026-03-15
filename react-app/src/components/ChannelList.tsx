import React, { useRef, useEffect } from "react";
import { Channel, EpgData } from "../types";
import DeckChannelCard from "./ChannelCard";

/**
 * Component that displays a scrollable list of channel cards (the "deck").
 * Handles both manual scrolling and programmatic scrolling synchronized with keyboard navigation.
 */
interface ChannelDeckProps {
  channels: Channel[];
  epg: EpgData;
  activeChannelId: string | null;
  onChannelActivate: (channelId: string) => void;
  onChannelSelect: (channelId: string) => void;
}

const ChannelDeck: React.FC<ChannelDeckProps> = ({
  channels,
  epg,
  activeChannelId,
  onChannelActivate,
  onChannelSelect,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // This ref is used to prevent the IntersectionObserver from firing during a programmatic scroll,
  // which would cause an infinite scroll feedback loop.
  const isProgrammaticScrollActive = useRef(false);
  const scrollEndTimeout = useRef<number | null>(null);

  // Effect to set up the IntersectionObserver for manual scrolling
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let debounceTimeoutId: number;
    const debouncedActivate = (id: string) => {
      clearTimeout(debounceTimeoutId);
      debounceTimeoutId = globalThis.setTimeout(() => {
        onChannelActivate(id);
      }, 150) as unknown as number;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        // Ignore intersections that happen during a programmatic scroll
        if (isProgrammaticScrollActive.current) return;

        let bestEntry: IntersectionObserverEntry | null = null;
        let minDistance = Infinity;

        const containerRect = scroller.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            const entryCenter = rect.left + rect.width / 2;
            const distance = Math.abs(entryCenter - containerCenter);

            if (distance < minDistance) {
              minDistance = distance;
              bestEntry = entry;
            }
          }
        }

        if (bestEntry) {
          const channelId = (bestEntry.target as HTMLElement).dataset.channelId;
          if (channelId) {
            debouncedActivate(channelId);
          }
        }
      },
      {
        root: scroller,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
      },
    );

    observerRef.current = observer;
    for (const child of scroller.children) {
      observer.observe(child);
    }

    return () => {
      clearTimeout(debounceTimeoutId);
      observer.disconnect();
    };
  }, [channels, onChannelActivate]);

  // Effect to handle programmatic scrolling when activeChannelId changes (e.g., from keyboard)
  useEffect(() => {
    if (!activeChannelId || !scrollerRef.current) return;

    const cardElement = scrollerRef.current.querySelector(
      `[data-channel-id="${activeChannelId}"]`,
    );
    if (cardElement) {
      // Set a flag to disable the observer logic during the scroll animation
      isProgrammaticScrollActive.current = true;

      cardElement.scrollIntoView({
        behavior: "instant",
        inline: "center",
        block: "nearest",
      });

      // Clear any existing timeout to handle rapid key presses
      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current);
      }

      // After a delay, re-enable the observer logic. This timeout should be long enough
      // for the smooth scroll animation to complete.
      scrollEndTimeout.current = globalThis.setTimeout(() => {
        isProgrammaticScrollActive.current = false;
      }, 100) as unknown as number; // Reduced for instant scrolling
    }

    return () => {
      if (scrollEndTimeout.current) {
        clearTimeout(scrollEndTimeout.current);
      }
    };
  }, [activeChannelId]);

  return (
    <div
      className="relative h-[700px] w-full py-4"
      role="listbox"
      aria-label="Channel selection deck. Use left and right arrow keys to navigate channels, and press Enter to view details."
      aria-activedescendant={
        activeChannelId ? `channel-card-${activeChannelId}` : undefined
      }
      tabIndex={0}
    >
      <div
        ref={scrollerRef}
        className="custom-scrollbar absolute inset-0 flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overflow-y-hidden px-[50%] md:gap-6"
        aria-label="List of channels"
      >
        {channels.map((channel) => (
          <DeckChannelCard
            key={channel.id}
            channel={channel}
            programmes={epg.get(channel.epg_id)}
            onSelect={onChannelSelect}
            isActive={channel.id === activeChannelId}
          />
        ))}
      </div>
      {/* Gradient Overlays */}
      <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-1/4 bg-linear-to-r from-(--md-sys-color-background) to-transparent"></div>
      <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-1/4 bg-linear-to-l from-(--md-sys-color-background) to-transparent"></div>
    </div>
  );
};

export default ChannelDeck;
