/**
 * Formats a time given in seconds into a MM:SS or HH:MM:SS string.
 * @param timeInSeconds The time to format.
 * @returns A formatted time string.
 */
const format = (n: number) => n.toString().padStart(2, "0");

export const formatTime = (timeInSeconds: number): string => {
  if (Number.isNaN(timeInSeconds) || timeInSeconds < 0) {
    return "00:00";
  }

  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.floor(timeInSeconds % 60);

  const segments =
    hours > 0
      ? [hours.toString(), format(minutes), format(seconds)]
      : [format(minutes), format(seconds)];

  return segments.join(":");
};
