import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function parseMacFromText(text: string): string | null {
  const t = String(text || "");
  // ip neigh show <ip> -> "192.168.1.10 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
  const m1 = t.match(/\blladdr\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})\b/i);
  if (m1) return m1[1].toLowerCase();
  // arp -n <ip> -> "? (192.168.1.10) at aa:bb:cc:dd:ee:ff [ether] on eth0"
  const m2 = t.match(/\bat\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})\b/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

/**
 * Best-effort MAC lookup using the host's neighbor/ARP table.
 * Works when the server is on the same L2 network and has recently talked to the device.
 */
export async function lookupMacAddress(ip: string): Promise<string | null> {
  try {
    const r = await execFileAsync("ip", ["neigh", "show", ip], { timeout: 800 });
    const mac = parseMacFromText(r.stdout || "");
    if (mac) return mac;
  } catch {
    // ignore
  }

  try {
    const r = await execFileAsync("arp", ["-n", ip], { timeout: 800 });
    const mac = parseMacFromText(r.stdout || "");
    if (mac) return mac;
  } catch {
    // ignore
  }

  return null;
}
