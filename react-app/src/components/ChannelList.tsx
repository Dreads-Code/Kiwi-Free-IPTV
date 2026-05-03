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
  const cardsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProgrammaticScrollActiveRef = useRef(false);
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Use refs to keep the IntersectionObserver callback stable while accessing latest props.
  const activeChannelIdRef = useRef(activeChannelId);
  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  const onChannelActivateRef = useRef(onChannelActivate);
  useEffect(() => {
    onChannelActivateRef.current = onChannelActivate;
  }, [onChannelActivate]);

  const observerRef = useRef<IntersectionObserver | null>(null);

  /**
   * Initialize IntersectionObserver for center detection.
   * This replaces the manual scroll listener loop and getBoundingClientRect calls,
   * which caused layout thrashing and hurt framerate during scrolling.
   * By using a -50% rootMargin, we create a zero-width intersection line at the horizontal center.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Ignore intersection changes during programmatic scrolls (keyboard navigation)
        // to prevent competing state updates and feedback loops.
        if (isProgrammaticScrollActiveRef.current) return;

        for (const entry of entries) {
          if (entry.isIntersecting) {
            const channelId = (entry.target as HTMLElement).dataset.channelId;
            // Only update if it's a different channel to avoid redundant state updates.
            if (channelId && channelId !== activeChannelIdRef.current) {
              onChannelActivateRef.current(channelId);
            }
          }
        }
      },
      {
        root: scroller,
        rootMargin: "0px -50% 0px -50%",
        threshold: 0,
      },
    );

    // Initial observation of all cards currently in the map.
    cardsRef.current.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Programmatic scroll when activeChannelId changes (e.g. keyboard navigation).
  useEffect(() => {
    if (!activeChannelId || !scrollerRef.current) return;

    const cardElement = cardsRef.current.get(activeChannelId);
    if (!cardElement) return;

    isProgrammaticScrollActiveRef.current = true;
    cardElement.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });

    if (scrollEndTimeoutRef.current) {
      globalThis.clearTimeout(scrollEndTimeoutRef.current);
    }
    scrollEndTimeoutRef.current = globalThis.setTimeout(() => {
      isProgrammaticScrollActiveRef.current = false;
    }, 600);

    return () => {
      if (scrollEndTimeoutRef.current) {
        globalThis.clearTimeout(scrollEndTimeoutRef.current);
      }
    };
  }, [activeChannelId]);

  return (
    <div
      className="relative h-[min(700px,80svh)] w-full py-4"
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
            ref={(el) => {
              if (el) {
                cardsRef.current.set(channel.id, el);
                // Register with the observer when the card mounts.
                observerRef.current?.observe(el);
              } else {
                const oldEl = cardsRef.current.get(channel.id);
                if (oldEl) observerRef.current?.unobserve(oldEl);
                cardsRef.current.delete(channel.id);
              }
            }}
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
