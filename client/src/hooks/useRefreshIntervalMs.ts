import { trpc } from "@/lib/trpc";

/**
 * Returns the configured refresh interval in milliseconds.
 * Falls back to defaultMs if settings are not available.
 */
export function useRefreshIntervalMs(defaultMs = 3000): number {
  const { data } = trpc.userSettings.get.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const seconds = data && typeof (data as any).refreshInterval === "number" ? (data as any).refreshInterval : undefined;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return defaultMs;

  const clampedSeconds = Math.max(1, Math.min(60, Math.floor(seconds)));
  return clampedSeconds * 1000;
}
