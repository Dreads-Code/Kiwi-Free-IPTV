import React, { useMemo } from "react";
import { Channel, Programme } from "../types";
import { useProgramImage } from "../hooks/useShowImage";
import { findCurrentProgramme } from "../utils/programmeUtils";

/**
 * Component representing a channel in the main deck.
 * Displays the channel logo, current programme information, and posters.
 */
interface DeckChannelCardProps {
  channel: Channel;
  programmes: Programme[] | undefined;
  onSelect: (channelId: string) => void;
  isActive: boolean;
  ref?: React.Ref<HTMLDivElement>;
}

const DeckChannelCard = ({
  channel,
  programmes,
  onSelect,
  isActive,
  ref,
}: DeckChannelCardProps) => {
  const currentProgramme = useMemo(() => findCurrentProgramme(programmes), [programmes]);
  const { posterUrl } = useProgramImage(currentProgramme, channel);

  const containerClasses = `
        flex flex-col items-center gap-3
        transition-all duration-500 ease-in-out
        cursor-pointer
        ${isActive ? "scale-105 opacity-100" : "scale-90 opacity-60"}
    `;

  const cardClasses = `
        deck-channel-card
        w-[56vw] md:w-[28vw] lg:w-[22vw] max-w-sm shrink-0
        aspect-[2/3] rounded-(--border-radius-lg)
        snap-center overflow-hidden
        shadow-2xl shadow-black/50
        relative bg-(--md-sys-color-surface-variant) border
        transition-all duration-500 ease-in-out
        ${isActive ? "border-(--md-sys-color-primary) shadow-(--glow-shadow-primary)" : "border-transparent"}
    `;

  const nameClasses = `
        font-medium text-sm text-center truncate w-full px-2
        transition-colors duration-300
        ${isActive ? "text-white" : "text-gray-500"}
    `;

  const handleSelect = () => {
    onSelect(channel.id);
  };

  return (
    <div
      ref={ref}
      id={`channel-card-${channel.id}`}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      className={containerClasses}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Select channel ${channel.name}, currently playing ${currentProgramme?.title ?? "Live"}`}
      data-channel-id={channel.id}
    >
      <div className={cardClasses}>
        {/* Background Image */}
        <img
          src={posterUrl ?? channel.logo}
          alt={currentProgramme?.title ?? channel.name}
          className={`h-full w-full transition-opacity duration-500 ${posterUrl ? "object-cover" : "object-contain p-8"}`}
          loading="lazy"
        />
        {/* Gradient Overlay for Text Readability */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent"></div>

        {/* Content */}
        <div className="absolute right-0 bottom-0 left-0 p-4 text-white">
          <img
            src={channel.logo}
            alt=""
            className="mb-2 h-10 max-w-[100px] object-contain drop-shadow-lg"
          />
          {currentProgramme ? (
            <p
              className="line-clamp-2 text-sm leading-tight font-semibold drop-shadow-md"
              title={currentProgramme.title}
            >
              {currentProgramme.title}
            </p>
          ) : (
            <p className="text-sm text-gray-300">Live</p>
          )}
        </div>
        {currentProgramme?.isNew && (
          <div
            className="absolute top-2 right-2 rounded-full bg-(--md-sys-color-primary) px-2 py-0.5 text-[10px] font-bold text-(--md-sys-color-on-primary) shadow-lg"
            title="This is a new episode or premiere"
          >
            NEW
          </div>
        )}
      </div>
      <p className={`${nameClasses} deck-channel-name`}>{channel.name}</p>
    </div>
  );
};

export default React.memo(DeckChannelCard);
