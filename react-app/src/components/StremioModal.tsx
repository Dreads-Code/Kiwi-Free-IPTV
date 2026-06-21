import React, { useState, useEffect } from "react";
import logo from "../assets/logo.png";
import packageJson from "../../package.json";

/**
 * Modal component for Stremio addon installation and configuration.
 * Provides links to install the manifest and copy it to the clipboard.
 */
interface StremioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StremioModal: React.FC<StremioModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [modalFocusIndex, setModalFocusIndex] = useState(0); // 0: Install, 1: Copy

  const installRef = React.useRef<HTMLButtonElement>(null);
  const copyRef = React.useRef<HTMLButtonElement>(null);

  // Handle visibility and focus in a single effect when isOpen changes
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsVisible(true);
        setModalFocusIndex(0);
      });
      // Small delay to ensure render before focus
      const focusTimer = setTimeout(() => {
        installRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(focusTimer);
      };
    }

    // Use a separate timer for exit animation
    const exitTimer = setTimeout(() => {
      setIsVisible(false);
    }, 300);
    return () => {
      clearTimeout(exitTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape": {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          e.stopPropagation();
          setModalFocusIndex(0);
          installRef.current?.focus();
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          e.stopPropagation();
          setModalFocusIndex(1);
          copyRef.current?.focus();
          break;
        }
        case "Enter": {
          // If we want to prevent bubbling on Enter too
          e.stopPropagation();
          break;
        }
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isVisible && !isOpen) return null;

  const protocol = globalThis.location.protocol === "https:" ? "https" : "http";
  const manifestUrl = `${protocol}://${globalThis.location.host}/manifest.json`;
  const stremioUrl = `stremio://${globalThis.location.host}/manifest.json`;

  const handleCopy = () => {
    void navigator.clipboard
      .writeText(manifestUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch((error: unknown) => {
        console.error("Failed to copy:", error);
      });
  };

  const handleInstall = () => {
    globalThis.location.href = stremioUrl;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isOpen ? "opacity-100 backdrop-blur-md" : "backdrop-blur-0 pointer-events-none opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className={`relative w-full max-w-sm transform overflow-hidden rounded-3xl border border-white/10 bg-(--md-sys-color-surface-container-high) shadow-2xl transition-all duration-300 ${
          isOpen ? "translate-y-0 scale-100" : "translate-y-8 scale-95"
        }`}
      >
        {/* Header section */}
        <div className="relative flex flex-col items-center justify-center bg-black/40 p-8">
          <div className="absolute inset-0 bg-gradient-to-b from-(--md-sys-color-primary-container)/20 to-transparent"></div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/70 transition-colors hover:bg-black/40 hover:text-white"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>

          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/5 bg-linear-to-b from-white/10 to-transparent shadow-2xl backdrop-blur-sm">
            <img
              src={logo}
              alt="Logo"
              className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            />
          </div>

          <h1 className="mt-4 text-xl font-bold tracking-tight text-white">New Zealand TV</h1>
          <span className="mt-1 rounded-full border border-(--md-sys-color-primary)/20 bg-(--md-sys-color-primary-container)/30 px-3 py-0.5 text-[10px] font-bold tracking-wider text-(--md-sys-color-primary) uppercase">
            v{packageJson.version}
          </span>
        </div>

        {/* Content section */}
        <div className="p-8">
          <p className="mb-6 text-center text-sm leading-relaxed text-(--md-sys-color-on-surface-variant)">
            Install the official addon for Stremio to enjoy your favorite NZ channels across all
            your devices.
          </p>

          <div className="flex flex-col gap-3">
            <button
              ref={installRef}
              onClick={handleInstall}
              className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-4 py-3.5 font-bold transition-all active:scale-[0.98] ${
                modalFocusIndex === 0
                  ? "bg-(--md-sys-color-primary) text-(--md-sys-color-on-primary) shadow-lg ring-2 ring-white/20"
                  : "bg-(--md-sys-color-primary)/80 text-(--md-sys-color-on-primary)/90"
              }`}
            >
              <span className="material-symbols-outlined text-xl">download</span>
              Install Addon
            </button>

            <button
              ref={copyRef}
              onClick={handleCopy}
              className={`group flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3.5 font-bold transition-all active:scale-[0.98] ${
                modalFocusIndex === 1
                  ? "border-(--md-sys-color-primary) bg-(--md-sys-color-surface-container-highest) text-(--md-sys-color-primary) ring-2 ring-white/10"
                  : "border-(--md-sys-color-outline) bg-(--md-sys-color-surface-container-high) text-(--md-sys-color-primary)/80"
              }`}
            >
              {copied ? (
                <>
                  <span className="material-symbols-outlined text-xl text-green-500">
                    check_circle
                  </span>
                  <span className="text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl opacity-70">content_copy</span>
                  Copy Install Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 bg-black/20 p-4 text-center text-[10px] text-(--md-sys-color-on-surface-variant)/60">
          Source:{" "}
          <a
            href="https://github.com/Dreads-Code/Kiwi-Free-IPTV"
            target="_blank"
            rel="noopener noreferrer"
            className="border-b border-white/10 pb-0.5 transition-colors hover:border-(--md-sys-color-primary) hover:text-(--md-sys-color-primary)"
          >
            github.com/Dreads-Code/iptv-nz-addon
          </a>
        </div>
      </div>
    </div>
  );
};

export default StremioModal;
