/**
 * Miner Polling Service
 * Fetches real-time data from mining devices via their APIs
 */

import { getMinersByUserId, getMinerById, getUserSettings, updateMiner, recordMinerStats, addMinerLog, createAlert } from "./db";
import * as net from "net";
import { cgminerCommand } from "./cgminerApi";
import { parseStratumEndpoint, verifyPoolOnStratum } from "./poolVerify";
import { lookupMacAddress } from "./macLookup";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
import { inferMinerIdentity } from "./minerIdentify";

const alertCooldown = new Map<string, number>();
function canEmitAlert(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = alertCooldown.get(key) || 0;
  if (now - last < windowMs) return false;
  alertCooldown.set(key, now);
  return true;
}
import { lookup } from "dns/promises";

// Miner API response types
interface BitaxeSystemInfo {
  ASICModel?: string;
  deviceModel?: string;
  hostname?: string;
  hashRate?: number;
  temp?: number;
  fanspeed?: number;
  fanrpm?: number;
  power?: number;
  voltage?: number;
  frequency?: number;
  sharesAccepted?: number;
  sharesRejected?: number;
  bestDiff?: string;
  bestSessionDiff?: string;
  uptimeSeconds?: number;
  stratumURL?: string;
  // Some AxeOS/Bitaxe builds expose the stratum port separately.
  stratumPort?: number;
  stratumUser?: string;
  version?: string;
  boardVersion?: string;
  runningPartition?: string;
  flipscreen?: number;
  overheat_mode?: number;
  invertfanpolarity?: number;
  autofanspeed?: number;
  fanspeed_percent?: number;
  coreVoltageActual?: number;
  coreVoltage?: number;
  ssid?: string;
  wifiStatus?: string;
  freeHeap?: number;
  smallCoreCount?: number;
  ASICCount?: number;
}

// CGMiner summary response (parsed from text)
interface CGMinerSummary {
  Elapsed?: number;
  MHS_av?: number;
  MHS_5s?: number;
  MHS_1m?: number;
  MHS_5m?: number;
  MHS_15m?: number;
  Accepted?: number;
  Rejected?: number;
  Hardware_Errors?: number;
  Best_Share?: number;
  Temperature?: number;
  Fan_Speed?: number;
  Power?: number;
  Voltage?: number;
}

// Fetch data from Bitaxe/AxeOS API (HTTP)
async function fetchBitaxeData(ip: string, port: number = 80): Promise<BitaxeSystemInfo | null> {
  const baseUrl = `http://${ip}:${port}`;
  const infoPaths = ["/api/system/info", "/api/info"];
  let info: any = null;

  for (const path of infoPaths) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const respInfo = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);
      if (respInfo.ok) {
        info = await respInfo.json();
        if (info && (info.ASICModel != null || info.hashRate != null || info.hostname != null)) break;
      }
    } catch {
      // try next path
    }
  }

  if (!info) return null;

  try {

    // Best-effort: try to enrich with config endpoints (port/user/url can live outside /info on some builds).
    try {
      const endpoints = ["/api/system", "/api/system/config", "/api/system/settings", "/api/system/stratum"]; // best-effort
      for (const ep of endpoints) {
        try {
          const controller2 = new AbortController();
          const t2 = setTimeout(() => controller2.abort(), 2500);
          const respCfg = await fetch(`${baseUrl}${ep}`, {
            signal: controller2.signal,
            headers: { Accept: "application/json" },
          });
          clearTimeout(t2);
          if (!respCfg.ok) continue;
          const cfg: any = await respCfg.json();

          // Merge relevant keys if present.
          for (const k of ["stratumURL", "stratumUser", "stratumPort"]) {
            if (cfg?.[k] != null && info?.[k] == null) info[k] = cfg[k];
          }
          // Some variants use slightly different key names.
          if (cfg?.stratum_url && info?.stratumURL == null) info.stratumURL = cfg.stratum_url;
          if (cfg?.stratum_user && info?.stratumUser == null) info.stratumUser = cfg.stratum_user;
          if (cfg?.stratum_port && info?.stratumPort == null) info.stratumPort = cfg.stratum_port;

          // Stop early if we have what we need.
          if (info?.stratumURL != null && (info?.stratumPort != null || /:\d+/.test(String(info?.stratumURL)))) {
            break;
          }
        } catch {
          // ignore per-endpoint
        }
      }
    } catch {
      // ignore
    }

    return info as BitaxeSystemInfo;
  } catch {
    return null;
  }
}

// Fetch data from CGMiner-compatible API (Avalon, Antminer, etc.) via TCP port 4028.
// Tries JSON request first, then falls back to legacy plaintext.
async function fetchCGMinerData(ip: string, port: number = 4028): Promise<{ summary: CGMinerSummary | null; pools: any[] | null; rawVersion?: string; versionJson?: any; statsJson?: any } | null> {
  let summaryResp = await cgminerCommand(ip, "summary", port);
  
  // Some Canaan/Avalon firmwares use 4029 instead of 4028
  if (!summaryResp && port === 4028) {
    summaryResp = await cgminerCommand(ip, "summary", 4029);
    if (summaryResp) port = 4029;
  }
  if (!summaryResp) {
    return null;
  }

  const summary = parseCGMinerAny(summaryResp);

  // Pools are optional; do not fail polling if pools are blocked.
  const poolsResp = await cgminerCommand(ip, "pools", port);
  const pools = poolsResp ? parseCGMinerPools(poolsResp) : null;

  // Version data (best-effort) - keep both raw and JSON for identification
  const versionResp = await cgminerCommand(ip, "version", port);
  const rawVersion = versionResp?.raw;
  const versionJson = versionResp?.json;

  // STATS command (critical for Avalon device identification)
  const statsResp = await cgminerCommand(ip, "stats", port);
  const statsJson = statsResp?.json;

  return { summary, pools, rawVersion, versionJson, statsJson };
}

// Parse CGMiner text response to object
// Format: STATUS=S,When=123,...|SUMMARY,Elapsed=123,MHS av=51278810.20,...
function parseCGMinerResponse(response: string): CGMinerSummary | null {
  if (!response || response.length === 0) return null;
  
  try {
    const result: CGMinerSummary = {};
    
    // Split by | to separate STATUS and SUMMARY sections
    const parts = response.split('|');
    
    for (const part of parts) {
      // Parse key=value pairs
      const pairs = part.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (!key || !value) continue;
        
        const cleanKey = key.trim().replace(/\s+/g, '_');
        const cleanValue = value.trim();
        
        // Map CGMiner fields to our interface
        switch (cleanKey) {
          case 'Elapsed':
            result.Elapsed = parseInt(cleanValue, 10);
            break;
          case 'MHS_av':
          case 'MHS av':
            result.MHS_av = parseFloat(cleanValue);
            break;
          case 'MHS_5s':
          case 'MHS 5s':
            result.MHS_5s = parseFloat(cleanValue);
            break;
          case 'MHS_1m':
          case 'MHS 1m':
            result.MHS_1m = parseFloat(cleanValue);
            break;
          case 'MHS_5m':
          case 'MHS 5m':
            result.MHS_5m = parseFloat(cleanValue);
            break;
          case 'MHS_15m':
          case 'MHS 15m':
            result.MHS_15m = parseFloat(cleanValue);
            break;
          case 'Accepted':
            result.Accepted = parseInt(cleanValue, 10);
            break;
          case 'Rejected':
            result.Rejected = parseInt(cleanValue, 10);
            break;
          case 'Hardware_Errors':
          case 'Hardware Errors':
            result.Hardware_Errors = parseInt(cleanValue, 10);
            break;
          case 'Best_Share':
          case 'Best Share':
            result.Best_Share = parseFloat(cleanValue);
            break;
        }
      }
    }
    
    // Check if we got any useful data
    if (result.MHS_av || result.MHS_5m || result.Accepted !== undefined) {
      return result;
    }
    
    return null;
  } catch (e) {
    console.error('[CGMiner] Failed to parse response:', e);
    return null;
  }
}

function pickNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a CGMiner response that may be JSON or legacy text.
 */
function parseCGMinerAny(resp: { raw: string; json?: any }): CGMinerSummary | null {
  if (resp.json) {
    const json = resp.json;
    const summary = (json.SUMMARY && Array.isArray(json.SUMMARY) && json.SUMMARY[0]) ? json.SUMMARY[0] :
                    (json.summary && Array.isArray(json.summary) && json.summary[0]) ? json.summary[0] : null;

    if (!summary) {
      // Some firmwares return {"STATUS":...,"SUMMARY":...} but different casing
      return parseCGMinerResponse(resp.raw);
    }
    
    const result: CGMinerSummary = {};
    // Common keys
    result.Elapsed = pickNumber(summary.Elapsed) ?? undefined;
    result.Accepted = pickNumber(summary.Accepted) ?? undefined;
    result.Rejected = pickNumber(summary.Rejected) ?? undefined;
    // Hashrate: MHS av is MH/s
    const mhsAv = pickNumber(summary["MHS av"]) ?? pickNumber(summary.MHS_av) ?? pickNumber(summary.MHSav);
    if (mhsAv !== null) result.MHS_av = mhsAv;
    const mhs5s = pickNumber(summary["MHS 5s"]) ?? pickNumber(summary.MHS_5s);
    if (mhs5s !== null) result.MHS_5s = mhs5s;
    const mhs1m = pickNumber(summary["MHS 1m"]) ?? pickNumber(summary.MHS_1m);
    if (mhs1m !== null) result.MHS_1m = mhs1m;
    const mhs5m = pickNumber(summary["MHS 5m"]) ?? pickNumber(summary.MHS_5m);
    if (mhs5m !== null) result.MHS_5m = mhs5m;
    const mhs15m = pickNumber(summary["MHS 15m"]) ?? pickNumber(summary.MHS_15m);
    if (mhs15m !== null) result.MHS_15m = mhs15m;

    return (result.MHS_av || result.MHS_5m || result.Accepted !== undefined) ? result : null;
  }

  return parseCGMinerResponse(resp.raw);
}

function parseCGMinerPools(resp: { raw: string; json?: any }): any[] | null {
  const json = resp.json;
  if (json && json.POOLS && Array.isArray(json.POOLS)) {
    return json.POOLS;
  }
  // Legacy parsing: extract POOLS sections if present
  if (!resp.raw) return null;
  const pools: any[] = [];
  const parts = resp.raw.split("|");
  for (const part of parts) {
    if (!part.startsWith("POOLS")) continue;
    // Example: POOLS,POOL=0,URL=stratum+tcp://...,User=...
    const pairs = part.split(",");
    const pool: any = {};
    for (const pair of pairs) {
      const [k, v] = pair.split("=");
      if (!k || v === undefined) continue;
      pool[k.trim()] = v.trim();
    }
    pools.push(pool);
  }
  return pools.length ? pools : null;
}

// Try to get temperature and fan from Avalon via estats/stats command
// Avalon devices expose detailed statistics through STATS command
async function fetchCGMinerEstats(ip: string, port: number = 4028): Promise<{ temperature?: number; fanSpeed?: number; power?: number; bestShare?: number } | null> {
  // Try estats first (some firmwares)
  let resp = await cgminerCommand(ip, "estats", port);
  
  // If estats fails, try stats command (more common for Avalon)
  if (!resp) {
    resp = await cgminerCommand(ip, "stats", port);
  }
  
  if (!resp) return null;

  // Get Best Share from SUMMARY (most reliable source)
  let bestShareFromSummary: number | null = null;
  try {
    const summaryCmd = `echo '{"command":"summary"}' | timeout 3s nc -w 2 ${ip} ${port}`;
    const { stdout } = await execAsync(summaryCmd, { timeout: 4000, maxBuffer: 1024 * 1024 });
    
    if (stdout) {
      const cleaned = stdout.replace(/\u0000/g, "").trim();
      const summaryJson = JSON.parse(cleaned);
      
      if (summaryJson.SUMMARY && Array.isArray(summaryJson.SUMMARY) && summaryJson.SUMMARY[0]) {
        const summary = summaryJson.SUMMARY[0];
        const bestShare = summary["Best Share"];
        if (typeof bestShare === "number" && bestShare > 0) {
          bestShareFromSummary = bestShare;
        }
      }
    }
  } catch (err) {
    // Silent fail for summary command
  }

  // JSON response parsing (best-effort)
  if (resp.json) {
    try {
      // Handle both ESTATS and STATS responses
      const dataList = resp.json.ESTATS || resp.json.STATS;
      const estats = Array.isArray(dataList) ? dataList[0] : dataList;
      
      if (!estats) return null;

      const out: any = {};

      // Parse MM ID0 string (Avalon Nano format: "Temp[38] TAvg[82] Fan1[6630]...")
      const mmId0 = estats["MM ID0"] || estats["MM ID0:Summary"] || "";
      if (typeof mmId0 === "string" && mmId0.length > 0) {
        // Extract Temp[value] or TAvg[value]
        const tempMatch = mmId0.match(/\bTemp\[(\d+)\]/i) || mmId0.match(/\bTAvg\[(\d+)\]/i) || mmId0.match(/\bTMax\[(\d+)\]/i);
        if (tempMatch) {
          const t = parseInt(tempMatch[1], 10);
          if (!isNaN(t) && t > 0) out.temperature = t;
        }
        
        // Extract Fan1[value] or FanR[value%]
        const fanMatch = mmId0.match(/\bFan1\[(\d+)\]/i) || mmId0.match(/\bFanR\[(\d+)%?\]/i);
        if (fanMatch) {
          const f = parseInt(fanMatch[1], 10);
          if (!isNaN(f) && f > 0) out.fanSpeed = f;
        }
        
        // Extract PS[...] power array
        // Avalon Nano: PS[0 0 0 4 2758 127 338] → PS[4] is deciwatts (1/10 watt)
        // Avalon Q:    PS[0 1223 2494 64 1599 2495 1659] → PS[5] is watts
        const psMatch = mmId0.match(/\bPS\[([^\]]+)\]/i);
        if (psMatch) {
          const psValues = psMatch[1].trim().split(/\s+/).map(v => parseInt(v, 10));
          
          // Detect miner type: Avalon Q has 7 values, Nano has 7+ but starts with zeros
          const isAvalonQ = psValues.length >= 6 && psValues[1] > 100; // Q has PS[1] > 100
          
          if (isAvalonQ && psValues.length >= 6 && !isNaN(psValues[5]) && psValues[5] > 0) {
            // Avalon Q: PS[5] is power in watts
            out.power = psValues[5];
          } else if (psValues.length >= 5 && !isNaN(psValues[4]) && psValues[4] > 0) {
            // Avalon Nano: PS[4] is power in deciwatts (divide by 10 to get watts)
            out.power = Math.round((psValues[4] / 10) * 100) / 100;
          }
        }
      }

      // Also check direct JSON keys (some firmwares)
      const tempDirect = 
        estats.TAvg ?? 
        estats.Temperature ?? 
        estats.temp ?? 
        estats.TMax ?? 
        estats["Temp AVG"] ??
        estats["Temp Max"] ??
        estats.Temp0 ??
        estats.Temp1;
      
      if (typeof tempDirect === "number" && tempDirect > 0 && !out.temperature) out.temperature = tempDirect;

      const fanDirect = 
        estats.Fan1 ?? 
        estats.Fan2 ?? 
        estats.Fan_Speed ?? 
        estats.FanSpeed ?? 
        estats["Fan Speed"] ??
        estats.fan ??
        estats.fanspeed;
      
      if (typeof fanDirect === "number" && fanDirect > 0 && !out.fanSpeed) out.fanSpeed = fanDirect;

      const powerDirect = 
        estats.Power ?? 
        estats.power ?? 
        estats["Power Usage"] ??
        estats.TotalPower;
      
      if (typeof powerDirect === "number" && powerDirect > 0 && !out.power) {
        out.power = powerDirect;
      }

      // Add best share from summary
      if (bestShareFromSummary !== null && bestShareFromSummary > 0) {
        out.bestShare = bestShareFromSummary;
      }

      return Object.keys(out).length ? out : null;
    } catch (err) {
      console.error("[fetchCGMinerEstats] JSON parsing error:", err);
      // fall back to text parsing
    }
  }

  // Fallback: Text parsing for legacy firmwares
  const data = resp.raw || "";
  const result: { temperature?: number; fanSpeed?: number; power?: number; bestShare?: number } = {};

  // Temperature patterns
  const tempPatterns = [
    /TAvg[=:]\s*(\d+)/i,
    /TMax[=:]\s*(\d+)/i,
    /Temperature[=:]\s*(\d+)/i,
    /Temp\s*AVG[=:]\s*(\d+)/i,
    /Temp[=:]\s*(\d+)/i,
  ];

  for (const pattern of tempPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.temperature = parseInt(match[1], 10);
      break;
    }
  }

  // Fan patterns
  const fanPatterns = [
    /Fan1[=:]\s*(\d+)/i,
    /Fan2[=:]\s*(\d+)/i,
    /Fan\s*Speed[=:]\s*(\d+)/i,
    /FanSpeed[=:]\s*(\d+)/i,
  ];

  for (const pattern of fanPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.fanSpeed = parseInt(match[1], 10);
      break;
    }
  }

  // Power patterns
  const powerPatterns = [
    /Power[=:]\s*(\d+)/i,
    /PS\[\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/,
    /Total\s*Power[=:]\s*(\d+)/i,
  ];

  for (const pattern of powerPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.power = parseInt(match[1], 10);
      break;
    }
  }

  // Add best share from devs
  if (bestShareFromDevs !== null && bestShareFromDevs > 0) {
    result.bestShare = bestShareFromDevs;
  }

  return Object.keys(result).length > 0 ? result : null;
}

// Format best difficulty to readable format (like NerdQAxe: 821M, 5.07G)
function formatBestDifficulty(diff: string | number | null | undefined): string | null {
  if (diff === null || diff === undefined) return null;
  
  // If already formatted (contains letter suffix), return as-is
  if (typeof diff === 'string' && /[KMGTP]$/i.test(diff)) {
    return diff;
  }
  
  const num = typeof diff === 'string' ? parseFloat(diff) : diff;
  if (isNaN(num) || num === 0) return null;
  
  // Format large numbers with suffixes (like NerdQAxe)
  if (num >= 1e15) return `${(num / 1e15).toFixed(2)}P`;
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}G`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(0)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}

// Parse Bitaxe data to our format
function parseBitaxeData(data: BitaxeSystemInfo): {
  status: string;
  hashrate: number;
  hashrateUnit: string;
  temperature: number | null;
  fanSpeed: number | null;
  power: number | null;
  voltage: number | null;
  frequency: number | null;
  sharesAccepted: number;
  sharesRejected: number;
  bestDifficulty: string | null;
  bestDifficultyAllTime: string | null;
  uptimeSeconds: number | null;
  poolUrl: string | null;
  poolUser: string | null;
  poolPort: number | null;
  model: string | null;
  firmware: string | null;
} {
  // Bitaxe/AxeOS reports hashrate in GH/s
  let hashrate = data.hashRate || 0;
  let hashrateUnit = "GH/s";
  
	const inferredPortFromUrl = (() => {
    const u = data.stratumURL;
    if (!u) return null;
	    // Note: in a RegExp literal, forward slashes must be escaped as \/ (not \\/).
	    const cleaned = u
	      .replace(/^stratum\+tcp:\/\//i, "")
	      .replace(/^stratum\+ssl:\/\//i, "")
	      .replace(/^stratum:\/\//i, "")
	      .replace(/^tcp:\/\//i, "")
	      .replace(/^ssl:\/\//i, "")
	      .trim();
    const hostPort = cleaned.split('/')[0] || '';
    const parts = hostPort.split(':');
    if (parts.length < 2) return null;
    const n = parseInt(parts[1], 10);
    return Number.isFinite(n) ? n : null;
  })();
  const poolPort = (typeof (data as any).stratumPort === 'number' ? (data as any).stratumPort : null) ?? inferredPortFromUrl;

// bestSessionDiff = current session best
  // bestDiff = all-time best
  return {
    status: hashrate > 0 ? "online" : "offline",
    hashrate: hashrate,  // Keep in GH/s for consistency
    hashrateUnit: hashrateUnit,
    temperature: data.temp || null,
    fanSpeed: data.fanrpm || data.fanspeed || null,
    power: data.power || null,
    voltage: data.voltage || data.coreVoltageActual || null,
    frequency: data.frequency || null,
    sharesAccepted: data.sharesAccepted || 0,
    sharesRejected: data.sharesRejected || 0,
    bestDifficulty: formatBestDifficulty(data.bestSessionDiff),
    bestDifficultyAllTime: formatBestDifficulty(data.bestDiff),
    uptimeSeconds: data.uptimeSeconds || null,
    poolUrl: data.stratumURL || null,
    poolUser: data.stratumUser || null,
    poolPort: poolPort ?? null,
    model: (() => {
      // Check deviceModel first (NerdQAxe returns "NerdQAxe++" here)
      if (data.deviceModel && data.deviceModel !== 'None' && data.deviceModel !== 'null') {
        return data.deviceModel;
      }
      
      // For Bitaxe devices, determine model from ASICModel + boardVersion
      if (data.ASICModel) {
        const asic = data.ASICModel.toUpperCase();
        if (asic === 'BM1366') return 'Bitaxe Ultra';
        if (asic === 'BM1368') return 'Bitaxe Supra';
        if (asic === 'BM1370') return 'Bitaxe Gamma';
        if (asic === 'BM1397') return 'Bitaxe';
      }
      
      // Fallback to hostname detection
      if (data.hostname) {
        const h = data.hostname.toLowerCase();
        if (h.includes('nerd') || h.includes('qaxe')) return 'NerdQAxe';
        if (h.includes('ultra')) return 'Bitaxe Ultra';
        if (h.includes('supra')) return 'Bitaxe Supra';
        if (h.includes('gamma')) return 'Bitaxe Gamma';
        if (h.includes('bitaxe')) return 'Bitaxe';
      }
      
      return data.ASICModel || null;
    })(),
    firmware: data.version || null,
  };
}

// Parse CGMiner/Avalon data to our format













function parseCGMinerData(
  data: CGMinerSummary,
  extras?: { temperature?: number; fanSpeed?: number; power?: number; bestShare?: number },
  pools?: any[] | null,
  rawVersion?: string,
  statsJson?: any,
  versionJson?: any
): {
  status: string;
  hashrate: number;
  hashrateUnit: string;
  temperature: number | null;
  fanSpeed: number | null;
  power: number | null;
  voltage: number | null;
  frequency: number | null;
  sharesAccepted: number;
  sharesRejected: number;
  bestDifficulty: string | null;
  uptimeSeconds: number | null;
  model: string | null;
  firmware: string | null;
  poolUrl: string | null;
  poolUser: string | null;
  poolUrl2: string | null;
  poolUser2: string | null;
  poolPort2: number | null;
  poolUrl3: string | null;
  poolUser3: string | null;
  poolPort3: number | null;
} {
  // CGMiner reports in MH/s
  // MHS av = 51278810.20 means 51,278,810.20 MH/s = 51.27 TH/s
  const mhs = data.MHS_5m || data.MHS_1m || data.MHS_av || 0;
  
  // Convert MH/s to GH/s for consistency with Bitaxe
  // 1 GH/s = 1000 MH/s
  const hashrate = mhs / 1000;  // Now in GH/s
  
  // Use the advanced miner identification from minerIdentify.ts
  // Prefer VERSION JSON over raw string for better detection (especially for Avalon Q)
  const identity = inferMinerIdentity(versionJson || rawVersion || "", statsJson);
  let model: string | null = identity.model;
  let firmware: string | null = rawVersion || null;

  // Fallback to regex-based parsing if inferMinerIdentity returns generic
  const rv = rawVersion || "";
  const v = rv.toLowerCase();
  if (model === "CGMiner" || model === "Avalon") {
    if (v.includes("avalon")) {
      const m1 = rv.match(/avalon\s*(nano|mini|q)\b/i);
      if (m1) {
        const tag = m1[1].toLowerCase();
        const pretty = tag === "q" ? "Q" : tag.charAt(0).toUpperCase() + tag.slice(1);
        model = `Avalon ${pretty}`;
      } else {
        const m2 = rv.match(/avalon\s*(?:miner)?\s*([0-9]{3,5})\b/i);
        model = m2 ? `AvalonMiner ${m2[1]}` : identity.model;
      }
    } else if (v.includes("antminer") || v.includes("bitmain") || v.includes("bmminer") || v.includes("bosminer")) {
      const m = rv.match(/\b([SLKDTACE])\s?-?\s?(\d{2,3})\s*(pro\+?|pro|xp|hyd|se|j|i)?\b/i);
      if (m) {
        const series = m[1].toUpperCase();
        const num = m[2];
        const suffix = (m[3] || "").toUpperCase();
        model = `Antminer ${series}${num}${suffix ? " " + suffix : ""}`;
      } else {
        model = "Antminer";
      }
    } else if (v.includes("whatsminer") || v.includes("microbt")) {
      const m = rv.match(/\bM\s?-?\s?(\d{2,3})\b/i);
      model = m ? `Whatsminer M${m[1]}` : "Whatsminer";
    } else if (v.includes("canaan")) {
      model = "Canaan";
    }
  }

  const pool1 = pools?.[0] || null;
  const pool2 = pools?.[1] || null;
  const pool3 = pools?.[2] || null;

  const poolUrl = (pool1?.URL || pool1?.Url || pool1?.url || null) as string | null;
  const poolUser = (pool1?.User || pool1?.user || null) as string | null;
  const poolUrl2 = (pool2?.URL || pool2?.Url || pool2?.url || null) as string | null;
  const poolUser2 = (pool2?.User || pool2?.user || null) as string | null;
  const poolUrl3 = (pool3?.URL || pool3?.Url || pool3?.url || null) as string | null;
  const poolUser3 = (pool3?.User || pool3?.user || null) as string | null;

  // Extract port from pool object or infer from URL
  const extractPort = (pool: any, url: string | null): number | null => {
    // Try to get port from pool object
    const portFromPool = pickNumber(pool?.Port ?? pool?.PORT ?? pool?.port ?? pool?.Stratum_Port ?? pool?.StratumPort ?? pool?.["Stratum Port"]);
    if (portFromPool) return portFromPool;
    
    // Try to extract port from URL if pool object doesn't have it
    if (url) {
      const match = url.match(/:(\d{2,5})(?:\/|$)/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  };

  const poolPort = extractPort(pool1, poolUrl);
  const poolPort2 = extractPort(pool2, poolUrl2);
  const poolPort3 = extractPort(pool3, poolUrl3);

  return {
    status: hashrate > 0 ? "online" : "offline",
    hashrate: hashrate,  // In GH/s for consistency
    hashrateUnit: "GH/s",
    temperature: extras?.temperature || null,
    fanSpeed: extras?.fanSpeed || null,
    power: extras?.power || null,
    voltage: null,
    frequency: null,
    sharesAccepted: data.Accepted || 0,
    sharesRejected: data.Rejected || 0,
    bestDifficulty: formatBestDifficulty(extras?.bestShare || data.Best_Share),
    uptimeSeconds: data.Elapsed || null,
    model,
    firmware,
    poolUrl,
    poolUser,
    poolPort,
    poolUrl2,
    poolUser2,
    poolPort2,
    poolUrl3,
    poolUser3,
    poolPort3,
  };
}

function stripPoolPrefix(url: string): string {
  return url
    .replace(/^stratum\+tcp:\/\//i, "")
    .replace(/^stratum\+ssl:\/\//i, "")
    .replace(/^stratum:\/\//i, "")
    .replace(/^tcp:\/\//i, "")
    .replace(/^ssl:\/\//i, "")
    .trim();
}

function splitPoolUrlAndPort(url: string | null, port: number | null): { poolUrl: string | null; poolPort: number | null; host: string | null } {
  if (!url) return { poolUrl: null, poolPort: port ?? null, host: null };
  const cleaned = stripPoolPrefix(url);
  const hostPort = cleaned.split("/")[0];
  if (!hostPort) return { poolUrl: url, poolPort: port ?? null, host: null };
  const [host, p] = hostPort.split(":");
  const inferredPort = p ? parseInt(p, 10) : null;
  const finalPort = port ?? (Number.isFinite(inferredPort as any) ? inferredPort : null);
  // Store poolUrl without forcing a specific scheme; keep what user entered
  return { poolUrl: url, poolPort: finalPort, host: host || null };
}

async function tcpCheck(host: string, port: number, timeoutMs = 2500): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (err?: string | null) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(err ?? null);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(null));
    socket.on("timeout", () => finish("Timeout"));
    socket.on("error", (e) => finish(e?.message || "TCP error"));
    socket.connect(port, host);
  });
}

function isPrivateIp(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
    ip === "127.0.0.1" ||
    ip === "::1"
  );
}

async function validatePoolEndpoint(url: string | null, port: number | null): Promise<{ status: "valid" | "invalid" | "unknown" | "internal"; error?: string }> {
  if (!url) return { status: "unknown", error: "Missing pool URL" };

  const { host, poolPort } = splitPoolUrlAndPort(url, port);
  if (!host) return { status: "invalid", error: "Invalid pool host" };

  if (!poolPort || poolPort <= 0) return { status: "unknown", error: "Missing pool port" };
  const finalPort = poolPort;
  try {
    const r = await lookup(host);
    if (r?.address && isPrivateIp(r.address)) {
      // Internal pools (private IP / split-horizon DNS) are common on home/farm networks.
      // Mark as INTERNAL instead of INVALID so the UI can show a warning without treating it as a scam by default.
      const tcpErr = await tcpCheck(host, finalPort);
      if (tcpErr) return { status: "invalid", error: tcpErr };
      return { status: "internal", error: `Internal pool (${r.address})` };
    }
    const tcpErr = await tcpCheck(host, finalPort);
    if (tcpErr) return { status: "invalid", error: tcpErr };
    return { status: "valid" };
  } catch (e: any) {
    return { status: "invalid", error: e?.message || "DNS lookup failed" };
  }
}

function isProbablyBitcoinAddress(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  // Very lightweight validation: bech32 (bc1...) or base58 (1...,3...)
  return /^bc1[0-9ac-hj-np-z]{11,71}$/i.test(t) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(t);
}

// Poll a single miner and update its data
export async function pollMiner(miner: {
  id: number;
  userId: number;
  name: string;
  ipAddress: string;
  minerType: string;
  apiPort?: number | null;
}): Promise<boolean> {
  // Determine correct port based on miner type and saved apiPort
  const getApiPort = (): number => {
    if (miner.apiPort) return miner.apiPort;
    // Default ports by type
    if (miner.minerType === "bitaxe" || miner.minerType === "nerdqaxe") return 80;
    if (miner.minerType === "avalon" || miner.minerType === "antminer" || miner.minerType === "whatsminer" || miner.minerType === "canaan") return 4028;
    return 80; // default for "other"
  };
  
  const port = getApiPort();
  const current = await getMinerById(miner.id);
  
  try {
    let minerData: any = null;
    let detectedType = miner.minerType;
    
    // Try Bitaxe/AxeOS API first (HTTP on port 80)
    if (miner.minerType === "bitaxe" || miner.minerType === "nerdqaxe") {
      const bitaxeData = await fetchBitaxeData(miner.ipAddress, port);
      if (bitaxeData) {
        minerData = parseBitaxeData(bitaxeData);
        // Detect device type from deviceModel, hostname, or ASICModel
        if (bitaxeData.deviceModel) {
          const dm = bitaxeData.deviceModel.toLowerCase();
          if (dm.includes('nerd') || dm.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (dm.includes('bitaxe') || dm.includes('ultra') || dm.includes('supra') || dm.includes('gamma')) detectedType = 'bitaxe';
        } else if (bitaxeData.hostname) {
          const h = bitaxeData.hostname.toLowerCase();
          if (h.includes('nerd') || h.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (h.includes('bitaxe') || h.includes('ultra') || h.includes('supra') || h.includes('gamma')) detectedType = 'bitaxe';
        } else if (bitaxeData.ASICModel) {
          const asic = bitaxeData.ASICModel.toLowerCase();
          if (asic.includes('nerd') || asic.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (asic.includes('bitaxe') || asic.includes('ultra') || asic.includes('supra') || asic.includes('gamma')) detectedType = 'bitaxe';
        }
      }
    }
    
    // Try CGMiner API for Avalon/Antminer/Whatsminer/Canaan (TCP on port 4028 or 4029)
    if (!minerData && (miner.minerType === "avalon" || miner.minerType === "antminer" || miner.minerType === "whatsminer" || miner.minerType === "canaan")) {
      const cg = await fetchCGMinerData(miner.ipAddress, port);
      if (cg?.summary) {
        const extras = await fetchCGMinerEstats(miner.ipAddress, port);
        minerData = parseCGMinerData(cg.summary, extras || undefined, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
        const mdl = (minerData.model || "").toLowerCase();
        if (mdl.includes("antminer")) detectedType = "antminer";
        else if (mdl.includes("whatsminer")) detectedType = "whatsminer";
        else if (mdl.includes("canaan")) detectedType = "canaan";
        else if (mdl.includes("avalon")) detectedType = "avalon";
        else detectedType = "other";
      }
      // If CGMiner failed, try Bitaxe (device may have been mis-identified)
      if (!minerData) {
        const bitaxeData = await fetchBitaxeData(miner.ipAddress, 80);
        if (bitaxeData) {
          minerData = parseBitaxeData(bitaxeData);
          // Detect device type from deviceModel, hostname, or ASICModel
          if (bitaxeData.deviceModel) {
            const dm = bitaxeData.deviceModel.toLowerCase();
            if (dm.includes('nerd') || dm.includes('qaxe')) detectedType = 'nerdqaxe';
            else if (dm.includes('bitaxe') || dm.includes('ultra') || dm.includes('supra') || dm.includes('gamma')) detectedType = 'bitaxe';
          } else if (bitaxeData.hostname) {
            const h = bitaxeData.hostname.toLowerCase();
            if (h.includes('nerd') || h.includes('qaxe')) detectedType = 'nerdqaxe';
            else if (h.includes('bitaxe') || h.includes('ultra') || h.includes('supra') || h.includes('gamma')) detectedType = 'bitaxe';
          } else if (bitaxeData.ASICModel) {
            const asic = bitaxeData.ASICModel.toLowerCase();
            if (asic.includes('nerd') || asic.includes('qaxe')) detectedType = 'nerdqaxe';
            else if (asic.includes('bitaxe') || asic.includes('ultra') || asic.includes('supra') || asic.includes('gamma')) detectedType = 'bitaxe';
          }
        }
      }
    }
    
    // If still no data and type is "other", try Bitaxe first (port 80), then CGMiner – so Bitaxe/NerdQAxe are always read
    if (!minerData && miner.minerType === "other") {
      const bitaxeData = await fetchBitaxeData(miner.ipAddress, 80);
      if (bitaxeData) {
        minerData = parseBitaxeData(bitaxeData);
        // Detect device type from deviceModel, hostname, or ASICModel
        if (bitaxeData.deviceModel) {
          const dm = bitaxeData.deviceModel.toLowerCase();
          if (dm.includes('nerd') || dm.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (dm.includes('bitaxe') || dm.includes('ultra') || dm.includes('supra') || dm.includes('gamma')) detectedType = 'bitaxe';
        } else if (bitaxeData.hostname) {
          const h = bitaxeData.hostname.toLowerCase();
          if (h.includes('nerd') || h.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (h.includes('bitaxe') || h.includes('ultra') || h.includes('supra') || h.includes('gamma')) detectedType = 'bitaxe';
        } else if (bitaxeData.ASICModel) {
          const asic = bitaxeData.ASICModel.toLowerCase();
          if (asic.includes('nerd') || asic.includes('qaxe')) detectedType = 'nerdqaxe';
          else if (asic.includes('bitaxe') || asic.includes('ultra') || asic.includes('supra') || asic.includes('gamma')) detectedType = 'bitaxe';
        }
      }
      if (!minerData) {
        const cg = await fetchCGMinerData(miner.ipAddress, 4028);
        if (cg?.summary) {
          const extras = await fetchCGMinerEstats(miner.ipAddress, 4028);
          minerData = parseCGMinerData(cg.summary, extras || undefined, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
          const mdl = (minerData.model || "").toLowerCase();
          if (mdl.includes("antminer")) detectedType = "antminer";
          else if (mdl.includes("whatsminer")) detectedType = "whatsminer";
          else if (mdl.includes("canaan")) detectedType = "canaan";
          else if (mdl.includes("avalon")) detectedType = "avalon";
          else detectedType = "other";
        }
      }
      if (!minerData) {
        const cg = await fetchCGMinerData(miner.ipAddress, 4029);
        if (cg?.summary) {
          const extras = await fetchCGMinerEstats(miner.ipAddress, 4029);
          minerData = parseCGMinerData(cg.summary, extras || undefined, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
          const mdl = (minerData.model || "").toLowerCase();
          if (mdl.includes("antminer")) detectedType = "antminer";
          else if (mdl.includes("whatsminer")) detectedType = "whatsminer";
          else if (mdl.includes("canaan")) detectedType = "canaan";
          else if (mdl.includes("avalon")) detectedType = "avalon";
          else detectedType = "other";
        }
      }
    }
    
    if (minerData) {
      // Best-effort: fill MAC address if missing (uses host ARP/neighbor table)
      const currentMac = (current as any)?.macAddress as string | null | undefined;
      let macToStore: string | null = currentMac || null;
      if (!macToStore) {
        macToStore = await lookupMacAddress(miner.ipAddress);
      }

      // Update miner in database
      const p1 = splitPoolUrlAndPort(minerData.poolUrl ?? (current as any)?.poolUrl ?? null, minerData.poolPort ?? (current as any)?.poolPort ?? null);
      const p2 = splitPoolUrlAndPort(minerData.poolUrl2 ?? (current as any)?.poolUrl2 ?? null, minerData.poolPort2 ?? (current as any)?.poolPort2 ?? null);
      const p3 = splitPoolUrlAndPort(minerData.poolUrl3 ?? (current as any)?.poolUrl3 ?? null, minerData.poolPort3 ?? (current as any)?.poolPort3 ?? null);

      const updateData: any = {
        ...(macToStore ? { macAddress: macToStore } : {}),
        minerType: detectedType,
        model: minerData.model || undefined,
        status: minerData.status,
        hashrate: minerData.hashrate,
        hashrateUnit: minerData.hashrateUnit,
        temperature: minerData.temperature,
        fanSpeed: minerData.fanSpeed,
        power: minerData.power,
        voltage: minerData.voltage,
        frequency: minerData.frequency,
        sharesAccepted: minerData.sharesAccepted,
        sharesRejected: minerData.sharesRejected,
        bestDifficulty: minerData.bestDifficulty,
        uptimeSeconds: minerData.uptimeSeconds || undefined,
        poolUrl: p1.poolUrl ?? undefined,
        poolPort: p1.poolPort ?? undefined,
        poolUser: minerData.poolUser ?? undefined,
        firmware: minerData.firmware || undefined,
        poolUrl2: p2.poolUrl ?? undefined,
        poolPort2: p2.poolPort ?? undefined,
        poolUser2: minerData.poolUser2 ?? undefined,
        poolUrl3: p3.poolUrl ?? undefined,
        poolPort3: p3.poolPort ?? undefined,
        poolUser3: minerData.poolUser3 ?? undefined,
        lastSeen: Date.now(),
      };

      // Pool validation (hourly) and safety checks
      const nowMs = Date.now();
      const lastChecked = (current as any)?.poolLastCheckedAt as number | null | undefined;
      const shouldCheckPools = !lastChecked || nowMs - lastChecked > 60 * 60 * 1000;
      if (shouldCheckPools) {
        const prevStatus = (() => {
          try { return JSON.parse((current as any)?.poolStatus || "{}"); } catch { return {}; }
        })();
        const prevError = (() => {
          try { return JSON.parse((current as any)?.poolError || "{}"); } catch { return {}; }
        })();

        const r1 = await validatePoolEndpoint(p1.poolUrl, p1.poolPort);
        const r2 = await validatePoolEndpoint(p2.poolUrl, p2.poolPort);
        const r3 = await validatePoolEndpoint(p3.poolUrl, p3.poolPort);

        const status = { "1": r1.status, "2": r2.status, "3": r3.status };
        const errors: Record<string, string> = {};
        if (r1.error) errors["1"] = r1.error;
        if (r2.error) errors["2"] = r2.error;
        if (r3.error) errors["3"] = r3.error;

        updateData.poolStatus = JSON.stringify(status);
        updateData.poolError = JSON.stringify(errors);
        updateData.poolLastCheckedAt = nowMs;

        // Deep verify primary pool (best for solo/direct-payout pools). This connects to stratum and inspects coinbase outputs
        // from the latest mining.notify job to confirm the configured recipient is actually paid.
        const lastVerify = (current as any)?.poolVerifyLastCheckedAt as number | null | undefined;
        const shouldDeepVerify = !lastVerify || nowMs - lastVerify > 60 * 60 * 1000;
        if (shouldDeepVerify && p1.poolUrl && p1.poolPort && (minerData.poolUser || minerData.poolUser === "")) {
          try {
            const parsed = parseStratumEndpoint(p1.poolUrl, p1.poolPort);
            if (parsed.port) {
              const recipient = (minerData.poolUser || "").trim();
              const res = await verifyPoolOnStratum({
                host: parsed.host,
                port: parsed.port,
                transport: parsed.transport,
                user: recipient,
                password: (minerData.poolPassword || "x") as string,
                recipient,
                minShare: 0.98,
                timeoutS: 6,
              });

              const prevVerify = (() => {
                try { return JSON.parse((current as any)?.poolVerify || "{}"); } catch { return {}; }
              })();
              updateData.poolVerify = JSON.stringify({ ...(typeof prevVerify === "object" && prevVerify ? prevVerify : {}), "1": res });
              updateData.poolVerifyLastCheckedAt = nowMs;

              if (res.ok && res.risk?.label === "HIGH" && canEmitAlert(`pool_scam:${miner.id}`, 60 * 60 * 1000)) {
                await createAlert({
                  userId: miner.userId,
                  minerId: miner.id,
                  alertType: "pool_scam",
                  severity: "critical",
                  title: "Pool payout looks suspicious",
                  message: `Deep verification suggests this pool may not be paying the configured recipient for ${miner.name} (${miner.ipAddress}).`,
                  metadata: { pool: parsed.host, port: parsed.port, risk: res.risk, checks: res.checks },
                });
              }
            }
          } catch (e) {
            // Non-fatal: keep basic poolStatus check.
          }
        }

        // Alert on pool status change or invalid pools
        const changed = JSON.stringify(status) !== JSON.stringify(prevStatus) || JSON.stringify(errors) !== JSON.stringify(prevError);
        if (changed) {
          const invalidPools = Object.entries(status).filter(([, v]) => v === "invalid").map(([k]) => k);
          if (invalidPools.length && canEmitAlert(`pool_invalid:${miner.id}`, 30 * 60 * 1000)) {
            await createAlert({
              userId: miner.userId,
              minerId: miner.id,
              alertType: "pool_invalid",
              severity: "critical",
              title: `Pool check failed (${invalidPools.join(",")})`,
              message: `One or more pools for ${miner.name} (${miner.ipAddress}) failed validation.`,
              metadata: { status, errors },
            });
          } else if (canEmitAlert(`pool_changed:${miner.id}`, 30 * 60 * 1000)) {
            await createAlert({
              userId: miner.userId,
              minerId: miner.id,
              alertType: "pool_changed",
              severity: "warning",
              title: "Pool status changed",
              message: `Pool status updated for ${miner.name} (${miner.ipAddress}).`,
              metadata: { status, errors },
            });
          }
        }

        // Basic wallet/user sanity check for primary pool user.
        // Many account-based pools use username.worker formats that are not BTC addresses.
        // Only warn when the pool endpoint does not appear to be a private/internal host.
        const primaryPoolHost = (() => {
          const u = (minerData.poolUrl || "").trim();
          if (!u) return null;
          const cleaned = u
            .replace(/^stratum\+tcp:\/\//i, "")
            .replace(/^stratum\+ssl:\/\//i, "")
            .replace(/^stratum:\/\//i, "")
            .replace(/^tcp:\/\//i, "")
            .replace(/^ssl:\/\//i, "")
            .trim();
          const hostPort = (cleaned.split("/")[0] || cleaned).trim();
          // IPv6 in [::1]:port format
          if (hostPort.startsWith("[")) {
            const end = hostPort.indexOf("]");
            return end > 0 ? hostPort.slice(1, end) : hostPort;
          }
          return hostPort.split(":")[0];
        })();
        const isPrivateHost = (h: string | null) => {
          if (!h) return false;
          if (h === "localhost") return true;
          const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
          if (!m) return false;
          const a = Number(m[1]);
          const b = Number(m[2]);
          if (a === 10) return true;
          if (a === 192 && b === 168) return true;
          if (a === 172 && b >= 16 && b <= 31) return true;
          return false;
        };

        if (
          minerData.poolUser &&
          !isProbablyBitcoinAddress(minerData.poolUser) &&
          !isPrivateHost(primaryPoolHost) &&
          canEmitAlert(`pool_user_invalid:${miner.id}`, 60 * 60 * 1000)
        ) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "pool_user_invalid",
            severity: "warning",
            title: "Pool user is not a Bitcoin address",
            message: `Primary pool user for ${miner.name} (${miner.ipAddress}) is not a BTC address. This may be normal for account-based pools.`,
            metadata: { poolUser: minerData.poolUser },
          });
        }
      }

      // Thermal / fan alerts (preference: alerts rather than remote config)
      const settings = await getUserSettings(miner.userId);
      const tempWarn = settings?.tempWarningThreshold ?? 70;
      const tempCrit = settings?.tempCriticalThreshold ?? 80;
      const minFanWarn = (settings as any)?.fanWarningBelowRpm ?? 1000;
      const minFanCrit = (settings as any)?.fanCriticalBelowRpm ?? 500;

      if (typeof minerData.temperature === "number") {
        if (minerData.temperature >= tempCrit && canEmitAlert(`temp_crit:${miner.id}`, 10 * 60 * 1000)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "temperature_high",
            severity: "critical",
            title: "Critical temperature",
            message: `${miner.name} (${miner.ipAddress}) reached ${minerData.temperature}°C`,
            metadata: { temperature: minerData.temperature, threshold: tempCrit },
          });
        } else if (minerData.temperature >= tempWarn && canEmitAlert(`temp_warn:${miner.id}`, 10 * 60 * 1000)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "temperature_warn",
            severity: "warning",
            title: "High temperature",
            message: `${miner.name} (${miner.ipAddress}) is at ${minerData.temperature}°C`,
            metadata: { temperature: minerData.temperature, threshold: tempWarn },
          });
        }
      }

      if (typeof minerData.fanSpeed === "number") {
        if (minerData.fanSpeed > 0 && minerData.fanSpeed <= minFanCrit && canEmitAlert(`fan_crit:${miner.id}`, 10 * 60 * 1000)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "fan_low",
            severity: "critical",
            title: "Fan speed critically low",
            message: `${miner.name} (${miner.ipAddress}) fan at ${minerData.fanSpeed} RPM`,
            metadata: { fanSpeed: minerData.fanSpeed, threshold: minFanCrit },
          });
        } else if (minerData.fanSpeed > 0 && minerData.fanSpeed <= minFanWarn && canEmitAlert(`fan_warn:${miner.id}`, 10 * 60 * 1000)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "fan_low_warn",
            severity: "warning",
            title: "Fan speed low",
            message: `${miner.name} (${miner.ipAddress}) fan at ${minerData.fanSpeed} RPM`,
            metadata: { fanSpeed: minerData.fanSpeed, threshold: minFanWarn },
          });
        }
      }
      
      // Add all-time best difficulty if available
      if (minerData.bestDifficultyAllTime) {
        updateData.bestDifficultyAllTime = minerData.bestDifficultyAllTime;
      }
      
      await updateMiner(miner.id, updateData);

      // Add log entry for successful poll
      await addMinerLog({
        minerId: miner.id,
        logLevel: "info",
        source: "polling",
        message: `Polled successfully: ${minerData.hashrate.toFixed(2)} ${minerData.hashrateUnit}, ${minerData.temperature || '-'}Â°C, ${minerData.power || '-'}W`,
        metadata: {
          hashrate: minerData.hashrate,
          temperature: minerData.temperature,
          power: minerData.power,
          sharesAccepted: minerData.sharesAccepted,
        },
      });
      
      // Record stats for history
      await recordMinerStats({
        minerId: miner.id,
        hashrate: minerData.hashrate,
        temperature: minerData.temperature,
        fanSpeed: minerData.fanSpeed,
        power: minerData.power,
        voltage: minerData.voltage,
        frequency: minerData.frequency,
        sharesAccepted: minerData.sharesAccepted,
        sharesRejected: minerData.sharesRejected,
      });
      
      return true;
    } else {
      // Mark as offline if we couldn't reach it
      await updateMiner(miner.id, {
        status: "offline",
      });
      
      // Add log entry for failed poll
      await addMinerLog({
        minerId: miner.id,
        logLevel: "warning",
        source: "polling",
        message: `Failed to connect to miner at ${miner.ipAddress}`,
        metadata: {},
      });
      
      return false;
    }
  } catch (error) {
    console.error(`Error polling miner ${miner.id} (${miner.ipAddress}):`, error);
    await updateMiner(miner.id, {
      status: "error",
    });
    
    // Add log entry for error
    await addMinerLog({
      minerId: miner.id,
      logLevel: "error",
      source: "polling",
      message: `Error polling miner: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {},
    });
    
    return false;
  }
}

// Poll all miners for a user
export async function pollAllMiners(userId: number): Promise<{
  total: number;
  online: number;
  offline: number;
}> {
  const miners = await getMinersByUserId(userId);
  
  let online = 0;
  let offline = 0;
  
  // Poll miners in parallel (but limit concurrency)
  const batchSize = 10;
  for (let i = 0; i < miners.length; i += batchSize) {
    const batch = miners.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(miner => pollMiner({
        id: miner.id,
        userId: miner.userId,
        name: miner.name,
        ipAddress: miner.ipAddress,
        minerType: miner.minerType,
        apiPort: (miner as any).apiPort || 80,
      }))
    );
    
    results.forEach(success => {
      if (success) online++;
      else offline++;
    });
  }
  
  return {
    total: miners.length,
    online,
    offline,
  };
}

// Polling service management
let _pollingInterval: NodeJS.Timeout | null = null;
let _isPollingActive = false;

/**
 * Start the miner polling service
 * Polls all miners every 10 seconds
 */
export function startPollingService() {
  if (_isPollingActive) {
    console.log("[Polling] Service already running");
    return;
  }

  console.log("[Polling] Starting miner polling service...");
  _isPollingActive = true;

  // Poll immediately on start
  pollAllMinersBackground().catch(err => {
    console.error("[Polling] Initial poll failed:", err);
  });

  // Then poll every 10 seconds
  _pollingInterval = setInterval(() => {
    pollAllMinersBackground().catch(err => {
      console.error("[Polling] Scheduled poll failed:", err);
    });
  }, 10000);

  console.log("[Polling] Service started (polling every 10 seconds)");
}

/**
 * Stop the polling service
 */
export function stopPollingService() {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
  _isPollingActive = false;
  console.log("[Polling] Service stopped");
}

/**
 * Poll all miners for background service
 */
async function pollAllMinersBackground() {
  try {
    // Get all miners (user ID 1 is default for local auth)
    const miners = await getMinersByUserId(1);
    
    if (miners.length === 0) {
      // No miners to poll
      return;
    }

    console.log(`[Polling] Polling ${miners.length} miner(s)...`);
    
    // Poll all miners in parallel
    const results = await Promise.allSettled(
      miners.map(miner => pollMiner({
        id: miner.id,
        userId: miner.userId,
        name: miner.name,
        ipAddress: miner.ipAddress,
        minerType: miner.minerType,
        apiPort: (miner as any).apiPort,
      }))
    );

    // Count successes and failures
    const successes = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    const failures = results.length - successes;
    
    console.log(`[Polling] Completed: ${successes} success, ${failures} failed`);
  } catch (error) {
    console.error("[Polling] Error polling miners:", error);
  }
}

// Export for use in routers
export { fetchBitaxeData, fetchCGMinerData };
