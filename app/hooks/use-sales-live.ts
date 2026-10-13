"use client";
import { useEffect, useRef, useState } from "react";
export type LiveState =
  "Connecting" | "Live" | "Reconnecting" | "Offline" | "Unavailable";

export function useSalesLive({
  accountId,
  refresh,
  onAccessChanged,
  onConnected,
  onSessionExpired,
}: {
  accountId: string;
  refresh: () => Promise<boolean>;
  onAccessChanged: () => void;
  onConnected: () => void;
  onSessionExpired: () => void;
}) {
  const callbacks = useRef({
    refresh,
    onAccessChanged,
    onConnected,
    onSessionExpired,
  });
  useEffect(() => {
    callbacks.current = {
      refresh,
      onAccessChanged,
      onConnected,
      onSessionExpired,
    };
  }, [refresh, onAccessChanged, onConnected, onSessionExpired]);
  const [state, setState] = useState<LiveState>("Connecting");
  const [lastSync, setLastSync] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false,
      stopped = false,
      attempt = 0,
      version = -1;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let syncTimer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let syncing = false,
      dirty = false;
    function clearHeartbeat() {
      clearInterval(heartbeat);
      clearTimeout(watchdog);
    }
    function sync() {
      if (syncing) {
        dirty = true;
        return;
      }
      syncing = true;
      const connection = socket;
      void callbacks.current
        .refresh()
        .then((ok) => {
          if (disposed || stopped || connection !== socket) return;
          if (ok) {
            setLastSync(Date.now());
            if (socket?.readyState === WebSocket.OPEN) setState("Live");
          } else setState("Unavailable");
        })
        .finally(() => {
          syncing = false;
          if (dirty && !disposed && !stopped) {
            dirty = false;
            scheduleSync();
          }
        });
    }
    function scheduleSync() {
      // Leading bounded debounce: a continuous burst cannot postpone refresh forever.
      if (syncTimer !== undefined) return;
      syncTimer = setTimeout(() => {
        syncTimer = undefined;
        sync();
      }, 150);
    }
    function connect() {
      if (disposed || stopped) return;
      if (!navigator.onLine) {
        setState("Offline");
        return;
      }
      setState(attempt ? "Reconnecting" : "Connecting");
      const url = new URL("/api/employee/sales/live", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const connection = new WebSocket(url);
      socket = connection;
      connection.onmessage = (event) => {
        if (disposed || connection !== socket) return;
        if (event.data === "pong") {
          clearTimeout(watchdog);
          return;
        }
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!Number.isSafeInteger(message.version) || message.version < 0)
          return;
        if (message.type === "ready") {
          attempt = 0;
          version = message.version;
          callbacks.current.onConnected();
          scheduleSync();
          clearHeartbeat();
          heartbeat = setInterval(() => {
            if (connection.readyState !== WebSocket.OPEN) return;
            connection.send("ping");
            watchdog = setTimeout(() => {
              setState("Reconnecting");
              connection.close();
            }, 15000);
          }, 60000);
        } else if (message.type === "sales_changed") {
          if (message.version <= version) return;
          // Versions are global; gaps can be changes outside this account's scope.
          version = message.version;
          scheduleSync();
        } else if (message.type === "access_changed") {
          version = message.version;
          callbacks.current.onAccessChanged();
          scheduleSync();
        }
      };
      connection.onclose = (event) => {
        if (disposed || connection !== socket) return;
        clearHeartbeat();
        if (event.code === 4401) {
          stopped = true;
          setState("Unavailable");
          callbacks.current.onSessionExpired();
          return;
        }
        setState(navigator.onLine ? "Reconnecting" : "Offline");
        const delay =
          Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)) *
          (0.75 + Math.random() * 0.5);
        retry = setTimeout(connect, delay);
      };
      connection.onerror = () => {
        if (connection === socket && !disposed) setState("Unavailable");
      };
    }
    function offline() {
      setState("Offline");
      clearTimeout(retry);
      socket?.close();
    }
    function online() {
      clearTimeout(retry);
      if (!socket || socket.readyState >= WebSocket.CLOSING) connect();
    }
    function visible() {
      if (document.visibilityState === "visible") {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send("sync");
        } else online();
      }
    }
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(syncTimer);
      clearHeartbeat();
      socket?.close(1000, "Leaving sales screen");
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [accountId]);
  return { state, lastSync };
}
