import { Channel, Programme } from "../types";
import { useProgramImage } from "../hooks/useShowImage";

const NextUpCard = ({ programme, channel }: { programme: Programme; channel: Channel }) => {
  const { posterUrl } = useProgramImage(programme, channel);
  if (!posterUrl) return null;
  return (
    <div className="animate-slide-in-up flex w-64 items-center overflow-hidden rounded-lg border border-white/20 bg-black/40 p-3 shadow-2xl backdrop-blur-xl">
      <img
        src={posterUrl}
        alt={programme.title}
        className="h-24 w-16 shrink-0 rounded-md object-cover"
      />
      <div className="ml-3 overflow-hidden">
        <p className="text-xs text-gray-300">Next Up</p>
        <p className="line-clamp-3 text-sm leading-tight font-bold text-white">{programme.title}</p>
      </div>
    </div>
  );
};

export default NextUpCard;
