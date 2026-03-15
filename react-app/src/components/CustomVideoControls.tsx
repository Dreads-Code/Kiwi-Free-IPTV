import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Cast,
  MonitorPlay,
  ChevronRight,
  ArrowLeft,
  Check,
  Subtitles,
  SlidersHorizontal,
} from "lucide-react";
import { formatTime } from "../utils/formatTime";

interface CustomControlsProps {
  isVisible: boolean;
  isPlaying: boolean;
  onPlayPause: () => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  isCastAvailable: boolean;
  onCast: () => void;
  channelName: string;
  programmeTitle: string;

  subtitleTracks: { id: number; label: string }[];
  currentSubtitleTrack: number;
  onSubtitleChange: (trackId: number) => void;
  qualities: { id: number; height: number; bitrate: number }[];
  currentQuality: number;
  onQualityChange: (qualityId: number) => void;
  isPipAvailable: boolean;
  onPipToggle: () => void;
}

const VolumeControl: React.FC<{
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}> = ({ volume, isMuted, onVolumeChange, onMuteToggle }) => {
  const [showSlider, setShowSlider] = useState(false);
  const getVolumeIcon = () => {
    if (isMuted || volume === 0) return <VolumeX size={20} />;
    if (volume < 0.5) return <Volume1 size={20} />;
    return <Volume2 size={20} />;
  };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => {
        setShowSlider(true);
      }}
      onMouseLeave={() => {
        setShowSlider(false);
      }}
      role="toolbar"
      aria-label="Volume control"
    >
      <button
        onClick={onMuteToggle}
        className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/10"
      >
        {getVolumeIcon()}
      </button>
      <div
        className={`origin-left transition-all duration-300 ease-in-out ${showSlider ? "w-24 scale-x-100 opacity-100" : "w-0 scale-x-0 opacity-0"}`}
      >
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={(e) => {
            onVolumeChange(Number(e.target.value));
          }}
          className="range-slider h-1.5 w-full cursor-pointer appearance-none rounded-full"
        />
      </div>
    </div>
  );
};

const SettingsMenu: React.FC<{
  subtitleTracks: { id: number; label: string }[];
  currentSubtitleTrack: number;
  onSubtitleChange: (trackId: number) => void;
  qualities: { id: number; height: number; bitrate: number }[];
  currentQuality: number;
  onQualityChange: (qualityId: number) => void;
  onClose: () => void;
}> = ({
  subtitleTracks,
  currentSubtitleTrack,
  onSubtitleChange,
  qualities,
  currentQuality,
  onQualityChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"main" | "subtitles" | "quality">(
    "main",
  );

  return (
    <div className="animate-fade-in absolute right-4 bottom-16 w-64 overflow-hidden rounded-lg border border-white/10 bg-black/90 text-sm shadow-xl backdrop-blur-md">
      {activeTab === "main" && (
        <div className="flex flex-col">
          {subtitleTracks.length > 0 && (
            <button
              onClick={() => {
                setActiveTab("subtitles");
              }}
              className="flex items-center justify-between p-3 text-left transition-colors hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <Subtitles size={18} />
                <span>Subtitles</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <span className="text-xs">
                  {currentSubtitleTrack === -1
                    ? "Off"
                    : (subtitleTracks.find((t) => t.id === currentSubtitleTrack)
                        ?.label ?? "Unknown")}
                </span>
                <ChevronRight size={14} />
              </div>
            </button>
          )}
          {qualities.length > 0 && (
            <button
              onClick={() => {
                setActiveTab("quality");
              }}
              className="flex items-center justify-between p-3 text-left transition-colors hover:bg-white/10"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} />
                <span>Quality</span>
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <span className="text-xs">
                  {currentQuality === -1
                    ? "Auto"
                    : `${(qualities.find((q) => q.id === currentQuality)?.height ?? 0).toString()}p`}
                </span>
                <ChevronRight size={14} />
              </div>
            </button>
          )}
        </div>
      )}

      {activeTab === "subtitles" && (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          <button
            onClick={() => {
              setActiveTab("main");
            }}
            className="sticky top-0 flex items-center gap-2 border-b border-white/10 bg-black/90 p-3 hover:bg-white/10"
          >
            <ArrowLeft size={16} />
            <span className="font-semibold">Subtitles</span>
          </button>
          <button
            onClick={() => {
              onSubtitleChange(-1);
              onClose();
            }}
            className={`flex items-center justify-between p-3 text-left hover:bg-white/10 ${currentSubtitleTrack === -1 ? "text-primary-red-ochre font-bold" : ""}`}
          >
            <span>Off</span>
            {currentSubtitleTrack === -1 && <Check size={16} />}
          </button>
          {subtitleTracks.map((track) => (
            <button
              key={track.id}
              onClick={() => {
                onSubtitleChange(track.id);
                onClose();
              }}
              className={`flex items-center justify-between p-3 text-left hover:bg-white/10 ${currentSubtitleTrack === track.id ? "text-primary-red-ochre font-bold" : ""}`}
            >
              <span>{track.label}</span>
              {currentSubtitleTrack === track.id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}

      {activeTab === "quality" && (
        <div className="flex max-h-64 flex-col overflow-y-auto">
          <button
            onClick={() => {
              setActiveTab("main");
            }}
            className="sticky top-0 flex items-center gap-2 border-b border-white/10 bg-black/90 p-3 hover:bg-white/10"
          >
            <ArrowLeft size={16} />
            <span className="font-semibold">Quality</span>
          </button>
          <button
            onClick={() => {
              onQualityChange(-1);
              onClose();
            }}
            className={`flex items-center justify-between p-3 text-left hover:bg-white/10 ${currentQuality === -1 ? "text-primary-red-ochre font-bold" : ""}`}
          >
            <span>Auto</span>
            {currentQuality === -1 && <Check size={16} />}
          </button>
          {qualities.map((quality) => (
            <button
              key={quality.id}
              onClick={() => {
                onQualityChange(quality.id);
                onClose();
              }}
              className={`flex items-center justify-between p-3 text-left hover:bg-white/10 ${currentQuality === quality.id ? "text-primary-red-ochre font-bold" : ""}`}
            >
              <span>{quality.height}p</span>
              {currentQuality === quality.id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomVideoControls: React.FC<CustomControlsProps> = ({
  isVisible,
  isPlaying,
  onPlayPause,
  volume,
  isMuted,
  onVolumeChange,
  onMuteToggle,
  currentTime,
  duration,
  onSeek,
  isFullscreen,
  onFullscreenToggle,
  isCastAvailable,
  onCast,
  channelName,
  programmeTitle,
  subtitleTracks,
  currentSubtitleTrack,
  onSubtitleChange,
  qualities,
  currentQuality,
  onQualityChange,
  isPipAvailable,
  onPipToggle,
}) => {
  const seekBarRef = useRef<HTMLInputElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setShowSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between text-white transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Top Info Bar */}
      <div
        className="pointer-events-auto bg-linear-to-b from-black/60 to-transparent p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold drop-shadow-lg">{channelName}</h3>
        <p className="text-sm text-gray-200 drop-shadow-lg">{programmeTitle}</p>
      </div>

      {/* Bottom Controls */}
      <div
        className="pointer-events-auto bg-linear-to-t from-black/60 to-transparent p-2 md:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Seek Bar */}
        <div className="group mb-2 w-full">
          <input
            ref={seekBarRef}
            type="range"
            min="0"
            max={duration || 1}
            value={currentTime}
            onChange={(e) => {
              onSeek(Number(e.target.value));
            }}
            className="range-slider h-1.5 w-full cursor-pointer appearance-none rounded-full transition-all group-hover:h-2"
            style={
              { "--progress": `${progress.toString()}%` } as React.CSSProperties
            }
          />
        </div>

        {/* Main Controls Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 md:gap-3">
            <button
              onClick={onPlayPause}
              className="group/btn flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition-all hover:scale-105 hover:bg-white/20"
            >
              {isPlaying ? (
                <Pause size={20} fill="currentColor" className="text-white" />
              ) : (
                <Play
                  size={20}
                  fill="currentColor"
                  className="ml-0.5 text-white"
                />
              )}
            </button>
            <VolumeControl
              volume={volume}
              isMuted={isMuted}
              onVolumeChange={onVolumeChange}
              onMuteToggle={onMuteToggle}
            />
            <div className="ml-2 font-mono text-xs md:text-sm">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-400"> / {formatTime(duration)}</span>
            </div>
          </div>

          <div
            className="relative flex items-center gap-1 md:gap-3"
            ref={settingsRef}
          >
            {/* Settings Button */}
            {(subtitleTracks.length > 0 || qualities.length > 0) && (
              <button
                onClick={() => {
                  setShowSettings(!showSettings);
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-white/10 ${showSettings ? "scale-110 bg-white/20" : ""}`}
                title="Settings"
              >
                <Settings
                  size={20}
                  className={showSettings ? "rotate-45" : ""}
                />
              </button>
            )}

            {showSettings && (
              <SettingsMenu
                subtitleTracks={subtitleTracks}
                currentSubtitleTrack={currentSubtitleTrack}
                onSubtitleChange={onSubtitleChange}
                qualities={qualities}
                currentQuality={currentQuality}
                onQualityChange={onQualityChange}
                onClose={() => {
                  setShowSettings(false);
                }}
              />
            )}

            {/* PiP Button */}
            {isPipAvailable && (
              <button
                onClick={onPipToggle}
                title="Picture in Picture"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-white/10"
              >
                <MonitorPlay size={20} />
              </button>
            )}

            {isCastAvailable && (
              <button
                onClick={onCast}
                title="Cast to device"
                className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-white/10"
              >
                <Cast size={20} />
              </button>
            )}
            <button
              onClick={onFullscreenToggle}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:bg-white/10"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
      <style>{`
                .range-slider {
                    background: linear-gradient(to right, var(--color-primary-red-ochre) var(--progress), rgba(255, 255, 255, 0.3) var(--progress));
                }
                .range-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    cursor: pointer;
                    transform: scale(0);
                    transition: transform 0.15s ease-in-out;
                }
                 .range-slider:hover::-webkit-slider-thumb, .range-slider:focus::-webkit-slider-thumb {
                    transform: scale(1);
                }
                .range-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    border: none;
                    cursor: pointer;
                    transform: scale(0);
                    transition: transform 0.15s ease-in-out;
                }
                .range-slider:hover::-moz-range-thumb, .range-slider:focus::-moz-range-thumb {
                    transform: scale(1);
                }
            `}</style>
    </div>
  );
};

export default CustomVideoControls;
