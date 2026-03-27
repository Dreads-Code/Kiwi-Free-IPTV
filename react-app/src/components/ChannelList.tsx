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
  const isProgrammaticScrollActive = useRef(false);
  const scrollEndTimeout = useRef<number | null>(null);

  // Activate whichever card is closest to the horizontal centre of the scroller.
  // Uses getBoundingClientRect so it works regardless of scroll/positioning context.
  const activateCenterChannel = useRef(() => {
    if (isProgrammaticScrollActive.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;

    let closestId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const [id, el] of cardsRef.current) {
      const cardRect = el.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - scrollerCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = id;
      }
    }

    if (closestId) {
      onChannelActivate(closestId);
    }
  });

  // Keep the callback ref current without re-registering listeners on every render.
  useEffect(() => {
    activateCenterChannel.current = () => {
      if (isProgrammaticScrollActive.current) return;
      const scroller = scrollerRef.current;
      if (!scroller) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const scrollerCenter = scrollerRect.left + scrollerRect.width / 2;

      let closestId: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const [id, el] of cardsRef.current) {
        const cardRect = el.getBoundingClientRect();
        const cardCenter = cardRect.left + cardRect.width / 2;
        const distance = Math.abs(cardCenter - scrollerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = id;
        }
      }

      if (closestId) {
        onChannelActivate(closestId);
      }
    };
  }, [onChannelActivate]);

  // Attach scroll listeners once. Uses scrollend where available (Chrome/Firefox),
  // falls back to scroll + debounce for Safari.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onScrollEnd = () => activateCenterChannel.current();

    let debounceTimer: number;
    const onScroll = () => {
      globalThis.clearTimeout(debounceTimer);
      debounceTimer = globalThis.setTimeout(
        () => activateCenterChannel.current(),
        200,
      ) as unknown as number;
    };

    if ("onscrollend" in scroller) {
      scroller.addEventListener("scrollend", onScrollEnd);
    } else {
      scroller.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      globalThis.clearTimeout(debounceTimer);
      if ("onscrollend" in scroller) {
        scroller.removeEventListener("scrollend", onScrollEnd);
      } else {
        scroller.removeEventListener("scroll", onScroll);
      }
    };
  }, []);

  // Programmatic scroll when activeChannelId changes (e.g. keyboard navigation).
  useEffect(() => {
    if (!activeChannelId || !scrollerRef.current) return;

    const cardElement = cardsRef.current.get(activeChannelId);
    if (!cardElement) return;

    isProgrammaticScrollActive.current = true;
    cardElement.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });

    if (scrollEndTimeout.current) {
      globalThis.clearTimeout(scrollEndTimeout.current);
    }
    scrollEndTimeout.current = globalThis.setTimeout(() => {
      isProgrammaticScrollActive.current = false;
    }, 600) as unknown as number;

    return () => {
      if (scrollEndTimeout.current) {
        globalThis.clearTimeout(scrollEndTimeout.current);
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
              if (el) cardsRef.current.set(channel.id, el);
              else cardsRef.current.delete(channel.id);
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
