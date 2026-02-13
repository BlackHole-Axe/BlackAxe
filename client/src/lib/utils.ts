import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get color classes for miner types
export function getMinerTypeColor(minerType: string): string {
  const colors: Record<string, string> = {
    bitaxe: "text-[var(--miner-bitaxe)] border-[var(--miner-bitaxe)]",
    nerdqaxe: "text-[var(--miner-nerdqaxe)] border-[var(--miner-nerdqaxe)]",
    avalon: "text-[var(--miner-avalon)] border-[var(--miner-avalon)]",
    antminer: "text-[var(--miner-antminer)] border-[var(--miner-antminer)]",
    whatsminer: "text-[var(--miner-whatsminer)] border-[var(--miner-whatsminer)]",
    canaan: "text-[var(--miner-canaan)] border-[var(--miner-canaan)]",
    other: "text-[var(--miner-other)] border-[var(--miner-other)]",
  };
  return colors[minerType] || colors.other;
}

// Get background color for miner type badges
export function getMinerTypeBgColor(minerType: string): string {
  const colors: Record<string, string> = {
    bitaxe: "bg-[var(--miner-bitaxe)]/10",
    nerdqaxe: "bg-[var(--miner-nerdqaxe)]/10",
    avalon: "bg-[var(--miner-avalon)]/10",
    antminer: "bg-[var(--miner-antminer)]/10",
    whatsminer: "bg-[var(--miner-whatsminer)]/10",
    canaan: "bg-[var(--miner-canaan)]/10",
    other: "bg-[var(--miner-other)]/10",
  };
  return colors[minerType] || colors.other;
}
