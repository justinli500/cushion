"use client";

import { useEffect, useRef } from "react";

/** The small part of YouTube's IFrame Player API this screen uses. */
interface Player {
  getCurrentTime(): number;
  /** -1 not started, 5 cued and waiting, 1 playing, 2 paused. */
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds: number }): void;
  playVideo(): void;
  destroy(): void;
}

const NOT_STARTED = -1;
const CUED = 5;

interface YouTube {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      host: string;
      width: string;
      height: string;
      playerVars: Record<string, number | string>;
      events: { onReady(): void; onError(): void };
    },
  ) => Player;
}

declare global {
  interface Window {
    YT?: YouTube;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<YouTube> | null = null;

/** Loads YouTube's player script once per page. */
function loadApi(): Promise<YouTube> {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.append(script);
  });
  return api;
}

interface Props {
  youtubeId: string;
  /** Where the video opens, in seconds from its start. */
  startSeconds: number;
  /** Called a few times a second with the video's position, which is the game clock. */
  onTime(seconds: number): void;
  /** Called if the video cannot be shown, so the screen can run on its own clock instead. */
  onUnavailable(): void;
  /** Change `nonce` to jump the video to `seconds`. */
  jump: { seconds: number; nonce: number } | null;
}

const POLL_MS = 400;

/** The broadcast, embedded with YouTube's own player. Its position drives everything else on the screen. */
export function GameVideo({ youtubeId, startSeconds, onTime, onUnavailable, jump }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  // The latest callbacks, so the player is built once and not rebuilt as the page re-renders.
  const handlers = useRef({ onTime, onUnavailable });
  useEffect(() => {
    handlers.current = { onTime, onUnavailable };
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const mount = document.createElement("div");
    holder.current?.append(mount);

    loadApi().then((YT) => {
      if (cancelled) return;
      const created = new YT.Player(mount, {
        videoId: youtubeId,
        // The no-cookie host does not set tracking cookies until the viewer presses play.
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: { start: Math.max(0, Math.floor(startSeconds)), rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: () => {
            if (cancelled) return;
            player.current = created;
            timer = setInterval(() => handlers.current.onTime(created.getCurrentTime()), POLL_MS);
          },
          onError: () => handlers.current.onUnavailable(),
        },
      });
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      player.current?.destroy();
      player.current = null;
      mount.remove();
    };
    // The start position only matters when the player is first built.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  useEffect(() => {
    const current = player.current;
    if (!jump || !current) return;
    const state = current.getPlayerState();
    // A video that has never played ignores a seek, so it is started at the new position instead.
    if (state === NOT_STARTED || state === CUED) {
      current.loadVideoById({ videoId: youtubeId, startSeconds: jump.seconds });
    } else {
      current.seekTo(jump.seconds, true);
      current.playVideo();
    }
  }, [jump, youtubeId]);

  return <div ref={holder} className="aspect-video w-full overflow-hidden rounded-xl bg-foreground [&_iframe]:h-full [&_iframe]:w-full" />;
}
