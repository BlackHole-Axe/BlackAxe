import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import dns from "node:dns/promises";

export type StratumTransport = "tcp" | "tls";

export type PoolVerifyOutput = {
  n: number;
  sats: number;
  sharePct: number;
  isYou: boolean;
  recipient: string;
  scriptPubKey: string;
};

export type PoolVerifyResult = {
  ok: boolean;
  transport: "TCP" | "TLS";
  host: string;
  port: number;
  ip?: string;
  latencyMs?: number;
  connected: boolean;
  authOk?: boolean;
  notifyReceived: boolean;
  coinbaseParsed: boolean;
  coinbaseTxid?: string;
  poolTag?: string;
  nBits?: string;
  nTime?: string;
  nTimeIso?: string;
  yourAddress?: string;
  yourSharePct?: number;
  nonYouPct?: number;
  largestPaysYou?: boolean;
  outputs?: PoolVerifyOutput[];
  risk?: { score: number; label: "LOW" | "MEDIUM" | "HIGH" };
  checks?: { name: string; status: "PASS" | "WARN" | "FAIL"; detail: string }[];
  summary?: string;
  error?: string;
};

export type ParsedStratumEndpoint = {
  host: string;
  port: number | null;
  transport: StratumTransport;
};

export function parseStratumEndpoint(urlOrHost: string, portOverride?: number | null): ParsedStratumEndpoint {
  const raw = (urlOrHost || "").trim();
  const lower = raw.toLowerCase();

  let transport: StratumTransport = "tcp";
  let cleaned = raw;
  // Accept common schemes
  if (lower.startsWith("stratum+ssl://") || lower.startsWith("stratum+tls://") || lower.startsWith("ssl://") || lower.startsWith("tls://")) {
    transport = "tls";
  }

  cleaned = cleaned
    .replace(/^stratum\+tcp:\/\//i, "")
    .replace(/^stratum\+ssl:\/\//i, "")
    .replace(/^stratum\+tls:\/\//i, "")
    .replace(/^stratum:\/\//i, "")
    .replace(/^tcp:\/\//i, "")
    .replace(/^ssl:\/\//i, "")
    .replace(/^tls:\/\//i, "");

  // Strip any path
  const hostPort = cleaned.split("/")[0];
  let host = hostPort;
  let portFromUrl: number | null = null;
  if (hostPort.includes(":")) {
    const idx = hostPort.lastIndexOf(":");
    const h = hostPort.slice(0, idx);
    const p = hostPort.slice(idx + 1);
    const pn = Number(p);
    if (h && Number.isFinite(pn) && pn > 0) {
      host = h;
      portFromUrl = pn;
    }
  }

  const port = (portOverride ?? null) ?? portFromUrl;
  return { host, port, transport };
}

// -----------------------------
// Utilities
// -----------------------------

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function dblSha256(buf: Buffer): Buffer {
  return sha256(sha256(buf));
}

function isPrivateOrLocalIp(ip: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a: any = (globalThis as any).ipaddress;
    void a;
  } catch {
    // ignore
  }
  // Minimal private checks (IPv4)
  if (ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const parts = ip.split(".");
    if (parts.length >= 2) {
      const n = Number(parts[1]);
      if (n >= 16 && n <= 31) return true;
    }
  }
  return false;
}

// -----------------------------
// Base58Check (minimal)
// -----------------------------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Buffer {
  let x = BigInt(0);
  for (const ch of s) {
    const v = BASE58_ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Invalid base58 character");
    x = x * BigInt(58) + BigInt(v);
  }
  // Convert bigint to buffer
  let hex = x.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex");
  // Leading zeros
  let leading = 0;
  for (const ch of s) {
    if (ch === "1") leading += 1;
    else break;
  }
  if (leading > 0) {
    buf = Buffer.concat([Buffer.alloc(leading), buf]);
  }
  return buf;
}

function base58CheckDecode(s: string): Buffer {
  const raw = base58Decode(s);
  if (raw.length < 5) throw new Error("Invalid base58check length");
  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const expected = dblSha256(payload).subarray(0, 4);
  if (!checksum.equals(expected)) throw new Error("Invalid base58check checksum");
  return payload; // version + data
}

function base58Encode(buf: Buffer): string {
  let x = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (x > 0) {
    const mod = Number(x % BigInt(58));
    out = BASE58_ALPHABET[mod] + out;
    x = x / BigInt(58);
  }
  // leading zeros
  let leading = 0;
  for (const b of buf) {
    if (b === 0) leading += 1;
    else break;
  }
  return "1".repeat(leading) + (out || "");
}

function base58CheckEncode(payload: Buffer): string {
  const checksum = dblSha256(payload).subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}

// -----------------------------
// Bech32 (BIP173 minimal)
// -----------------------------

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if (((top >>> i) & 1) === 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function bech32HrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >>> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const out: number[] = [];
  for (let p = 0; p < 6; p++) out.push((mod >>> (5 * (5 - p))) & 31);
  return out;
}

function bech32Encode(hrp: string, data: number[]): string {
  const checksum = bech32CreateChecksum(hrp, data);
  const combined = [...data, ...checksum];
  let out = hrp + "1";
  for (const d of combined) out += BECH32_CHARSET[d];
  return out;
}

function bech32Decode(addr: string): { hrp: string; data: number[] } {
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf("1");
  if (pos < 1 || pos + 7 > a.length) throw new Error("Invalid bech32 address");
  const hrp = a.slice(0, pos);
  const dataPart = a.slice(pos + 1);
  const data: number[] = [];
  for (const ch of dataPart) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v < 0) throw new Error("Invalid bech32 character");
    data.push(v);
  }
  // verify checksum
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (mod !== 1) throw new Error("Invalid bech32 checksum");
  return { hrp, data: data.slice(0, data.length - 6) };
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) throw new Error("Invalid value");
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else {
    if (bits >= from) throw new Error("Excess padding");
    if ((acc << (to - bits)) & maxv) throw new Error("Non-zero padding");
  }
  return out;
}

// -----------------------------
// Bitcoin address <-> scriptPubKey
// -----------------------------

function isLikelyBitcoinAddress(s: string): boolean {
  const a = s.trim();
  if (!a) return false;
  if (/^(bc1|tb1)[0-9a-z]{20,}$/i.test(a)) return true;
  if (/^[13mn2][1-9A-HJ-NP-Za-km-z]{25,}$/i.test(a)) return true;
  return false;
}

/**
 * Normalize common stratum user formats.
 * Many miners/pools use "<btcAddress>.<worker>". If the prefix looks like a BTC address,
 * return it for payout matching. Otherwise, return the original user string.
 */
function normalizeRecipientFromUser(user: string): { recipient: string; derived: boolean } {
  const u = (user || "").trim();
  if (!u) return { recipient: "", derived: false };

  // Common pattern: address.worker
  const dotIdx = u.indexOf(".");
  if (dotIdx > 0) {
    const prefix = u.slice(0, dotIdx).trim();
    if (isLikelyBitcoinAddress(prefix)) return { recipient: prefix, derived: true };
  }

  // Some setups use address/worker
  const slashIdx = u.indexOf("/");
  if (slashIdx > 0) {
    const prefix = u.slice(0, slashIdx).trim();
    if (isLikelyBitcoinAddress(prefix)) return { recipient: prefix, derived: true };
  }

  return { recipient: u, derived: false };
}

function addressToScriptPubKey(address: string): Buffer {
  const a = address.trim();
  if (/^(bc1|tb1)/i.test(a)) {
    const { hrp, data } = bech32Decode(a);
    const witver = data[0];
    const prog = Buffer.from(convertBits(data.slice(1), 5, 8, false));
    if (witver < 0 || witver > 16) throw new Error("Unsupported witness version");
    const op = witver === 0 ? 0x00 : 0x50 + witver;
    return Buffer.concat([Buffer.from([op, prog.length]), prog]);
  }

  const payload = base58CheckDecode(a);
  const version = payload[0];
  const hash = payload.subarray(1);
  if (hash.length !== 20) throw new Error("Unsupported base58 payload");
  // mainnet/testnet versions
  const isP2PKH = version === 0x00 || version === 0x6f;
  const isP2SH = version === 0x05 || version === 0xc4;
  if (isP2PKH) {
    return Buffer.from([0x76, 0xa9, 0x14, ...hash, 0x88, 0xac]);
  }
  if (isP2SH) {
    return Buffer.from([0xa9, 0x14, ...hash, 0x87]);
  }
  throw new Error("Unsupported address version");
}

function scriptPubKeyToAddress(script: Buffer, network: "mainnet" | "testnet"): string | null {
  const hex = script.toString("hex");
  // P2PKH
  if (hex.startsWith("76a914") && hex.endsWith("88ac") && script.length === 25) {
    const hash = script.subarray(3, 23);
    const version = network === "mainnet" ? 0x00 : 0x6f;
    return base58CheckEncode(Buffer.concat([Buffer.from([version]), hash]));
  }
  // P2SH
  if (hex.startsWith("a914") && hex.endsWith("87") && script.length === 23) {
    const hash = script.subarray(2, 22);
    const version = network === "mainnet" ? 0x05 : 0xc4;
    return base58CheckEncode(Buffer.concat([Buffer.from([version]), hash]));
  }
  // witness v0/v1
  if (script.length >= 4) {
    const op = script[0];
    const push = script[1];
    if (push > 1 && push + 2 === script.length) {
      let witver: number | null = null;
      if (op === 0x00) witver = 0;
      if (op >= 0x51 && op <= 0x60) witver = op - 0x50;
      if (witver !== null) {
        const prog = script.subarray(2);
        const hrp = network === "mainnet" ? "bc" : "tb";
        const data = [witver, ...convertBits([...prog], 8, 5, true)];
        return bech32Encode(hrp, data);
      }
    }
  }
  return null;
}

function extractCoinbaseTag(coinbaseTx: Buffer): string | undefined {
  // Heuristic: look for readable ASCII in the coinbase scriptSig
  // We parse minimal tx header and the first input scriptSig.
  try {
    const r = new BufReader(coinbaseTx);
    r.readU32LE();
    // segwit marker?
    const marker = r.peekU8();
    const flag = r.peekU8(1);
    const hasWitness = marker === 0x00 && flag === 0x01;
    if (hasWitness) {
      r.readU8();
      r.readU8();
    }
    const vin = r.readVarInt();
    if (vin < 1) return undefined;
    r.readBytes(32); // prev txid
    r.readU32LE(); // prev vout
    const scriptLen = r.readVarInt();
    const script = r.readBytes(scriptLen);
    // Extract printable range
    const printable = script
      .toString("latin1")
      .replace(/[^\x20-\x7E]+/g, " ")
      .trim();
    if (printable.length >= 3) return printable.slice(0, 64);
  } catch {
    // ignore
  }
  return undefined;
}

// -----------------------------
// TX parsing (outputs only)
// -----------------------------

class BufReader {
  private off = 0;
  constructor(private readonly buf: Buffer) {}

  peekU8(delta = 0): number {
    return this.buf[this.off + delta] ?? 0;
  }

  readU8(): number {
    const v = this.buf[this.off];
    if (v === undefined) throw new Error("EOF");
    this.off += 1;
    return v;
  }

  readU32LE(): number {
    if (this.off + 4 > this.buf.length) throw new Error("EOF");
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }

  readU64LE(): bigint {
    if (this.off + 8 > this.buf.length) throw new Error("EOF");
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return v;
  }

  readBytes(n: number): Buffer {
    if (this.off + n > this.buf.length) throw new Error("EOF");
    const v = this.buf.subarray(this.off, this.off + n);
    this.off += n;
    return v;
  }

  readVarInt(): number {
    const first = this.readU8();
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const b = this.readBytes(2);
      return b.readUInt16LE(0);
    }
    if (first === 0xfe) {
      return this.readU32LE();
    }
    const v = this.readU64LE();
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("VarInt too large");
    return Number(v);
  }
}

function parseTxOutputs(rawTxHex: string): { n: number; sats: number; script: Buffer }[] {
  const tx = Buffer.from(rawTxHex, "hex");
  const r = new BufReader(tx);
  r.readU32LE();

  // Detect segwit marker/flag
  const marker = r.peekU8();
  const flag = r.peekU8(1);
  const hasWitness = marker === 0x00 && flag === 0x01;
  if (hasWitness) {
    r.readU8();
    r.readU8();
  }

  const vin = r.readVarInt();
  for (let i = 0; i < vin; i++) {
    r.readBytes(32);
    r.readU32LE();
    const scriptLen = r.readVarInt();
    r.readBytes(scriptLen);
    r.readU32LE();
  }

  const vout = r.readVarInt();
  const outputs: { n: number; sats: number; script: Buffer }[] = [];
  for (let i = 0; i < vout; i++) {
    const sats = r.readU64LE();
    const scriptLen = r.readVarInt();
    const script = r.readBytes(scriptLen);
    outputs.push({ n: i, sats: Number(sats), script });
  }

  if (hasWitness) {
    // skip witness stacks
    for (let i = 0; i < vin; i++) {
      const items = r.readVarInt();
      for (let j = 0; j < items; j++) {
        const len = r.readVarInt();
        r.readBytes(len);
      }
    }
  }

  // locktime
  r.readU32LE();
  return outputs;
}

function txidFromRawTxHex(rawTxHex: string): string {
  const tx = Buffer.from(rawTxHex, "hex");
  const h = dblSha256(tx);
  return Buffer.from(h).reverse().toString("hex");
}

// -----------------------------
// Stratum probe
// -----------------------------

type StratumProbe = {
  latencyMs: number;
  authOk?: boolean;
  notify?: Record<string, unknown>;
  extranonce1?: string;
  extranonce2Size?: number;
};

async function stratumProbe(opts: {
  host: string;
  port: number;
  transport: StratumTransport;
  user: string;
  pass?: string;
  timeoutMs: number;
}): Promise<StratumProbe> {
  const { host, port, transport, user, pass, timeoutMs } = opts;
  const start = Date.now();

  const socket =
    transport === "tls"
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port });

  const probe: StratumProbe = { latencyMs: 0 };

  const lines: string[] = [];
  let buffer = "";
  let resolved = false;

  const cleanup = () => {
    try {
      socket.removeAllListeners();
      socket.destroy();
    } catch {
      // ignore
    }
  };

  const writeJson = (obj: unknown) => {
    const s = JSON.stringify(obj) + "\n";
    socket.write(s);
  };

  const done = (ok: boolean, err?: Error) => {
    if (resolved) return;
    resolved = true;
    probe.latencyMs = Date.now() - start;
    cleanup();
    if (!ok && err) throw err;
  };

  const waitFor = <T>(pred: () => T | undefined, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setInterval(() => {
        const v = pred();
        if (v !== undefined) {
          clearInterval(t);
          clearTimeout(to);
          resolve(v);
        }
      }, 25);
      const to = setTimeout(() => {
        clearInterval(t);
        reject(new Error("Timeout waiting for pool response"));
      }, ms);
    });

  socket.setTimeout(timeoutMs);
  socket.on("timeout", () => {
    done(false, new Error("Timeout connecting to pool"));
  });

  socket.on("error", (e) => {
    done(false, e instanceof Error ? e : new Error(String(e)));
  });

  socket.on("data", (d) => {
    buffer += d.toString("utf8");
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      lines.push(line);
    }
  });

  // Wait for connect
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", (e) => reject(e));
  });

  // Subscribe
  writeJson({ id: 1, method: "mining.subscribe", params: ["BlackAxe", "1"] });
  // Authorize
  writeJson({ id: 2, method: "mining.authorize", params: [user, pass ?? "x"] });

  const parsed: { id?: number; method?: string; result?: unknown; params?: unknown }[] = [];

  const parseLoop = setInterval(() => {
    while (lines.length) {
      const raw = lines.shift();
      if (!raw) break;
      try {
        const o = JSON.parse(raw);
        parsed.push(o);
      } catch {
        // ignore non-json
      }
    }
  }, 20);

  try {
    // Subscribe response to capture extranonce
    const sub = await waitFor(() => parsed.find((p) => p.id === 1), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resAny: any = sub.result;
    if (Array.isArray(resAny) && typeof resAny[1] === "string") probe.extranonce1 = resAny[1];
    if (Array.isArray(resAny) && typeof resAny[2] === "number") probe.extranonce2Size = resAny[2];

    // Auth response
    const auth = await waitFor(() => parsed.find((p) => p.id === 2), timeoutMs);
    probe.authOk = Boolean(auth.result);

    // Notify
    const notify = await waitFor(() => parsed.find((p) => p.method === "mining.notify"), timeoutMs);
    probe.notify = notify as unknown as Record<string, unknown>;
  } finally {
    clearInterval(parseLoop);
  }

  done(true);
  return probe;
}

function riskAndChecks(args: {
  yourShare: number;
  minShare: number;
  largestPaysYou: boolean;
  tls: boolean;
  connected: boolean;
  haveNotify: boolean;
  haveOutputs: boolean;
  recipientAddressOk: boolean;
  recipientAddressProvided: boolean;
}): { risk: { score: number; label: "LOW" | "MEDIUM" | "HIGH" }; checks: PoolVerifyResult["checks"]; summary: string } {
  const { yourShare, minShare, largestPaysYou, tls: hasTls, connected, haveNotify, haveOutputs, recipientAddressOk, recipientAddressProvided } = args;

  const checks: NonNullable<PoolVerifyResult["checks"]> = [];
  checks.push({
    name: "Recipient address format",
    status: !recipientAddressProvided ? "WARN" : recipientAddressOk ? "PASS" : "WARN",
    detail: !recipientAddressProvided
      ? "No BTC address provided; payout matching is limited"
      : recipientAddressOk
        ? "Recipient looks like a BTC address"
        : "Recipient is not a BTC address; cannot match outputs reliably",
  });
  checks.push({
    name: "Transport",
    status: hasTls ? "PASS" : "WARN",
    detail: hasTls ? "TLS enabled" : "TLS disabled (prefer TLS when available)",
  });
  checks.push({
    name: "Stratum connection",
    status: connected ? "PASS" : "FAIL",
    detail: connected ? "Connected to pool" : "Unable to connect",
  });
  checks.push({
    name: "Notify received",
    status: haveNotify ? "PASS" : "FAIL",
    detail: haveNotify ? "Received mining.notify" : "No mining.notify within timeout",
  });
  checks.push({
    name: "Coinbase decode",
    status: haveOutputs ? "PASS" : "FAIL",
    detail: haveOutputs ? "Parsed coinbase outputs" : "Unable to parse coinbase outputs",
  });

  if (!recipientAddressProvided || !recipientAddressOk) {
    checks.push({
      name: "Address present",
      status: "WARN",
      detail: "Skipped — recipient address is not available/valid",
    });
  } else {
    checks.push({
      name: "Address present",
      status: yourShare > 0 ? "PASS" : "FAIL",
      detail: yourShare > 0 ? "Recipient found in outputs" : "Recipient not found in coinbase outputs",
    });
  }

  if (!recipientAddressProvided || !recipientAddressOk) {
    checks.push({
      name: "Payout split",
      status: "WARN",
      detail: "Skipped — recipient address is not available/valid",
    });
  } else {
    checks.push({
      name: "Payout split",
      status: yourShare >= minShare ? "PASS" : "FAIL",
      detail: `${(yourShare * 100).toFixed(1)}% ${yourShare >= minShare ? ">=" : "<"} ${(minShare * 100).toFixed(0)}%`,
    });
  }

  checks.push({
    name: "Largest output",
    status: !recipientAddressProvided || !recipientAddressOk ? "WARN" : largestPaysYou ? "PASS" : "FAIL",
    detail: !recipientAddressProvided || !recipientAddressOk
      ? "Skipped — recipient address is not available/valid"
      : largestPaysYou
        ? "Largest output pays you"
        : "Largest output is not your address",
  });

  let score = 10;
  if (!connected) score += 60;
  if (connected && !haveNotify) score += 35;
  if (haveOutputs && yourShare < minShare) {
    const gap = minShare - yourShare;
    score += Math.min(70, Math.floor(20 + gap * 100));
  }
  if (haveOutputs && !largestPaysYou) score += 20;
  if (!hasTls) score += 5;
  if (!recipientAddressProvided || !recipientAddressOk) score += 15;
  score = Math.max(0, Math.min(100, score));

  // If we cannot validate a BTC recipient address, we should not escalate to HIGH risk.
  // In that case we can only confirm connectivity/notify, not payout-to-recipient.
  if (!recipientAddressProvided || !recipientAddressOk) {
    score = Math.min(score, 49);
  }

  const label: "LOW" | "MEDIUM" | "HIGH" = score >= 70 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
  let summary = "No red flags detected from the last notify.";
  if (!recipientAddressProvided || !recipientAddressOk) {
    summary = "Recipient is not a BTC address. Connectivity and notify checks are valid, but payout-to-recipient cannot be confirmed via coinbase outputs.";
  } else if (label === "HIGH") {
    summary = `Your address receives only ${(yourShare * 100).toFixed(1)}% of outputs.`;
  } else if (label === "MEDIUM") {
    summary = "Some signals look unusual — review outputs and evidence.";
  }
  return { risk: { score, label }, checks, summary };
}

export async function verifyPool(params: {
  host: string;
  port: number;
  transport: StratumTransport;
  user: string;
  pass?: string;
  minShare?: number;
  timeoutMs?: number;
  // If provided, this is the intended recipient address to match against outputs.
  // If omitted, we try to use `user` when it looks like a BTC address.
  recipientAddress?: string;
}): Promise<PoolVerifyResult> {
  const timeoutMs = params.timeoutMs ?? 4000;
  const minShare = params.minShare ?? 0.98;

  const host = params.host.trim();
  const port = params.port;
  const transport = params.transport;
  const user = params.user.trim();
  const pass = params.pass;

  let resolvedIp: string | undefined;
  try {
    const res = await dns.lookup(host);
    resolvedIp = res.address;
  } catch {
    // ignore
  }

  const normalized = params.recipientAddress
    ? { recipient: params.recipientAddress.trim(), derived: false }
    : normalizeRecipientFromUser(user);

  const network: "mainnet" | "testnet" = normalized.recipient.toLowerCase().startsWith("tb1") ? "testnet" : "mainnet";

  const recipientCandidate = (isLikelyBitcoinAddress(normalized.recipient) ? normalized.recipient : "").trim();
  let recipient = recipientCandidate;
  let recipientAddressProvided = Boolean(recipientCandidate);
  let recipientAddressOk = false;
  let yourSpk = "";
  if (recipientCandidate) {
    try {
      yourSpk = addressToScriptPubKey(recipientCandidate).toString("hex");
      recipientAddressOk = true;
    } catch {
      // Keep running, but disable payout matching.
      recipient = "";
      recipientAddressOk = false;
    }
  }

  let probe: StratumProbe | undefined;
  try {
    probe = await stratumProbe({ host, port, transport, user, pass, timeoutMs });
  } catch (e) {
    return {
      ok: false,
      connected: false,
      notifyReceived: false,
      coinbaseParsed: false,
      transport: transport === "tls" ? "TLS" : "TCP",
      host,
      port,
      ip: resolvedIp,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const notify = probe.notify;
  const extranonce1 = probe.extranonce1 ?? "";
  const extranonce2Size = probe.extranonce2Size ?? 0;

  let outputsRaw: { n: number; sats: number; script: Buffer }[] = [];
  let outputs: PoolVerifyOutput[] = [];
  let totalSats = 0;
  let yourSats = 0;
  let nBits: string | undefined;
  let nTime: string | undefined;
  let nTimeIso: string | undefined;
  let coinbaseTxHex: string | undefined;
  let coinbaseTxid: string | undefined;
  let poolTag: string | undefined;

  if (notify && typeof notify === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: any = notify;
    const paramsArr: any[] = Array.isArray(n.params) ? n.params : [];
    try {
      const coinbase1 = String(paramsArr[2] ?? "");
      const coinbase2 = String(paramsArr[3] ?? "");
      nBits = paramsArr[6] ? String(paramsArr[6]) : undefined;
      nTime = paramsArr[7] ? String(paramsArr[7]) : undefined;
      const extranonce2 = "00".repeat(extranonce2Size);
      coinbaseTxHex = coinbase1 + extranonce1 + extranonce2 + coinbase2;
      outputsRaw = parseTxOutputs(coinbaseTxHex);
      coinbaseTxid = txidFromRawTxHex(coinbaseTxHex);
      poolTag = extractCoinbaseTag(Buffer.from(coinbaseTxHex, "hex"));
    } catch {
      outputsRaw = [];
    }
  }

  if (nTime) {
    try {
      nTimeIso = new Date(parseInt(nTime, 16) * 1000).toISOString();
    } catch {
      // ignore
    }
  }

  if (outputsRaw.length) {
    totalSats = outputsRaw.reduce((a, o) => a + o.sats, 0);
    const sorted = [...outputsRaw].sort((a, b) => b.sats - a.sats);
    for (const o of sorted) {
      if (yourSpk && o.script.toString("hex") === yourSpk) yourSats += o.sats;
    }
    for (const o of sorted) {
      const sharePct = totalSats ? (o.sats / totalSats) * 100 : 0;
      const isYou = Boolean(yourSpk) && o.script.toString("hex") === yourSpk;
      const recipientAddr = scriptPubKeyToAddress(o.script, network);
      outputs.push({
        n: o.n,
        sats: o.sats,
        sharePct,
        isYou,
        recipient: recipientAddr ? (isYou ? `${recipientAddr} (YOU)` : recipientAddr) : "(unrecognized script)",
        scriptPubKey: o.script.toString("hex"),
      });
    }
  }

  const yourShare = totalSats ? yourSats / totalSats : 0;
  const largestPaysYou = outputs.length ? outputs[0].isYou : false;
  const { risk, checks, summary } = riskAndChecks({
    yourShare,
    minShare,
    largestPaysYou,
    tls: transport === "tls",
    connected: true,
    haveNotify: Boolean(notify),
    haveOutputs: outputsRaw.length > 0,
    recipientAddressOk,
    recipientAddressProvided,
  });

  const internal = resolvedIp ? isPrivateOrLocalIp(resolvedIp) : false;

  return {
    ok: true,
    transport: transport === "tls" ? "TLS" : "TCP",
    host,
    port,
    ip: resolvedIp,
    latencyMs: probe.latencyMs,
    connected: true,
    authOk: probe.authOk,
    notifyReceived: Boolean(notify),
    coinbaseParsed: outputsRaw.length > 0,
    coinbaseTxid,
    poolTag: poolTag ? (internal ? `${poolTag} (internal)` : poolTag) : internal ? "internal" : undefined,
    nBits,
    nTime,
    nTimeIso,
    yourAddress: recipient || undefined,
    yourSharePct: totalSats ? yourShare * 100 : undefined,
    nonYouPct: totalSats ? 100 - yourShare * 100 : undefined,
    largestPaysYou,
    outputs: outputs.length ? outputs : undefined,
    risk,
    checks,
    summary,
  };
}

// Backwards/semantic alias (used by other modules):
// "verifyPoolOnStratum" clarifies that this is a stratum deep verification.
export const verifyPoolOnStratum = verifyPool;
