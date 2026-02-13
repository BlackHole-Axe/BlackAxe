import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type CGMinerResponse = {
  raw: string;
  json?: any;
};

function stripNulls(s: string): string {
  return s.replace(/\u0000/g, "").trim();
}

// Use nc command directly - it works reliably with Avalon devices
async function sendSocket(ip: string, port: number, payload: string | Buffer): Promise<string | null> {
  try {
    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8');
    
    // Use nc with timeout - escape quotes properly
    const escapedPayload = payloadStr.replace(/'/g, "'\\''");
    const cmd = `echo '${escapedPayload}' | timeout 3s nc -w 2 ${ip} ${port}`;
    
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 4000,
      maxBuffer: 1024 * 1024, // 1MB buffer
    });
    
    if (stderr && !stdout) {
      return null;
    }
    
    const cleaned = stripNulls(stdout);
    return cleaned.length > 0 ? cleaned : null;
  } catch (error: any) {
    // Timeout or connection error
    return null;
  }
}

function tryJsonParse(raw: string): any | null {
  const t = (raw || "").trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/**
 * CGMiner-compatible API client.
 *
 * Notes for Avalon/Canaan devices (based on AvalonPS7):
 * - Many accept JSON without NULL terminator.
 * - Some accept JSON with NULL terminator.
 * - Some accept JSON followed by newline.
 *
 * This helper tries several payload variants and supports the optional "parameter" field.
 */
export async function cgminerCommand(
  ip: string,
  command: string,
  port = 4028,
  parameter?: string
): Promise<CGMinerResponse | null> {
  const payloadObj: any = parameter ? { command, parameter } : { command };

  // Try JSON request variants first
  const payloads = [
    Buffer.from(JSON.stringify(payloadObj) + "\u0000", "utf8"),
    Buffer.from(JSON.stringify(payloadObj), "utf8"),
    Buffer.from(JSON.stringify(payloadObj) + "\n", "utf8"),
  ];

  for (const p of payloads) {
    const raw = await sendSocket(ip, port, p);
    if (!raw) continue;
    const parsed = tryJsonParse(raw);
    return parsed ? { raw, json: parsed } : { raw };
  }

  // Fallback: legacy plaintext command
  const legacyRaw = await sendSocket(ip, port, command);
  if (!legacyRaw) return null;
  const parsed = tryJsonParse(legacyRaw);
  return parsed ? { raw: legacyRaw, json: parsed } : { raw: legacyRaw };
}
