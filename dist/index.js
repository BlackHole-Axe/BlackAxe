var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/cgminerApi.ts
import { exec } from "child_process";
import { promisify } from "util";
function stripNulls(s) {
  return s.replace(/\u0000/g, "").trim();
}
async function sendSocket(ip, port, payload) {
  try {
    const payloadStr = typeof payload === "string" ? payload : payload.toString("utf8");
    const escapedPayload = payloadStr.replace(/'/g, "'\\''");
    const cmd = `echo '${escapedPayload}' | timeout 3s nc -w 2 ${ip} ${port}`;
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 4e3,
      maxBuffer: 1024 * 1024
      // 1MB buffer
    });
    if (stderr && !stdout) {
      return null;
    }
    const cleaned = stripNulls(stdout);
    return cleaned.length > 0 ? cleaned : null;
  } catch (error) {
    return null;
  }
}
function tryJsonParse(raw) {
  const t2 = (raw || "").trim();
  if (!t2) return null;
  if (!(t2.startsWith("{") || t2.startsWith("["))) return null;
  try {
    return JSON.parse(t2);
  } catch {
    return null;
  }
}
async function cgminerCommand(ip, command, port = 4028, parameter) {
  const payloadObj = parameter ? { command, parameter } : { command };
  const payloads = [
    Buffer.from(JSON.stringify(payloadObj) + "\0", "utf8"),
    Buffer.from(JSON.stringify(payloadObj), "utf8"),
    Buffer.from(JSON.stringify(payloadObj) + "\n", "utf8")
  ];
  for (const p of payloads) {
    const raw = await sendSocket(ip, port, p);
    if (!raw) continue;
    const parsed2 = tryJsonParse(raw);
    return parsed2 ? { raw, json: parsed2 } : { raw };
  }
  const legacyRaw = await sendSocket(ip, port, command);
  if (!legacyRaw) return null;
  const parsed = tryJsonParse(legacyRaw);
  return parsed ? { raw: legacyRaw, json: parsed } : { raw: legacyRaw };
}
var execAsync;
var init_cgminerApi = __esm({
  "server/cgminerApi.ts"() {
    "use strict";
    execAsync = promisify(exec);
  }
});

// server/poolVerify.ts
import net from "node:net";
import tls from "node:tls";
import crypto from "node:crypto";
import dns from "node:dns/promises";
function parseStratumEndpoint(urlOrHost, portOverride) {
  const raw = (urlOrHost || "").trim();
  const lower = raw.toLowerCase();
  let transport = "tcp";
  let cleaned = raw;
  if (lower.startsWith("stratum+ssl://") || lower.startsWith("stratum+tls://") || lower.startsWith("ssl://") || lower.startsWith("tls://")) {
    transport = "tls";
  }
  cleaned = cleaned.replace(/^stratum\+tcp:\/\//i, "").replace(/^stratum\+ssl:\/\//i, "").replace(/^stratum\+tls:\/\//i, "").replace(/^stratum:\/\//i, "").replace(/^tcp:\/\//i, "").replace(/^ssl:\/\//i, "").replace(/^tls:\/\//i, "");
  const hostPort = cleaned.split("/")[0];
  let host = hostPort;
  let portFromUrl = null;
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
  const port = portOverride ?? null ?? portFromUrl;
  return { host, port, transport };
}
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}
function dblSha256(buf) {
  return sha256(sha256(buf));
}
function isPrivateOrLocalIp(ip) {
  try {
    const a = globalThis.ipaddress;
    void a;
  } catch {
  }
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
function base58Decode(s) {
  let x = BigInt(0);
  for (const ch of s) {
    const v = BASE58_ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Invalid base58 character");
    x = x * BigInt(58) + BigInt(v);
  }
  let hex = x.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex");
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
function base58CheckDecode(s) {
  const raw = base58Decode(s);
  if (raw.length < 5) throw new Error("Invalid base58check length");
  const payload = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const expected = dblSha256(payload).subarray(0, 4);
  if (!checksum.equals(expected)) throw new Error("Invalid base58check checksum");
  return payload;
}
function base58Encode(buf) {
  let x = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (x > 0) {
    const mod = Number(x % BigInt(58));
    out = BASE58_ALPHABET[mod] + out;
    x = x / BigInt(58);
  }
  let leading = 0;
  for (const b of buf) {
    if (b === 0) leading += 1;
    else break;
  }
  return "1".repeat(leading) + (out || "");
}
function base58CheckEncode(payload) {
  const checksum = dblSha256(payload).subarray(0, 4);
  return base58Encode(Buffer.concat([payload, checksum]));
}
function bech32Polymod(values) {
  const GEN = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (chk & 33554431) << 5 ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i & 1) === 1) chk ^= GEN[i];
    }
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const out = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >>> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 31);
  return out;
}
function bech32CreateChecksum(hrp, data) {
  const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = bech32Polymod(values) ^ 1;
  const out = [];
  for (let p = 0; p < 6; p++) out.push(mod >>> 5 * (5 - p) & 31);
  return out;
}
function bech32Encode(hrp, data) {
  const checksum = bech32CreateChecksum(hrp, data);
  const combined = [...data, ...checksum];
  let out = hrp + "1";
  for (const d of combined) out += BECH32_CHARSET[d];
  return out;
}
function bech32Decode(addr) {
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf("1");
  if (pos < 1 || pos + 7 > a.length) throw new Error("Invalid bech32 address");
  const hrp = a.slice(0, pos);
  const dataPart = a.slice(pos + 1);
  const data = [];
  for (const ch of dataPart) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v < 0) throw new Error("Invalid bech32 character");
    data.push(v);
  }
  const mod = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (mod !== 1) throw new Error("Invalid bech32 checksum");
  return { hrp, data: data.slice(0, data.length - 6) };
}
function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >> from !== 0) throw new Error("Invalid value");
    acc = acc << from | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push(acc >> bits & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push(acc << to - bits & maxv);
  } else {
    if (bits >= from) throw new Error("Excess padding");
    if (acc << to - bits & maxv) throw new Error("Non-zero padding");
  }
  return out;
}
function isLikelyBitcoinAddress(s) {
  const a = s.trim();
  if (!a) return false;
  if (/^(bc1|tb1)[0-9a-z]{20,}$/i.test(a)) return true;
  if (/^[13mn2][1-9A-HJ-NP-Za-km-z]{25,}$/i.test(a)) return true;
  return false;
}
function normalizeRecipientFromUser(user) {
  const u = (user || "").trim();
  if (!u) return { recipient: "", derived: false };
  const dotIdx = u.indexOf(".");
  if (dotIdx > 0) {
    const prefix = u.slice(0, dotIdx).trim();
    if (isLikelyBitcoinAddress(prefix)) return { recipient: prefix, derived: true };
  }
  const slashIdx = u.indexOf("/");
  if (slashIdx > 0) {
    const prefix = u.slice(0, slashIdx).trim();
    if (isLikelyBitcoinAddress(prefix)) return { recipient: prefix, derived: true };
  }
  return { recipient: u, derived: false };
}
function addressToScriptPubKey(address) {
  const a = address.trim();
  if (/^(bc1|tb1)/i.test(a)) {
    const { hrp, data } = bech32Decode(a);
    const witver = data[0];
    const prog = Buffer.from(convertBits(data.slice(1), 5, 8, false));
    if (witver < 0 || witver > 16) throw new Error("Unsupported witness version");
    const op = witver === 0 ? 0 : 80 + witver;
    return Buffer.concat([Buffer.from([op, prog.length]), prog]);
  }
  const payload = base58CheckDecode(a);
  const version = payload[0];
  const hash = payload.subarray(1);
  if (hash.length !== 20) throw new Error("Unsupported base58 payload");
  const isP2PKH = version === 0 || version === 111;
  const isP2SH = version === 5 || version === 196;
  if (isP2PKH) {
    return Buffer.from([118, 169, 20, ...hash, 136, 172]);
  }
  if (isP2SH) {
    return Buffer.from([169, 20, ...hash, 135]);
  }
  throw new Error("Unsupported address version");
}
function scriptPubKeyToAddress(script, network) {
  const hex = script.toString("hex");
  if (hex.startsWith("76a914") && hex.endsWith("88ac") && script.length === 25) {
    const hash = script.subarray(3, 23);
    const version = network === "mainnet" ? 0 : 111;
    return base58CheckEncode(Buffer.concat([Buffer.from([version]), hash]));
  }
  if (hex.startsWith("a914") && hex.endsWith("87") && script.length === 23) {
    const hash = script.subarray(2, 22);
    const version = network === "mainnet" ? 5 : 196;
    return base58CheckEncode(Buffer.concat([Buffer.from([version]), hash]));
  }
  if (script.length >= 4) {
    const op = script[0];
    const push = script[1];
    if (push > 1 && push + 2 === script.length) {
      let witver = null;
      if (op === 0) witver = 0;
      if (op >= 81 && op <= 96) witver = op - 80;
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
function extractCoinbaseTag(coinbaseTx) {
  try {
    const r = new BufReader(coinbaseTx);
    r.readU32LE();
    const marker = r.peekU8();
    const flag = r.peekU8(1);
    const hasWitness = marker === 0 && flag === 1;
    if (hasWitness) {
      r.readU8();
      r.readU8();
    }
    const vin = r.readVarInt();
    if (vin < 1) return void 0;
    r.readBytes(32);
    r.readU32LE();
    const scriptLen = r.readVarInt();
    const script = r.readBytes(scriptLen);
    const printable = script.toString("latin1").replace(/[^\x20-\x7E]+/g, " ").trim();
    if (printable.length >= 3) return printable.slice(0, 64);
  } catch {
  }
  return void 0;
}
function parseTxOutputs(rawTxHex) {
  const tx = Buffer.from(rawTxHex, "hex");
  const r = new BufReader(tx);
  r.readU32LE();
  const marker = r.peekU8();
  const flag = r.peekU8(1);
  const hasWitness = marker === 0 && flag === 1;
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
  const outputs = [];
  for (let i = 0; i < vout; i++) {
    const sats = r.readU64LE();
    const scriptLen = r.readVarInt();
    const script = r.readBytes(scriptLen);
    outputs.push({ n: i, sats: Number(sats), script });
  }
  if (hasWitness) {
    for (let i = 0; i < vin; i++) {
      const items = r.readVarInt();
      for (let j = 0; j < items; j++) {
        const len = r.readVarInt();
        r.readBytes(len);
      }
    }
  }
  r.readU32LE();
  return outputs;
}
function txidFromRawTxHex(rawTxHex) {
  const tx = Buffer.from(rawTxHex, "hex");
  const h = dblSha256(tx);
  return Buffer.from(h).reverse().toString("hex");
}
async function stratumProbe(opts) {
  const { host, port, transport, user, pass, timeoutMs } = opts;
  const start = Date.now();
  const socket = transport === "tls" ? tls.connect({ host, port, servername: host, rejectUnauthorized: false }) : net.connect({ host, port });
  const probe = { latencyMs: 0 };
  const lines = [];
  let buffer = "";
  let resolved = false;
  const cleanup = () => {
    try {
      socket.removeAllListeners();
      socket.destroy();
    } catch {
    }
  };
  const writeJson = (obj) => {
    const s = JSON.stringify(obj) + "\n";
    socket.write(s);
  };
  const done = (ok, err) => {
    if (resolved) return;
    resolved = true;
    probe.latencyMs = Date.now() - start;
    cleanup();
    if (!ok && err) throw err;
  };
  const waitFor = (pred, ms) => new Promise((resolve, reject) => {
    const t2 = setInterval(() => {
      const v = pred();
      if (v !== void 0) {
        clearInterval(t2);
        clearTimeout(to);
        resolve(v);
      }
    }, 25);
    const to = setTimeout(() => {
      clearInterval(t2);
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
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      lines.push(line);
    }
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("error", (e) => reject(e));
  });
  writeJson({ id: 1, method: "mining.subscribe", params: ["BlackAxe", "1"] });
  writeJson({ id: 2, method: "mining.authorize", params: [user, pass ?? "x"] });
  const parsed = [];
  const parseLoop = setInterval(() => {
    while (lines.length) {
      const raw = lines.shift();
      if (!raw) break;
      try {
        const o = JSON.parse(raw);
        parsed.push(o);
      } catch {
      }
    }
  }, 20);
  try {
    const sub = await waitFor(() => parsed.find((p) => p.id === 1), timeoutMs);
    const resAny = sub.result;
    if (Array.isArray(resAny) && typeof resAny[1] === "string") probe.extranonce1 = resAny[1];
    if (Array.isArray(resAny) && typeof resAny[2] === "number") probe.extranonce2Size = resAny[2];
    const auth = await waitFor(() => parsed.find((p) => p.id === 2), timeoutMs);
    probe.authOk = Boolean(auth.result);
    const notify = await waitFor(() => parsed.find((p) => p.method === "mining.notify"), timeoutMs);
    probe.notify = notify;
  } finally {
    clearInterval(parseLoop);
  }
  done(true);
  return probe;
}
function riskAndChecks(args) {
  const { yourShare, minShare, largestPaysYou, tls: hasTls, connected, haveNotify, haveOutputs, recipientAddressOk, recipientAddressProvided } = args;
  const checks = [];
  checks.push({
    name: "Recipient address format",
    status: !recipientAddressProvided ? "WARN" : recipientAddressOk ? "PASS" : "WARN",
    detail: !recipientAddressProvided ? "No BTC address provided; payout matching is limited" : recipientAddressOk ? "Recipient looks like a BTC address" : "Recipient is not a BTC address; cannot match outputs reliably"
  });
  checks.push({
    name: "Transport",
    status: hasTls ? "PASS" : "WARN",
    detail: hasTls ? "TLS enabled" : "TLS disabled (prefer TLS when available)"
  });
  checks.push({
    name: "Stratum connection",
    status: connected ? "PASS" : "FAIL",
    detail: connected ? "Connected to pool" : "Unable to connect"
  });
  checks.push({
    name: "Notify received",
    status: haveNotify ? "PASS" : "FAIL",
    detail: haveNotify ? "Received mining.notify" : "No mining.notify within timeout"
  });
  checks.push({
    name: "Coinbase decode",
    status: haveOutputs ? "PASS" : "FAIL",
    detail: haveOutputs ? "Parsed coinbase outputs" : "Unable to parse coinbase outputs"
  });
  if (!recipientAddressProvided || !recipientAddressOk) {
    checks.push({
      name: "Address present",
      status: "WARN",
      detail: "Skipped \u2014 recipient address is not available/valid"
    });
  } else {
    checks.push({
      name: "Address present",
      status: yourShare > 0 ? "PASS" : "FAIL",
      detail: yourShare > 0 ? "Recipient found in outputs" : "Recipient not found in coinbase outputs"
    });
  }
  if (!recipientAddressProvided || !recipientAddressOk) {
    checks.push({
      name: "Payout split",
      status: "WARN",
      detail: "Skipped \u2014 recipient address is not available/valid"
    });
  } else {
    checks.push({
      name: "Payout split",
      status: yourShare >= minShare ? "PASS" : "FAIL",
      detail: `${(yourShare * 100).toFixed(1)}% ${yourShare >= minShare ? ">=" : "<"} ${(minShare * 100).toFixed(0)}%`
    });
  }
  checks.push({
    name: "Largest output",
    status: !recipientAddressProvided || !recipientAddressOk ? "WARN" : largestPaysYou ? "PASS" : "FAIL",
    detail: !recipientAddressProvided || !recipientAddressOk ? "Skipped \u2014 recipient address is not available/valid" : largestPaysYou ? "Largest output pays you" : "Largest output is not your address"
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
  if (!recipientAddressProvided || !recipientAddressOk) {
    score = Math.min(score, 49);
  }
  const label = score >= 70 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";
  let summary = "No red flags detected from the last notify.";
  if (!recipientAddressProvided || !recipientAddressOk) {
    summary = "Recipient is not a BTC address. Connectivity and notify checks are valid, but payout-to-recipient cannot be confirmed via coinbase outputs.";
  } else if (label === "HIGH") {
    summary = `Your address receives only ${(yourShare * 100).toFixed(1)}% of outputs.`;
  } else if (label === "MEDIUM") {
    summary = "Some signals look unusual \u2014 review outputs and evidence.";
  }
  return { risk: { score, label }, checks, summary };
}
async function verifyPool(params) {
  const timeoutMs = params.timeoutMs ?? 4e3;
  const minShare = params.minShare ?? 0.98;
  const host = params.host.trim();
  const port = params.port;
  const transport = params.transport;
  const user = params.user.trim();
  const pass = params.pass;
  let resolvedIp;
  try {
    const res = await dns.lookup(host);
    resolvedIp = res.address;
  } catch {
  }
  const normalized = params.recipientAddress ? { recipient: params.recipientAddress.trim(), derived: false } : normalizeRecipientFromUser(user);
  const network = normalized.recipient.toLowerCase().startsWith("tb1") ? "testnet" : "mainnet";
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
      recipient = "";
      recipientAddressOk = false;
    }
  }
  let probe;
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
      error: e instanceof Error ? e.message : String(e)
    };
  }
  const notify = probe.notify;
  const extranonce1 = probe.extranonce1 ?? "";
  const extranonce2Size = probe.extranonce2Size ?? 0;
  let outputsRaw = [];
  let outputs = [];
  let totalSats = 0;
  let yourSats = 0;
  let nBits;
  let nTime;
  let nTimeIso;
  let coinbaseTxHex;
  let coinbaseTxid;
  let poolTag;
  if (notify && typeof notify === "object") {
    const n = notify;
    const paramsArr = Array.isArray(n.params) ? n.params : [];
    try {
      const coinbase1 = String(paramsArr[2] ?? "");
      const coinbase2 = String(paramsArr[3] ?? "");
      nBits = paramsArr[6] ? String(paramsArr[6]) : void 0;
      nTime = paramsArr[7] ? String(paramsArr[7]) : void 0;
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
      nTimeIso = new Date(parseInt(nTime, 16) * 1e3).toISOString();
    } catch {
    }
  }
  if (outputsRaw.length) {
    totalSats = outputsRaw.reduce((a, o) => a + o.sats, 0);
    const sorted = [...outputsRaw].sort((a, b) => b.sats - a.sats);
    for (const o of sorted) {
      if (yourSpk && o.script.toString("hex") === yourSpk) yourSats += o.sats;
    }
    for (const o of sorted) {
      const sharePct = totalSats ? o.sats / totalSats * 100 : 0;
      const isYou = Boolean(yourSpk) && o.script.toString("hex") === yourSpk;
      const recipientAddr = scriptPubKeyToAddress(o.script, network);
      outputs.push({
        n: o.n,
        sats: o.sats,
        sharePct,
        isYou,
        recipient: recipientAddr ? isYou ? `${recipientAddr} (YOU)` : recipientAddr : "(unrecognized script)",
        scriptPubKey: o.script.toString("hex")
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
    recipientAddressProvided
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
    poolTag: poolTag ? internal ? `${poolTag} (internal)` : poolTag : internal ? "internal" : void 0,
    nBits,
    nTime,
    nTimeIso,
    yourAddress: recipient || void 0,
    yourSharePct: totalSats ? yourShare * 100 : void 0,
    nonYouPct: totalSats ? 100 - yourShare * 100 : void 0,
    largestPaysYou,
    outputs: outputs.length ? outputs : void 0,
    risk,
    checks,
    summary
  };
}
var BASE58_ALPHABET, BECH32_CHARSET, BufReader, verifyPoolOnStratum;
var init_poolVerify = __esm({
  "server/poolVerify.ts"() {
    "use strict";
    BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    BufReader = class {
      constructor(buf) {
        this.buf = buf;
      }
      off = 0;
      peekU8(delta = 0) {
        return this.buf[this.off + delta] ?? 0;
      }
      readU8() {
        const v = this.buf[this.off];
        if (v === void 0) throw new Error("EOF");
        this.off += 1;
        return v;
      }
      readU32LE() {
        if (this.off + 4 > this.buf.length) throw new Error("EOF");
        const v = this.buf.readUInt32LE(this.off);
        this.off += 4;
        return v;
      }
      readU64LE() {
        if (this.off + 8 > this.buf.length) throw new Error("EOF");
        const v = this.buf.readBigUInt64LE(this.off);
        this.off += 8;
        return v;
      }
      readBytes(n) {
        if (this.off + n > this.buf.length) throw new Error("EOF");
        const v = this.buf.subarray(this.off, this.off + n);
        this.off += n;
        return v;
      }
      readVarInt() {
        const first = this.readU8();
        if (first < 253) return first;
        if (first === 253) {
          const b = this.readBytes(2);
          return b.readUInt16LE(0);
        }
        if (first === 254) {
          return this.readU32LE();
        }
        const v = this.readU64LE();
        if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("VarInt too large");
        return Number(v);
      }
    };
    verifyPoolOnStratum = verifyPool;
  }
});

// server/minerIdentify.ts
function safeLower(v) {
  return (v ?? "").toString().toLowerCase();
}
function inferAvalonModelFromStats(statsJson) {
  try {
    const statsList = (() => {
      if (!statsJson) return [];
      if (Array.isArray(statsJson)) return statsJson;
      if (statsJson.STATS) {
        return Array.isArray(statsJson.STATS) ? statsJson.STATS : [statsJson.STATS];
      }
      if (typeof statsJson === "object") return [statsJson];
      return [];
    })();
    for (const s of statsList) {
      if (!s || typeof s !== "object") continue;
      const mmFields = [
        s["MM ID0"],
        s["MM ID1"],
        s["MM ID2"],
        s["MM ID3"],
        s["MM ID"],
        s["MM ID0:Summary"],
        s["MM ID1:Summary"],
        s["ID"]
      ].filter(Boolean);
      for (const mmValue of mmFields) {
        const text = String(mmValue).toLowerCase();
        if (text.includes("nano3s") || text.includes("nano 3s")) return "Avalon Nano 3S";
        if (text.includes("nano")) return "Avalon Nano";
        if (text.includes("avalon q") || /\bq\b/.test(text)) return "Avalon Q";
        const modelMatch = text.match(/(?:avalon|miner|model)[\s_-]*([0-9]{3,4})/i);
        if (modelMatch) return `AvalonMiner ${modelMatch[1]}`;
        const bracketMatch = text.match(/model\s*\[\s*([0-9]{3,4})\s*\]/i);
        if (bracketMatch) return `AvalonMiner ${bracketMatch[1]}`;
      }
      const infoFields = [
        s.Type,
        s.Model,
        s.Description,
        s.DeviceModel,
        s.Desc,
        s.Name
      ].filter(Boolean).map((v) => String(v).toLowerCase()).join(" ");
      if (infoFields) {
        if (infoFields.includes("nano3s") || infoFields.includes("nano 3s")) return "Avalon Nano 3S";
        if (infoFields.includes("nano")) return "Avalon Nano";
        if (infoFields.includes("avalon q") || /\bq\b/.test(infoFields)) return "Avalon Q";
        const modelMatch = infoFields.match(/(?:avalon|miner|model)[\s_-]*([0-9]{3,4})/);
        if (modelMatch) return `AvalonMiner ${modelMatch[0]}`;
        if (infoFields.includes("avalon") || infoFields.includes("canaan")) {
          return "Avalon";
        }
      }
      if (s.ID && String(s.ID).toLowerCase().includes("canaan")) {
        return "Canaan Avalon";
      }
    }
  } catch (err) {
    console.error("[minerIdentify] Error parsing Avalon STATS:", err);
  }
  return null;
}
function inferMinerIdentity(versionRaw, statsJson) {
  let versionJson = null;
  if (typeof versionRaw === "object" && versionRaw !== null) {
    versionJson = versionRaw;
  } else if (typeof versionRaw === "string") {
    try {
      versionJson = JSON.parse(versionRaw);
    } catch {
    }
  }
  if (versionJson && versionJson.VERSION && Array.isArray(versionJson.VERSION)) {
    const ver = versionJson.VERSION[0];
    if (ver) {
      if (ver.PROD) {
        const prod = String(ver.PROD);
        if (prod.includes("Avalon Q") || prod === "Q") {
          return { minerType: "avalon", model: "Avalon Q" };
        }
        const prodLower = prod.toLowerCase();
        if (prodLower === "avalonnano" || prodLower === "avalon nano") {
          return { minerType: "avalon", model: "Avalon Nano" };
        }
        if (prod.includes("Nano")) {
          const formatted = prod.includes("Avalon") ? prod : `Avalon ${prod}`;
          return { minerType: "avalon", model: formatted };
        }
        if (prod.includes("Avalon")) {
          return { minerType: "avalon", model: prod };
        }
      }
      if (ver.MODEL) {
        const model = String(ver.MODEL);
        if (model === "Q") {
          return { minerType: "avalon", model: "Avalon Q" };
        }
        if (model.includes("Nano")) {
          return { minerType: "avalon", model: `Avalon ${model}` };
        }
        if (/^[0-9]{3,4}$/.test(model)) {
          return { minerType: "avalon", model: `AvalonMiner ${model}` };
        }
      }
    }
  }
  const avalonModel = statsJson ? inferAvalonModelFromStats(statsJson) : null;
  if (avalonModel) return { minerType: "avalon", model: avalonModel };
  const v = safeLower(typeof versionRaw === "string" ? versionRaw : JSON.stringify(versionRaw));
  if (v.includes("avalon") || v.includes("canaan") || v.includes("avalonminer")) {
    return { minerType: "avalon", model: "Avalon" };
  }
  if (v.includes("antminer") || v.includes("bitmain") || v.includes("bmminer") || v.includes("bosminer")) {
    return { minerType: "antminer", model: "Bitmain/Antminer" };
  }
  if (v.includes("whatsminer") || v.includes("microbt")) {
    return { minerType: "whatsminer", model: "Whatsminer" };
  }
  return { minerType: "other", model: "CGMiner" };
}
var init_minerIdentify = __esm({
  "server/minerIdentify.ts"() {
    "use strict";
  }
});

// server/db.ts
import bcrypt from "bcrypt";
import initSqlJs from "sql.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
async function getDb() {
  if (_db && _dbInitialized) return _db;
  try {
    const SQL = await initSqlJs();
    _dbPath = process.env.DATABASE_URL || "./data/blackaxe.db";
    const dir = dirname(_dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (existsSync(_dbPath)) {
      const buffer = readFileSync(_dbPath);
      _db = new SQL.Database(buffer);
      console.log("[Database] SQLite loaded from file");
    } else {
      _db = new SQL.Database();
      console.log("[Database] SQLite created new database");
    }
    if (_saveInterval) clearInterval(_saveInterval);
    _saveInterval = setInterval(() => {
      saveDatabase();
    }, 5e3);
    _dbInitialized = true;
    return _db;
  } catch (error) {
    console.error("[Database] Failed to initialize:", error);
    return null;
  }
}
function saveDatabase() {
  if (_db && _dbPath) {
    try {
      const data = _db.export();
      const buffer = Buffer.from(data);
      writeFileSync(_dbPath, buffer);
    } catch (error) {
      console.error("[Database] Failed to save:", error);
    }
  }
}
function runQuery(sql, params = []) {
  if (!_db) return [];
  try {
    const stmt = _db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  } catch (error) {
    console.error("[Database] Query error:", sql, error);
    return [];
  }
}
function runExec(sql, params = []) {
  if (!_db) return false;
  try {
    if (params.length > 0) {
      const stmt = _db.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
    } else {
      _db.run(sql);
    }
    saveDatabase();
    return true;
  } catch (error) {
    console.error("[Database] Exec error:", sql, error);
    return false;
  }
}
async function getUserByOpenId(openId) {
  await getDb();
  const results = runQuery("SELECT * FROM users WHERE openId = ?", [openId]);
  return results.length > 0 ? results[0] : void 0;
}
async function getUserById(id) {
  await getDb();
  const results = runQuery("SELECT * FROM users WHERE id = ?", [id]);
  return results.length > 0 ? results[0] : void 0;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  await getDb();
  if (!_db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const existing = await getUserByOpenId(user.openId);
  const now = Date.now();
  if (existing) {
    runExec(
      "UPDATE users SET name = ?, email = ?, loginMethod = ?, role = ?, updatedAt = ?, lastSignedIn = ? WHERE openId = ?",
      [
        user.name ?? existing.name,
        user.email ?? existing.email,
        user.loginMethod ?? existing.loginMethod,
        user.role ?? existing.role,
        now,
        user.lastSignedIn ? user.lastSignedIn.getTime() : now,
        user.openId
      ]
    );
  } else {
    runExec(
      "INSERT INTO users (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        user.openId,
        user.name || null,
        user.email || null,
        user.loginMethod || null,
        user.role || "user",
        now,
        now,
        user.lastSignedIn ? user.lastSignedIn.getTime() : now
      ]
    );
  }
}
async function getMinersByUserId(userId) {
  await getDb();
  return runQuery("SELECT * FROM miners WHERE userId = ? ORDER BY createdAt DESC", [userId]);
}
async function getMinerById(id) {
  await getDb();
  const results = runQuery("SELECT * FROM miners WHERE id = ?", [id]);
  return results.length > 0 ? results[0] : void 0;
}
async function createMiner(miner) {
  await getDb();
  const now = Date.now();
  const tags = Array.isArray(miner.tags) ? JSON.stringify(miner.tags) : miner.tags || null;
  runExec(
    `INSERT INTO miners (
      userId, name, ipAddress, macAddress, minerType, model, firmware, status,
      hashrate, hashrateUnit, temperature, fanSpeed, power, voltage, frequency,
      poolUrl, poolPort, poolUser, poolPassword,
      poolUrl2, poolPort2, poolUser2, poolPassword2,
      poolUrl3, poolPort3, poolUser3, poolPassword3,
      poolStatus, poolLastCheckedAt, poolError,
      poolVerify, poolVerifyLastCheckedAt,
      sharesAccepted, sharesRejected, bestDifficulty, bestDifficultyAllTime, bestDifficultyPrevSession, uptimeSeconds,
      apiPort,
      tags, lastSeen, createdAt, updatedAt
    )
     VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?,
      ?, ?, ?, ?
    )`,
    [
      miner.userId,
      miner.name,
      miner.ipAddress,
      miner.macAddress || null,
      miner.minerType || "other",
      miner.model || null,
      miner.firmware || null,
      miner.status || "unknown",
      miner.hashrate || 0,
      miner.hashrateUnit || "TH/s",
      miner.temperature || null,
      miner.fanSpeed || null,
      miner.power || null,
      miner.voltage || null,
      miner.frequency || null,
      miner.poolUrl || null,
      miner.poolPort ?? null,
      miner.poolUser || null,
      miner.poolPassword || null,
      miner.poolUrl2 || null,
      miner.poolPort2 ?? null,
      miner.poolUser2 || null,
      miner.poolPassword2 || null,
      miner.poolUrl3 || null,
      miner.poolPort3 ?? null,
      miner.poolUser3 || null,
      miner.poolPassword3 || null,
      miner.poolStatus || null,
      miner.poolLastCheckedAt ?? null,
      miner.poolError || null,
      miner.poolVerify || null,
      miner.poolVerifyLastCheckedAt ?? null,
      miner.sharesAccepted || 0,
      miner.sharesRejected || 0,
      miner.bestDifficulty || null,
      miner.bestDifficultyAllTime || null,
      miner.bestDifficultyPrevSession || null,
      miner.uptimeSeconds || 0,
      miner.apiPort || 80,
      tags,
      miner.lastSeen || null,
      now,
      now
    ]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  return await getMinerById(id);
}
async function updateMiner(id, updates) {
  await getDb();
  const now = Date.now();
  const miner = await getMinerById(id);
  if (!miner) return void 0;
  const tags = updates.tags !== void 0 ? Array.isArray(updates.tags) ? JSON.stringify(updates.tags) : updates.tags : miner.tags;
  runExec(
    `UPDATE miners SET 
      name = ?, ipAddress = ?, macAddress = ?, minerType = ?, model = ?, firmware = ?,
      status = ?, hashrate = ?, hashrateUnit = ?, temperature = ?, fanSpeed = ?,
      power = ?, voltage = ?, frequency = ?,
      poolUrl = ?, poolPort = ?, poolUser = ?, poolPassword = ?,
      poolUrl2 = ?, poolPort2 = ?, poolUser2 = ?, poolPassword2 = ?,
      poolUrl3 = ?, poolPort3 = ?, poolUser3 = ?, poolPassword3 = ?,
      poolStatus = ?, poolLastCheckedAt = ?, poolError = ?,
      poolVerify = ?, poolVerifyLastCheckedAt = ?,
      sharesAccepted = ?, sharesRejected = ?,
      bestDifficulty = ?, bestDifficultyAllTime = ?, bestDifficultyPrevSession = ?,
      uptimeSeconds = ?,
      apiPort = ?,
      tags = ?, lastSeen = ?, updatedAt = ?
      WHERE id = ?`,
    [
      updates.name ?? miner.name,
      updates.ipAddress ?? miner.ipAddress,
      updates.macAddress ?? miner.macAddress,
      updates.minerType ?? miner.minerType,
      updates.model ?? miner.model,
      updates.firmware ?? miner.firmware,
      updates.status ?? miner.status,
      updates.hashrate ?? miner.hashrate,
      updates.hashrateUnit ?? miner.hashrateUnit,
      updates.temperature ?? miner.temperature,
      updates.fanSpeed ?? miner.fanSpeed,
      updates.power ?? miner.power,
      updates.voltage ?? miner.voltage,
      updates.frequency ?? miner.frequency,
      updates.poolUrl ?? miner.poolUrl,
      updates.poolPort ?? miner.poolPort ?? null,
      updates.poolUser ?? miner.poolUser,
      updates.poolPassword ?? miner.poolPassword,
      updates.poolUrl2 ?? miner.poolUrl2 ?? null,
      updates.poolPort2 ?? miner.poolPort2 ?? null,
      updates.poolUser2 ?? miner.poolUser2 ?? null,
      updates.poolPassword2 ?? miner.poolPassword2 ?? null,
      updates.poolUrl3 ?? miner.poolUrl3 ?? null,
      updates.poolPort3 ?? miner.poolPort3 ?? null,
      updates.poolUser3 ?? miner.poolUser3 ?? null,
      updates.poolPassword3 ?? miner.poolPassword3 ?? null,
      updates.poolStatus ?? miner.poolStatus ?? null,
      updates.poolLastCheckedAt ?? miner.poolLastCheckedAt ?? null,
      updates.poolError ?? miner.poolError ?? null,
      updates.poolVerify ?? miner.poolVerify ?? null,
      updates.poolVerifyLastCheckedAt ?? miner.poolVerifyLastCheckedAt ?? null,
      updates.sharesAccepted ?? miner.sharesAccepted,
      updates.sharesRejected ?? miner.sharesRejected,
      updates.bestDifficulty ?? miner.bestDifficulty,
      updates.bestDifficultyAllTime ?? miner.bestDifficultyAllTime,
      updates.bestDifficultyPrevSession ?? miner.bestDifficultyPrevSession,
      updates.uptimeSeconds ?? miner.uptimeSeconds,
      updates.apiPort ?? miner.apiPort ?? 80,
      tags,
      updates.lastSeen ?? miner.lastSeen,
      now,
      id
    ]
  );
  return getMinerById(id);
}
async function deleteMiner(id) {
  await getDb();
  runExec("DELETE FROM miners WHERE id = ?", [id]);
  runExec("DELETE FROM minerStats WHERE minerId = ?", [id]);
  runExec("DELETE FROM alerts WHERE minerId = ?", [id]);
  runExec("DELETE FROM minerLogs WHERE minerId = ?", [id]);
}
async function getMinerStatsHistory(minerId, hours = 24) {
  await getDb();
  const cutoff = Date.now() - hours * 60 * 60 * 1e3;
  return runQuery(
    "SELECT * FROM minerStats WHERE minerId = ? AND recordedAt > ? ORDER BY recordedAt ASC",
    [minerId, cutoff]
  );
}
async function recordMinerStats(stats) {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerStats (minerId, hashrate, temperature, fanSpeed, power, voltage, frequency, sharesAccepted, sharesRejected, recordedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [stats.minerId, stats.hashrate, stats.temperature, stats.fanSpeed, stats.power, stats.voltage || null, stats.frequency || null, stats.sharesAccepted, stats.sharesRejected, now]
  );
}
async function getAlertsByUserId(userId, limit = 50) {
  await getDb();
  return runQuery("SELECT * FROM alerts WHERE userId = ? ORDER BY createdAt DESC LIMIT ?", [userId, limit]);
}
async function getUnreadAlerts(userId) {
  await getDb();
  return runQuery("SELECT * FROM alerts WHERE userId = ? AND isRead = 0 ORDER BY createdAt DESC", [userId]);
}
async function getUnreadAlertsCount(userId) {
  await getDb();
  const result = runQuery("SELECT COUNT(*) as count FROM alerts WHERE userId = ? AND isRead = 0", [userId]);
  return result.length > 0 ? result[0].count : 0;
}
async function createAlert(alert) {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO alerts (userId, minerId, alertType, severity, title, message, isRead, isAcknowledged, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)",
    [
      alert.userId,
      alert.minerId || null,
      alert.alertType,
      alert.severity || "warning",
      alert.title,
      alert.message || null,
      alert.metadata ? JSON.stringify(alert.metadata) : null,
      now
    ]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const alerts = runQuery("SELECT * FROM alerts WHERE id = ?", [id]);
  return alerts[0];
}
async function markAlertAsRead(id) {
  await getDb();
  runExec("UPDATE alerts SET isRead = 1 WHERE id = ?", [id]);
}
async function acknowledgeAlert(id) {
  await getDb();
  const now = Date.now();
  runExec("UPDATE alerts SET isAcknowledged = 1, acknowledgedAt = ? WHERE id = ?", [now, id]);
}
async function markAllAlertsAsRead(userId) {
  await getDb();
  runExec("UPDATE alerts SET isRead = 1 WHERE userId = ?", [userId]);
}
async function deleteAlert(id) {
  await getDb();
  runExec("DELETE FROM alerts WHERE id = ?", [id]);
}
async function getUserSettings(userId) {
  await getDb();
  const results = runQuery("SELECT * FROM userSettings WHERE userId = ?", [userId]);
  if (results.length === 0) {
    const now = Date.now();
    runExec(
      `INSERT INTO userSettings (
        userId, tempWarningThreshold, tempCriticalThreshold, hashrateDropThreshold, offlineAlertDelay,
        fanWarningBelowRpm, fanCriticalBelowRpm,
        pushNotifications, emailNotifications, blockFoundNotifications,
        hashrateUnit, temperatureUnit, refreshInterval,
        autoScanEnabled, autoScanInterval, scanSubnet, poolProfilesJson,
        createdAt, updatedAt
      )
       VALUES (?, 70, 80, 20, 300, 1000, 500, 1, 0, 1, 'TH/s', 'C', 3, 0, 3600, '192.168.1.0/24', '{}', ?, ?)`,
      [userId, now, now]
    );
    return getUserSettings(userId);
  }
  return results[0];
}
async function upsertUserSettings(userId, settings) {
  await getDb();
  const existing = await getUserSettings(userId);
  if (!existing) return null;
  const now = Date.now();
  runExec(
    `UPDATE userSettings SET 
      tempWarningThreshold = ?, tempCriticalThreshold = ?, hashrateDropThreshold = ?,
      offlineAlertDelay = ?, fanWarningBelowRpm = ?, fanCriticalBelowRpm = ?,
      pushNotifications = ?, emailNotifications = ?,
      blockFoundNotifications = ?, hashrateUnit = ?, temperatureUnit = ?,
      refreshInterval = ?, autoScanEnabled = ?, autoScanInterval = ?,
      scanSubnet = ?, poolProfilesJson = ?, updatedAt = ?
     WHERE userId = ?`,
    [
      settings.tempWarningThreshold ?? existing.tempWarningThreshold,
      settings.tempCriticalThreshold ?? existing.tempCriticalThreshold,
      settings.hashrateDropThreshold ?? existing.hashrateDropThreshold,
      settings.offlineAlertDelay ?? existing.offlineAlertDelay,
      settings.fanWarningBelowRpm ?? existing.fanWarningBelowRpm,
      settings.fanCriticalBelowRpm ?? existing.fanCriticalBelowRpm,
      settings.pushNotifications !== void 0 ? settings.pushNotifications ? 1 : 0 : existing.pushNotifications,
      settings.emailNotifications !== void 0 ? settings.emailNotifications ? 1 : 0 : existing.emailNotifications,
      settings.blockFoundNotifications !== void 0 ? settings.blockFoundNotifications ? 1 : 0 : existing.blockFoundNotifications,
      settings.hashrateUnit ?? existing.hashrateUnit,
      settings.temperatureUnit ?? existing.temperatureUnit,
      settings.refreshInterval ?? existing.refreshInterval,
      settings.autoScanEnabled !== void 0 ? settings.autoScanEnabled ? 1 : 0 : existing.autoScanEnabled,
      settings.autoScanInterval ?? existing.autoScanInterval,
      settings.scanSubnet ?? existing.scanSubnet,
      settings.poolProfilesJson ?? existing.poolProfilesJson ?? "{}",
      now,
      userId
    ]
  );
  return getUserSettings(userId);
}
async function getRecentSoloBlocks(limit = 20) {
  await getDb();
  return runQuery("SELECT * FROM soloBlocks ORDER BY timestamp DESC LIMIT ?", [limit]);
}
async function addSoloBlock(block) {
  await getDb();
  const now = Date.now();
  runExec(
    `INSERT INTO soloBlocks (blockHeight, blockHash, poolName, poolUrl, minerAddress, reward, difficulty, localMinerId, localMinerName, isLocalFind, timestamp, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      block.blockHeight,
      block.blockHash,
      block.poolName,
      block.poolUrl || null,
      block.minerAddress || null,
      block.reward,
      block.difficulty || null,
      block.localMinerId || null,
      block.localMinerName || null,
      block.isLocalFind ? 1 : 0,
      block.timestamp.getTime(),
      now
    ]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const blocks = runQuery("SELECT * FROM soloBlocks WHERE id = ?", [id]);
  return blocks[0];
}
async function getDashboardStats(userId) {
  await getDb();
  const miners = runQuery("SELECT * FROM miners WHERE userId = ?", [userId]);
  const unreadCount = await getUnreadAlertsCount(userId);
  const onlineMiners = miners.filter((m) => m.status === "online");
  const offlineMiners = miners.filter((m) => m.status === "offline");
  const warningMiners = miners.filter((m) => m.status === "warning" || m.status === "error");
  const totalHashrate = miners.reduce((sum, m) => sum + (m.hashrate || 0), 0);
  const avgTemperature = miners.length > 0 ? miners.reduce((sum, m) => sum + (m.temperature || 0), 0) / miners.length : 0;
  const totalPower = miners.reduce((sum, m) => sum + (m.power || 0), 0);
  const totalSharesAccepted = miners.reduce((sum, m) => sum + (m.sharesAccepted || 0), 0);
  const totalSharesRejected = miners.reduce((sum, m) => sum + (m.sharesRejected || 0), 0);
  return {
    totalMiners: miners.length,
    onlineMiners: onlineMiners.length,
    offlineMiners: offlineMiners.length,
    warningMiners: warningMiners.length,
    totalHashrate,
    avgTemperature,
    totalPower,
    totalSharesAccepted,
    totalSharesRejected,
    unreadAlerts: unreadCount
  };
}
async function getMinerGroupsByUserId(userId) {
  await getDb();
  return runQuery("SELECT * FROM minerGroups WHERE userId = ? ORDER BY name", [userId]);
}
async function createMinerGroup(group) {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerGroups (userId, name, description, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [group.userId, group.name, group.description || null, group.color || "#00ff00", now, now]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const groups = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  return groups[0];
}
async function updateMinerGroup(id, updates) {
  await getDb();
  const now = Date.now();
  const group = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  if (group.length === 0) return void 0;
  const existing = group[0];
  runExec(
    "UPDATE minerGroups SET name = ?, description = ?, color = ?, updatedAt = ? WHERE id = ?",
    [
      updates.name ?? existing.name,
      updates.description ?? existing.description,
      updates.color ?? existing.color,
      now,
      id
    ]
  );
  const updated = runQuery("SELECT * FROM minerGroups WHERE id = ?", [id]);
  return updated[0];
}
async function deleteMinerGroup(id) {
  await getDb();
  runExec("DELETE FROM minerGroups WHERE id = ?", [id]);
}
async function getMinerLogs(minerId, limit = 100) {
  await getDb();
  return runQuery("SELECT * FROM minerLogs WHERE minerId = ? ORDER BY createdAt DESC LIMIT ?", [minerId, limit]);
}
async function addMinerLog(log) {
  await getDb();
  const now = Date.now();
  runExec(
    "INSERT INTO minerLogs (minerId, logLevel, source, message, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    [log.minerId, log.logLevel, log.source, log.message, log.metadata ? JSON.stringify(log.metadata) : null, now]
  );
  const result = runQuery("SELECT last_insert_rowid() as id");
  const id = result.length > 0 ? result[0].id : 0;
  const logs = runQuery("SELECT * FROM minerLogs WHERE id = ?", [id]);
  return logs[0];
}
async function clearMinerLogs(minerId) {
  await getDb();
  runExec("DELETE FROM minerLogs WHERE minerId = ?", [minerId]);
}
async function getAppSettings() {
  await getDb();
  const results = runQuery("SELECT * FROM appSettings LIMIT 1");
  if (results.length === 0) {
    const now = Date.now();
    runExec(
      "INSERT INTO appSettings (username, passwordHash, appName, theme, language, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [DEFAULT_USERNAME, null, "BlackAxe", "dark", "en", now, now]
    );
    return {
      id: 1,
      username: DEFAULT_USERNAME,
      passwordHash: null,
      appName: "BlackAxe",
      theme: "dark",
      language: "en",
      createdAt: now,
      updatedAt: now
    };
  }
  return results[0];
}
async function verifyAppPassword(password) {
  const settings = await getAppSettings();
  if (!settings?.passwordHash) {
    return password === DEFAULT_PASSWORD;
  }
  try {
    return await bcrypt.compare(password, settings.passwordHash);
  } catch (error) {
    console.error("[Database] Password verification error:", error);
    return false;
  }
}
async function createOrUpdateAppSettings(settings) {
  await getDb();
  const existing = await getAppSettings();
  if (!existing) return;
  const now = Date.now();
  runExec(
    "UPDATE appSettings SET username = ?, appName = ?, theme = ?, language = ?, updatedAt = ? WHERE id = 1",
    [
      settings.username ?? existing.username,
      settings.appName ?? existing.appName,
      settings.theme ?? existing.theme,
      settings.language ?? existing.language,
      now
    ]
  );
}
async function updateAppCredentials(username, newPassword) {
  await getDb();
  const now = Date.now();
  if (newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    runExec("UPDATE appSettings SET username = ?, passwordHash = ?, updatedAt = ? WHERE id = 1", [username, passwordHash, now]);
  } else {
    runExec("UPDATE appSettings SET username = ?, updatedAt = ? WHERE id = 1", [username, now]);
  }
}
async function initializeDatabase() {
  const db = await getDb();
  if (!db) {
    console.error("[Database] Failed to initialize database");
    return;
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openId TEXT NOT NULL UNIQUE,
      name TEXT,
      email TEXT,
      loginMethod TEXT,
      role TEXT DEFAULT 'user' NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      lastSignedIn INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS miners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      apiPort INTEGER DEFAULT 4028,
      macAddress TEXT,
      minerType TEXT DEFAULT 'other' NOT NULL,
      model TEXT,
      firmware TEXT,
      status TEXT DEFAULT 'unknown' NOT NULL,
      hashrate REAL DEFAULT 0,
      hashrateUnit TEXT DEFAULT 'TH/s',
      temperature REAL,
      maxTemperature REAL,
      fanSpeed INTEGER,
      power REAL,
      voltage REAL,
      frequency INTEGER,
      poolUrl TEXT,
      poolPort INTEGER,
      poolUser TEXT,
      poolPassword TEXT,
      poolUrl2 TEXT,
      poolPort2 INTEGER,
      poolUser2 TEXT,
      poolPassword2 TEXT,
      poolUrl3 TEXT,
      poolPort3 INTEGER,
      poolUser3 TEXT,
      poolPassword3 TEXT,
      poolStatus TEXT,
      poolLastCheckedAt INTEGER,
      poolError TEXT,
      poolVerify TEXT,
      poolVerifyLastCheckedAt INTEGER,
      sharesAccepted INTEGER DEFAULT 0,
      sharesRejected INTEGER DEFAULT 0,
      bestDifficulty TEXT,
      bestDifficultyAllTime TEXT,
      bestDifficultyPrevSession TEXT,
      uptimeSeconds INTEGER DEFAULT 0,
      tags TEXT,
      lastSeen INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  try {
    db.run(`ALTER TABLE miners ADD COLUMN bestDifficultyAllTime TEXT`);
  } catch (e) {
  }
  try {
    db.run(`ALTER TABLE miners ADD COLUMN bestDifficultyPrevSession TEXT`);
  } catch (e) {
  }
  const alterMinerColumns = [
    `ALTER TABLE miners ADD COLUMN poolPort INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUrl2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPort2 INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUser2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPassword2 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolUrl3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPort3 INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolUser3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolPassword3 TEXT`,
    `ALTER TABLE miners ADD COLUMN poolStatus TEXT`,
    `ALTER TABLE miners ADD COLUMN poolLastCheckedAt INTEGER`,
    `ALTER TABLE miners ADD COLUMN poolError TEXT`,
    `ALTER TABLE miners ADD COLUMN poolVerify TEXT`,
    `ALTER TABLE miners ADD COLUMN poolVerifyLastCheckedAt INTEGER`
  ];
  for (const sql of alterMinerColumns) {
    try {
      db.run(sql);
    } catch {
    }
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS minerStats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minerId INTEGER NOT NULL,
      hashrate REAL,
      temperature REAL,
      fanSpeed INTEGER,
      power REAL,
      voltage REAL,
      frequency INTEGER,
      sharesAccepted INTEGER,
      sharesRejected INTEGER,
      uptime INTEGER,
      efficiency REAL,
      recordedAt INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      minerId INTEGER,
      alertType TEXT NOT NULL,
      severity TEXT DEFAULT 'warning' NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      isAcknowledged INTEGER DEFAULT 0,
      acknowledgedAt INTEGER,
      metadata TEXT,
      createdAt INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS appSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT DEFAULT 'blackaxe',
      passwordHash TEXT,
      appName TEXT DEFAULT 'BlackAxe',
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'en',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS userSettings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL UNIQUE,
      tempWarningThreshold INTEGER DEFAULT 70,
      tempCriticalThreshold INTEGER DEFAULT 80,
      hashrateDropThreshold INTEGER DEFAULT 20,
      offlineAlertDelay INTEGER DEFAULT 300,
      fanWarningBelowRpm INTEGER DEFAULT 1000,
      fanCriticalBelowRpm INTEGER DEFAULT 500,
      pushNotifications INTEGER DEFAULT 1,
      emailNotifications INTEGER DEFAULT 0,
      blockFoundNotifications INTEGER DEFAULT 1,
      hashrateUnit TEXT DEFAULT 'TH/s',
      temperatureUnit TEXT DEFAULT 'C',
      refreshInterval INTEGER DEFAULT 3,
      autoScanEnabled INTEGER DEFAULT 0,
      autoScanInterval INTEGER DEFAULT 3600,
      scanSubnet TEXT DEFAULT '192.168.1.0/24',
      poolProfilesJson TEXT DEFAULT '{}',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  const alterSettingsColumns = [
    `ALTER TABLE userSettings ADD COLUMN fanWarningBelowRpm INTEGER DEFAULT 1000`,
    `ALTER TABLE userSettings ADD COLUMN fanCriticalBelowRpm INTEGER DEFAULT 500`,
    `ALTER TABLE userSettings ADD COLUMN poolProfilesJson TEXT DEFAULT '{}'`
  ];
  for (const sql of alterSettingsColumns) {
    try {
      db.run(sql);
    } catch {
    }
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS soloBlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blockHeight INTEGER NOT NULL,
      blockHash TEXT,
      poolName TEXT NOT NULL,
      poolUrl TEXT,
      minerAddress TEXT,
      reward REAL,
      difficulty TEXT,
      localMinerId INTEGER,
      localMinerName TEXT,
      isLocalFind INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      createdAt INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS minerGroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#00ff00',
      icon TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS minerLogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minerId INTEGER NOT NULL,
      logLevel TEXT NOT NULL,
      source TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      createdAt INTEGER NOT NULL
    )
  `);
  saveDatabase();
  console.log("[Database] SQLite initialized successfully");
}
var SALT_ROUNDS, DEFAULT_USERNAME, DEFAULT_PASSWORD, _db, _dbPath, _saveInterval, _dbInitialized;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    SALT_ROUNDS = 12;
    DEFAULT_USERNAME = "blackaxe";
    DEFAULT_PASSWORD = "blackaxe";
    _db = null;
    _dbPath = "";
    _saveInterval = null;
    _dbInitialized = false;
  }
});

// server/macLookup.ts
import { execFile } from "child_process";
import { promisify as promisify2 } from "util";
function parseMacFromText(text) {
  const t2 = String(text || "");
  const m1 = t2.match(/\blladdr\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})\b/i);
  if (m1) return m1[1].toLowerCase();
  const m2 = t2.match(/\bat\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})\b/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}
async function lookupMacAddress(ip) {
  try {
    const r = await execFileAsync("ip", ["neigh", "show", ip], { timeout: 800 });
    const mac = parseMacFromText(r.stdout || "");
    if (mac) return mac;
  } catch {
  }
  try {
    const r = await execFileAsync("arp", ["-n", ip], { timeout: 800 });
    const mac = parseMacFromText(r.stdout || "");
    if (mac) return mac;
  } catch {
  }
  return null;
}
var execFileAsync;
var init_macLookup = __esm({
  "server/macLookup.ts"() {
    "use strict";
    execFileAsync = promisify2(execFile);
  }
});

// server/minerPolling.ts
var minerPolling_exports = {};
__export(minerPolling_exports, {
  fetchBitaxeData: () => fetchBitaxeData,
  fetchCGMinerData: () => fetchCGMinerData,
  pollAllMiners: () => pollAllMiners,
  pollMiner: () => pollMiner,
  startPollingService: () => startPollingService,
  stopPollingService: () => stopPollingService
});
import * as net2 from "net";
import { exec as exec2 } from "child_process";
import { promisify as promisify3 } from "util";
import { lookup } from "dns/promises";
function canEmitAlert(key, windowMs) {
  const now = Date.now();
  const last = alertCooldown.get(key) || 0;
  if (now - last < windowMs) return false;
  alertCooldown.set(key, now);
  return true;
}
async function fetchBitaxeData(ip, port = 80) {
  const baseUrl = `http://${ip}:${port}`;
  const infoPaths = ["/api/system/info", "/api/info"];
  let info = null;
  for (const path3 of infoPaths) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5e3);
      const respInfo = await fetch(`${baseUrl}${path3}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      clearTimeout(timeoutId);
      if (respInfo.ok) {
        info = await respInfo.json();
        if (info && (info.ASICModel != null || info.hashRate != null || info.hostname != null)) break;
      }
    } catch {
    }
  }
  if (!info) return null;
  try {
    try {
      const endpoints = ["/api/system", "/api/system/config", "/api/system/settings", "/api/system/stratum"];
      for (const ep of endpoints) {
        try {
          const controller2 = new AbortController();
          const t2 = setTimeout(() => controller2.abort(), 2500);
          const respCfg = await fetch(`${baseUrl}${ep}`, {
            signal: controller2.signal,
            headers: { Accept: "application/json" }
          });
          clearTimeout(t2);
          if (!respCfg.ok) continue;
          const cfg = await respCfg.json();
          for (const k of ["stratumURL", "stratumUser", "stratumPort"]) {
            if (cfg?.[k] != null && info?.[k] == null) info[k] = cfg[k];
          }
          if (cfg?.stratum_url && info?.stratumURL == null) info.stratumURL = cfg.stratum_url;
          if (cfg?.stratum_user && info?.stratumUser == null) info.stratumUser = cfg.stratum_user;
          if (cfg?.stratum_port && info?.stratumPort == null) info.stratumPort = cfg.stratum_port;
          if (info?.stratumURL != null && (info?.stratumPort != null || /:\d+/.test(String(info?.stratumURL)))) {
            break;
          }
        } catch {
        }
      }
    } catch {
    }
    return info;
  } catch {
    return null;
  }
}
async function fetchCGMinerData(ip, port = 4028) {
  let summaryResp = await cgminerCommand(ip, "summary", port);
  if (!summaryResp && port === 4028) {
    summaryResp = await cgminerCommand(ip, "summary", 4029);
    if (summaryResp) port = 4029;
  }
  if (!summaryResp) {
    return null;
  }
  const summary = parseCGMinerAny(summaryResp);
  const poolsResp = await cgminerCommand(ip, "pools", port);
  const pools = poolsResp ? parseCGMinerPools(poolsResp) : null;
  const versionResp = await cgminerCommand(ip, "version", port);
  const rawVersion = versionResp?.raw;
  const versionJson = versionResp?.json;
  const statsResp = await cgminerCommand(ip, "stats", port);
  const statsJson = statsResp?.json;
  return { summary, pools, rawVersion, versionJson, statsJson };
}
function parseCGMinerResponse(response) {
  if (!response || response.length === 0) return null;
  try {
    const result = {};
    const parts = response.split("|");
    for (const part of parts) {
      const pairs = part.split(",");
      for (const pair of pairs) {
        const [key, value] = pair.split("=");
        if (!key || !value) continue;
        const cleanKey = key.trim().replace(/\s+/g, "_");
        const cleanValue = value.trim();
        switch (cleanKey) {
          case "Elapsed":
            result.Elapsed = parseInt(cleanValue, 10);
            break;
          case "MHS_av":
          case "MHS av":
            result.MHS_av = parseFloat(cleanValue);
            break;
          case "MHS_5s":
          case "MHS 5s":
            result.MHS_5s = parseFloat(cleanValue);
            break;
          case "MHS_1m":
          case "MHS 1m":
            result.MHS_1m = parseFloat(cleanValue);
            break;
          case "MHS_5m":
          case "MHS 5m":
            result.MHS_5m = parseFloat(cleanValue);
            break;
          case "MHS_15m":
          case "MHS 15m":
            result.MHS_15m = parseFloat(cleanValue);
            break;
          case "Accepted":
            result.Accepted = parseInt(cleanValue, 10);
            break;
          case "Rejected":
            result.Rejected = parseInt(cleanValue, 10);
            break;
          case "Hardware_Errors":
          case "Hardware Errors":
            result.Hardware_Errors = parseInt(cleanValue, 10);
            break;
          case "Best_Share":
          case "Best Share":
            result.Best_Share = parseFloat(cleanValue);
            break;
        }
      }
    }
    if (result.MHS_av || result.MHS_5m || result.Accepted !== void 0) {
      return result;
    }
    return null;
  } catch (e) {
    console.error("[CGMiner] Failed to parse response:", e);
    return null;
  }
}
function pickNumber(v) {
  if (v === null || v === void 0) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function parseCGMinerAny(resp) {
  if (resp.json) {
    const json = resp.json;
    const summary = json.SUMMARY && Array.isArray(json.SUMMARY) && json.SUMMARY[0] ? json.SUMMARY[0] : json.summary && Array.isArray(json.summary) && json.summary[0] ? json.summary[0] : null;
    if (!summary) {
      return parseCGMinerResponse(resp.raw);
    }
    const result = {};
    result.Elapsed = pickNumber(summary.Elapsed) ?? void 0;
    result.Accepted = pickNumber(summary.Accepted) ?? void 0;
    result.Rejected = pickNumber(summary.Rejected) ?? void 0;
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
    return result.MHS_av || result.MHS_5m || result.Accepted !== void 0 ? result : null;
  }
  return parseCGMinerResponse(resp.raw);
}
function parseCGMinerPools(resp) {
  const json = resp.json;
  if (json && json.POOLS && Array.isArray(json.POOLS)) {
    return json.POOLS;
  }
  if (!resp.raw) return null;
  const pools = [];
  const parts = resp.raw.split("|");
  for (const part of parts) {
    if (!part.startsWith("POOLS")) continue;
    const pairs = part.split(",");
    const pool = {};
    for (const pair of pairs) {
      const [k, v] = pair.split("=");
      if (!k || v === void 0) continue;
      pool[k.trim()] = v.trim();
    }
    pools.push(pool);
  }
  return pools.length ? pools : null;
}
async function fetchCGMinerEstats(ip, port = 4028) {
  let resp = await cgminerCommand(ip, "estats", port);
  if (!resp) {
    resp = await cgminerCommand(ip, "stats", port);
  }
  if (!resp) return null;
  let bestShareFromSummary = null;
  try {
    const summaryCmd = `echo '{"command":"summary"}' | timeout 3s nc -w 2 ${ip} ${port}`;
    const { stdout } = await execAsync2(summaryCmd, { timeout: 4e3, maxBuffer: 1024 * 1024 });
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
  }
  if (resp.json) {
    try {
      const dataList = resp.json.ESTATS || resp.json.STATS;
      const estats = Array.isArray(dataList) ? dataList[0] : dataList;
      if (!estats) return null;
      const out = {};
      const mmId0 = estats["MM ID0"] || estats["MM ID0:Summary"] || "";
      if (typeof mmId0 === "string" && mmId0.length > 0) {
        const tempMatch = mmId0.match(/\bTemp\[(\d+)\]/i) || mmId0.match(/\bTAvg\[(\d+)\]/i) || mmId0.match(/\bTMax\[(\d+)\]/i);
        if (tempMatch) {
          const t2 = parseInt(tempMatch[1], 10);
          if (!isNaN(t2) && t2 > 0) out.temperature = t2;
        }
        const fanMatch = mmId0.match(/\bFan1\[(\d+)\]/i) || mmId0.match(/\bFanR\[(\d+)%?\]/i);
        if (fanMatch) {
          const f = parseInt(fanMatch[1], 10);
          if (!isNaN(f) && f > 0) out.fanSpeed = f;
        }
        const psMatch = mmId0.match(/\bPS\[([^\]]+)\]/i);
        if (psMatch) {
          const psValues = psMatch[1].trim().split(/\s+/).map((v) => parseInt(v, 10));
          const isAvalonQ = psValues.length >= 6 && psValues[1] > 100;
          if (isAvalonQ && psValues.length >= 6 && !isNaN(psValues[5]) && psValues[5] > 0) {
            out.power = psValues[5];
          } else if (psValues.length >= 5 && !isNaN(psValues[4]) && psValues[4] > 0) {
            out.power = Math.round(psValues[4] / 10 * 100) / 100;
          }
        }
      }
      const tempDirect = estats.TAvg ?? estats.Temperature ?? estats.temp ?? estats.TMax ?? estats["Temp AVG"] ?? estats["Temp Max"] ?? estats.Temp0 ?? estats.Temp1;
      if (typeof tempDirect === "number" && tempDirect > 0 && !out.temperature) out.temperature = tempDirect;
      const fanDirect = estats.Fan1 ?? estats.Fan2 ?? estats.Fan_Speed ?? estats.FanSpeed ?? estats["Fan Speed"] ?? estats.fan ?? estats.fanspeed;
      if (typeof fanDirect === "number" && fanDirect > 0 && !out.fanSpeed) out.fanSpeed = fanDirect;
      const powerDirect = estats.Power ?? estats.power ?? estats["Power Usage"] ?? estats.TotalPower;
      if (typeof powerDirect === "number" && powerDirect > 0 && !out.power) {
        out.power = powerDirect;
      }
      if (bestShareFromSummary !== null && bestShareFromSummary > 0) {
        out.bestShare = bestShareFromSummary;
      }
      return Object.keys(out).length ? out : null;
    } catch (err) {
      console.error("[fetchCGMinerEstats] JSON parsing error:", err);
    }
  }
  const data = resp.raw || "";
  const result = {};
  const tempPatterns = [
    /TAvg[=:]\s*(\d+)/i,
    /TMax[=:]\s*(\d+)/i,
    /Temperature[=:]\s*(\d+)/i,
    /Temp\s*AVG[=:]\s*(\d+)/i,
    /Temp[=:]\s*(\d+)/i
  ];
  for (const pattern of tempPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.temperature = parseInt(match[1], 10);
      break;
    }
  }
  const fanPatterns = [
    /Fan1[=:]\s*(\d+)/i,
    /Fan2[=:]\s*(\d+)/i,
    /Fan\s*Speed[=:]\s*(\d+)/i,
    /FanSpeed[=:]\s*(\d+)/i
  ];
  for (const pattern of fanPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.fanSpeed = parseInt(match[1], 10);
      break;
    }
  }
  const powerPatterns = [
    /Power[=:]\s*(\d+)/i,
    /PS\[\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/,
    /Total\s*Power[=:]\s*(\d+)/i
  ];
  for (const pattern of powerPatterns) {
    const match = data.match(pattern);
    if (match) {
      result.power = parseInt(match[1], 10);
      break;
    }
  }
  if (bestShareFromDevs !== null && bestShareFromDevs > 0) {
    result.bestShare = bestShareFromDevs;
  }
  return Object.keys(result).length > 0 ? result : null;
}
function formatBestDifficulty(diff) {
  if (diff === null || diff === void 0) return null;
  if (typeof diff === "string" && /[KMGTP]$/i.test(diff)) {
    return diff;
  }
  const num = typeof diff === "string" ? parseFloat(diff) : diff;
  if (isNaN(num) || num === 0) return null;
  if (num >= 1e15) return `${(num / 1e15).toFixed(2)}P`;
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}G`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(0)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(0);
}
function parseBitaxeData(data) {
  let hashrate = data.hashRate || 0;
  let hashrateUnit = "GH/s";
  const inferredPortFromUrl = (() => {
    const u = data.stratumURL;
    if (!u) return null;
    const cleaned = u.replace(/^stratum\+tcp:\/\//i, "").replace(/^stratum\+ssl:\/\//i, "").replace(/^stratum:\/\//i, "").replace(/^tcp:\/\//i, "").replace(/^ssl:\/\//i, "").trim();
    const hostPort = cleaned.split("/")[0] || "";
    const parts = hostPort.split(":");
    if (parts.length < 2) return null;
    const n = parseInt(parts[1], 10);
    return Number.isFinite(n) ? n : null;
  })();
  const poolPort = (typeof data.stratumPort === "number" ? data.stratumPort : null) ?? inferredPortFromUrl;
  return {
    status: hashrate > 0 ? "online" : "offline",
    hashrate,
    // Keep in GH/s for consistency
    hashrateUnit,
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
      if (data.deviceModel && data.deviceModel !== "None" && data.deviceModel !== "null") {
        return data.deviceModel;
      }
      if (data.ASICModel) {
        const asic = data.ASICModel.toUpperCase();
        if (asic === "BM1366") return "Bitaxe Ultra";
        if (asic === "BM1368") return "Bitaxe Supra";
        if (asic === "BM1370") return "Bitaxe Gamma";
        if (asic === "BM1397") return "Bitaxe";
      }
      if (data.hostname) {
        const h = data.hostname.toLowerCase();
        if (h.includes("nerd") || h.includes("qaxe")) return "NerdQAxe";
        if (h.includes("ultra")) return "Bitaxe Ultra";
        if (h.includes("supra")) return "Bitaxe Supra";
        if (h.includes("gamma")) return "Bitaxe Gamma";
        if (h.includes("bitaxe")) return "Bitaxe";
      }
      return data.ASICModel || null;
    })(),
    firmware: data.version || null
  };
}
function parseCGMinerData(data, extras, pools, rawVersion, statsJson, versionJson) {
  const mhs = data.MHS_5m || data.MHS_1m || data.MHS_av || 0;
  const hashrate = mhs / 1e3;
  const identity = inferMinerIdentity(versionJson || rawVersion || "", statsJson);
  let model = identity.model;
  let firmware = rawVersion || null;
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
  const poolUrl = pool1?.URL || pool1?.Url || pool1?.url || null;
  const poolUser = pool1?.User || pool1?.user || null;
  const poolUrl2 = pool2?.URL || pool2?.Url || pool2?.url || null;
  const poolUser2 = pool2?.User || pool2?.user || null;
  const poolUrl3 = pool3?.URL || pool3?.Url || pool3?.url || null;
  const poolUser3 = pool3?.User || pool3?.user || null;
  const extractPort = (pool, url) => {
    const portFromPool = pickNumber(pool?.Port ?? pool?.PORT ?? pool?.port ?? pool?.Stratum_Port ?? pool?.StratumPort ?? pool?.["Stratum Port"]);
    if (portFromPool) return portFromPool;
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
    hashrate,
    // In GH/s for consistency
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
    poolPort3
  };
}
function stripPoolPrefix(url) {
  return url.replace(/^stratum\+tcp:\/\//i, "").replace(/^stratum\+ssl:\/\//i, "").replace(/^stratum:\/\//i, "").replace(/^tcp:\/\//i, "").replace(/^ssl:\/\//i, "").trim();
}
function splitPoolUrlAndPort(url, port) {
  if (!url) return { poolUrl: null, poolPort: port ?? null, host: null };
  const cleaned = stripPoolPrefix(url);
  const hostPort = cleaned.split("/")[0];
  if (!hostPort) return { poolUrl: url, poolPort: port ?? null, host: null };
  const [host, p] = hostPort.split(":");
  const inferredPort = p ? parseInt(p, 10) : null;
  const finalPort = port ?? (Number.isFinite(inferredPort) ? inferredPort : null);
  return { poolUrl: url, poolPort: finalPort, host: host || null };
}
async function tcpCheck(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = new net2.Socket();
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
      }
      resolve(err ?? null);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(null));
    socket.on("timeout", () => finish("Timeout"));
    socket.on("error", (e) => finish(e?.message || "TCP error"));
    socket.connect(port, host);
  });
}
function isPrivateIp(ip) {
  return ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) || ip === "127.0.0.1" || ip === "::1";
}
async function validatePoolEndpoint(url, port) {
  if (!url) return { status: "unknown", error: "Missing pool URL" };
  const { host, poolPort } = splitPoolUrlAndPort(url, port);
  if (!host) return { status: "invalid", error: "Invalid pool host" };
  if (!poolPort || poolPort <= 0) return { status: "unknown", error: "Missing pool port" };
  const finalPort = poolPort;
  try {
    const r = await lookup(host);
    if (r?.address && isPrivateIp(r.address)) {
      const tcpErr2 = await tcpCheck(host, finalPort);
      if (tcpErr2) return { status: "invalid", error: tcpErr2 };
      return { status: "internal", error: `Internal pool (${r.address})` };
    }
    const tcpErr = await tcpCheck(host, finalPort);
    if (tcpErr) return { status: "invalid", error: tcpErr };
    return { status: "valid" };
  } catch (e) {
    return { status: "invalid", error: e?.message || "DNS lookup failed" };
  }
}
function isProbablyBitcoinAddress(s) {
  if (!s) return false;
  const t2 = s.trim();
  return /^bc1[0-9ac-hj-np-z]{11,71}$/i.test(t2) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(t2);
}
async function pollMiner(miner) {
  const getApiPort = () => {
    if (miner.apiPort) return miner.apiPort;
    if (miner.minerType === "bitaxe" || miner.minerType === "nerdqaxe") return 80;
    if (miner.minerType === "avalon" || miner.minerType === "antminer" || miner.minerType === "whatsminer" || miner.minerType === "canaan") return 4028;
    return 80;
  };
  const port = getApiPort();
  const current = await getMinerById(miner.id);
  try {
    let minerData = null;
    let detectedType = miner.minerType;
    if (miner.minerType === "bitaxe" || miner.minerType === "nerdqaxe") {
      const bitaxeData = await fetchBitaxeData(miner.ipAddress, port);
      if (bitaxeData) {
        minerData = parseBitaxeData(bitaxeData);
        if (bitaxeData.deviceModel) {
          const dm = bitaxeData.deviceModel.toLowerCase();
          if (dm.includes("nerd") || dm.includes("qaxe")) detectedType = "nerdqaxe";
          else if (dm.includes("bitaxe") || dm.includes("ultra") || dm.includes("supra") || dm.includes("gamma")) detectedType = "bitaxe";
        } else if (bitaxeData.hostname) {
          const h = bitaxeData.hostname.toLowerCase();
          if (h.includes("nerd") || h.includes("qaxe")) detectedType = "nerdqaxe";
          else if (h.includes("bitaxe") || h.includes("ultra") || h.includes("supra") || h.includes("gamma")) detectedType = "bitaxe";
        } else if (bitaxeData.ASICModel) {
          const asic = bitaxeData.ASICModel.toLowerCase();
          if (asic.includes("nerd") || asic.includes("qaxe")) detectedType = "nerdqaxe";
          else if (asic.includes("bitaxe") || asic.includes("ultra") || asic.includes("supra") || asic.includes("gamma")) detectedType = "bitaxe";
        }
      }
    }
    if (!minerData && (miner.minerType === "avalon" || miner.minerType === "antminer" || miner.minerType === "whatsminer" || miner.minerType === "canaan")) {
      const cg = await fetchCGMinerData(miner.ipAddress, port);
      if (cg?.summary) {
        const extras = await fetchCGMinerEstats(miner.ipAddress, port);
        minerData = parseCGMinerData(cg.summary, extras || void 0, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
        const mdl = (minerData.model || "").toLowerCase();
        if (mdl.includes("antminer")) detectedType = "antminer";
        else if (mdl.includes("whatsminer")) detectedType = "whatsminer";
        else if (mdl.includes("canaan")) detectedType = "canaan";
        else if (mdl.includes("avalon")) detectedType = "avalon";
        else detectedType = "other";
      }
      if (!minerData) {
        const bitaxeData = await fetchBitaxeData(miner.ipAddress, 80);
        if (bitaxeData) {
          minerData = parseBitaxeData(bitaxeData);
          if (bitaxeData.deviceModel) {
            const dm = bitaxeData.deviceModel.toLowerCase();
            if (dm.includes("nerd") || dm.includes("qaxe")) detectedType = "nerdqaxe";
            else if (dm.includes("bitaxe") || dm.includes("ultra") || dm.includes("supra") || dm.includes("gamma")) detectedType = "bitaxe";
          } else if (bitaxeData.hostname) {
            const h = bitaxeData.hostname.toLowerCase();
            if (h.includes("nerd") || h.includes("qaxe")) detectedType = "nerdqaxe";
            else if (h.includes("bitaxe") || h.includes("ultra") || h.includes("supra") || h.includes("gamma")) detectedType = "bitaxe";
          } else if (bitaxeData.ASICModel) {
            const asic = bitaxeData.ASICModel.toLowerCase();
            if (asic.includes("nerd") || asic.includes("qaxe")) detectedType = "nerdqaxe";
            else if (asic.includes("bitaxe") || asic.includes("ultra") || asic.includes("supra") || asic.includes("gamma")) detectedType = "bitaxe";
          }
        }
      }
    }
    if (!minerData && miner.minerType === "other") {
      const bitaxeData = await fetchBitaxeData(miner.ipAddress, 80);
      if (bitaxeData) {
        minerData = parseBitaxeData(bitaxeData);
        if (bitaxeData.deviceModel) {
          const dm = bitaxeData.deviceModel.toLowerCase();
          if (dm.includes("nerd") || dm.includes("qaxe")) detectedType = "nerdqaxe";
          else if (dm.includes("bitaxe") || dm.includes("ultra") || dm.includes("supra") || dm.includes("gamma")) detectedType = "bitaxe";
        } else if (bitaxeData.hostname) {
          const h = bitaxeData.hostname.toLowerCase();
          if (h.includes("nerd") || h.includes("qaxe")) detectedType = "nerdqaxe";
          else if (h.includes("bitaxe") || h.includes("ultra") || h.includes("supra") || h.includes("gamma")) detectedType = "bitaxe";
        } else if (bitaxeData.ASICModel) {
          const asic = bitaxeData.ASICModel.toLowerCase();
          if (asic.includes("nerd") || asic.includes("qaxe")) detectedType = "nerdqaxe";
          else if (asic.includes("bitaxe") || asic.includes("ultra") || asic.includes("supra") || asic.includes("gamma")) detectedType = "bitaxe";
        }
      }
      if (!minerData) {
        const cg = await fetchCGMinerData(miner.ipAddress, 4028);
        if (cg?.summary) {
          const extras = await fetchCGMinerEstats(miner.ipAddress, 4028);
          minerData = parseCGMinerData(cg.summary, extras || void 0, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
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
          minerData = parseCGMinerData(cg.summary, extras || void 0, cg.pools, cg.rawVersion, cg.statsJson, cg.versionJson);
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
      const currentMac = current?.macAddress;
      let macToStore = currentMac || null;
      if (!macToStore) {
        macToStore = await lookupMacAddress(miner.ipAddress);
      }
      const p1 = splitPoolUrlAndPort(minerData.poolUrl ?? current?.poolUrl ?? null, minerData.poolPort ?? current?.poolPort ?? null);
      const p2 = splitPoolUrlAndPort(minerData.poolUrl2 ?? current?.poolUrl2 ?? null, minerData.poolPort2 ?? current?.poolPort2 ?? null);
      const p3 = splitPoolUrlAndPort(minerData.poolUrl3 ?? current?.poolUrl3 ?? null, minerData.poolPort3 ?? current?.poolPort3 ?? null);
      const updateData = {
        ...macToStore ? { macAddress: macToStore } : {},
        minerType: detectedType,
        model: minerData.model || void 0,
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
        uptimeSeconds: minerData.uptimeSeconds || void 0,
        poolUrl: p1.poolUrl ?? void 0,
        poolPort: p1.poolPort ?? void 0,
        poolUser: minerData.poolUser ?? void 0,
        firmware: minerData.firmware || void 0,
        poolUrl2: p2.poolUrl ?? void 0,
        poolPort2: p2.poolPort ?? void 0,
        poolUser2: minerData.poolUser2 ?? void 0,
        poolUrl3: p3.poolUrl ?? void 0,
        poolPort3: p3.poolPort ?? void 0,
        poolUser3: minerData.poolUser3 ?? void 0,
        lastSeen: Date.now()
      };
      const nowMs = Date.now();
      const lastChecked = current?.poolLastCheckedAt;
      const shouldCheckPools = !lastChecked || nowMs - lastChecked > 60 * 60 * 1e3;
      if (shouldCheckPools) {
        const prevStatus = (() => {
          try {
            return JSON.parse(current?.poolStatus || "{}");
          } catch {
            return {};
          }
        })();
        const prevError = (() => {
          try {
            return JSON.parse(current?.poolError || "{}");
          } catch {
            return {};
          }
        })();
        const r1 = await validatePoolEndpoint(p1.poolUrl, p1.poolPort);
        const r2 = await validatePoolEndpoint(p2.poolUrl, p2.poolPort);
        const r3 = await validatePoolEndpoint(p3.poolUrl, p3.poolPort);
        const status = { "1": r1.status, "2": r2.status, "3": r3.status };
        const errors = {};
        if (r1.error) errors["1"] = r1.error;
        if (r2.error) errors["2"] = r2.error;
        if (r3.error) errors["3"] = r3.error;
        updateData.poolStatus = JSON.stringify(status);
        updateData.poolError = JSON.stringify(errors);
        updateData.poolLastCheckedAt = nowMs;
        const lastVerify = current?.poolVerifyLastCheckedAt;
        const shouldDeepVerify = !lastVerify || nowMs - lastVerify > 60 * 60 * 1e3;
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
                password: minerData.poolPassword || "x",
                recipient,
                minShare: 0.98,
                timeoutS: 6
              });
              const prevVerify = (() => {
                try {
                  return JSON.parse(current?.poolVerify || "{}");
                } catch {
                  return {};
                }
              })();
              updateData.poolVerify = JSON.stringify({ ...typeof prevVerify === "object" && prevVerify ? prevVerify : {}, "1": res });
              updateData.poolVerifyLastCheckedAt = nowMs;
              if (res.ok && res.risk?.label === "HIGH" && canEmitAlert(`pool_scam:${miner.id}`, 60 * 60 * 1e3)) {
                await createAlert({
                  userId: miner.userId,
                  minerId: miner.id,
                  alertType: "pool_scam",
                  severity: "critical",
                  title: "Pool payout looks suspicious",
                  message: `Deep verification suggests this pool may not be paying the configured recipient for ${miner.name} (${miner.ipAddress}).`,
                  metadata: { pool: parsed.host, port: parsed.port, risk: res.risk, checks: res.checks }
                });
              }
            }
          } catch (e) {
          }
        }
        const changed = JSON.stringify(status) !== JSON.stringify(prevStatus) || JSON.stringify(errors) !== JSON.stringify(prevError);
        if (changed) {
          const invalidPools = Object.entries(status).filter(([, v]) => v === "invalid").map(([k]) => k);
          if (invalidPools.length && canEmitAlert(`pool_invalid:${miner.id}`, 30 * 60 * 1e3)) {
            await createAlert({
              userId: miner.userId,
              minerId: miner.id,
              alertType: "pool_invalid",
              severity: "critical",
              title: `Pool check failed (${invalidPools.join(",")})`,
              message: `One or more pools for ${miner.name} (${miner.ipAddress}) failed validation.`,
              metadata: { status, errors }
            });
          } else if (canEmitAlert(`pool_changed:${miner.id}`, 30 * 60 * 1e3)) {
            await createAlert({
              userId: miner.userId,
              minerId: miner.id,
              alertType: "pool_changed",
              severity: "warning",
              title: "Pool status changed",
              message: `Pool status updated for ${miner.name} (${miner.ipAddress}).`,
              metadata: { status, errors }
            });
          }
        }
        const primaryPoolHost = (() => {
          const u = (minerData.poolUrl || "").trim();
          if (!u) return null;
          const cleaned = u.replace(/^stratum\+tcp:\/\//i, "").replace(/^stratum\+ssl:\/\//i, "").replace(/^stratum:\/\//i, "").replace(/^tcp:\/\//i, "").replace(/^ssl:\/\//i, "").trim();
          const hostPort = (cleaned.split("/")[0] || cleaned).trim();
          if (hostPort.startsWith("[")) {
            const end = hostPort.indexOf("]");
            return end > 0 ? hostPort.slice(1, end) : hostPort;
          }
          return hostPort.split(":")[0];
        })();
        const isPrivateHost = (h) => {
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
        if (minerData.poolUser && !isProbablyBitcoinAddress(minerData.poolUser) && !isPrivateHost(primaryPoolHost) && canEmitAlert(`pool_user_invalid:${miner.id}`, 60 * 60 * 1e3)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "pool_user_invalid",
            severity: "warning",
            title: "Pool user is not a Bitcoin address",
            message: `Primary pool user for ${miner.name} (${miner.ipAddress}) is not a BTC address. This may be normal for account-based pools.`,
            metadata: { poolUser: minerData.poolUser }
          });
        }
      }
      const settings = await getUserSettings(miner.userId);
      const tempWarn = settings?.tempWarningThreshold ?? 70;
      const tempCrit = settings?.tempCriticalThreshold ?? 80;
      const minFanWarn = settings?.fanWarningBelowRpm ?? 1e3;
      const minFanCrit = settings?.fanCriticalBelowRpm ?? 500;
      if (typeof minerData.temperature === "number") {
        if (minerData.temperature >= tempCrit && canEmitAlert(`temp_crit:${miner.id}`, 10 * 60 * 1e3)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "temperature_high",
            severity: "critical",
            title: "Critical temperature",
            message: `${miner.name} (${miner.ipAddress}) reached ${minerData.temperature}\xB0C`,
            metadata: { temperature: minerData.temperature, threshold: tempCrit }
          });
        } else if (minerData.temperature >= tempWarn && canEmitAlert(`temp_warn:${miner.id}`, 10 * 60 * 1e3)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "temperature_warn",
            severity: "warning",
            title: "High temperature",
            message: `${miner.name} (${miner.ipAddress}) is at ${minerData.temperature}\xB0C`,
            metadata: { temperature: minerData.temperature, threshold: tempWarn }
          });
        }
      }
      if (typeof minerData.fanSpeed === "number") {
        if (minerData.fanSpeed > 0 && minerData.fanSpeed <= minFanCrit && canEmitAlert(`fan_crit:${miner.id}`, 10 * 60 * 1e3)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "fan_low",
            severity: "critical",
            title: "Fan speed critically low",
            message: `${miner.name} (${miner.ipAddress}) fan at ${minerData.fanSpeed} RPM`,
            metadata: { fanSpeed: minerData.fanSpeed, threshold: minFanCrit }
          });
        } else if (minerData.fanSpeed > 0 && minerData.fanSpeed <= minFanWarn && canEmitAlert(`fan_warn:${miner.id}`, 10 * 60 * 1e3)) {
          await createAlert({
            userId: miner.userId,
            minerId: miner.id,
            alertType: "fan_low_warn",
            severity: "warning",
            title: "Fan speed low",
            message: `${miner.name} (${miner.ipAddress}) fan at ${minerData.fanSpeed} RPM`,
            metadata: { fanSpeed: minerData.fanSpeed, threshold: minFanWarn }
          });
        }
      }
      if (minerData.bestDifficultyAllTime) {
        updateData.bestDifficultyAllTime = minerData.bestDifficultyAllTime;
      }
      await updateMiner(miner.id, updateData);
      await addMinerLog({
        minerId: miner.id,
        logLevel: "info",
        source: "polling",
        message: `Polled successfully: ${minerData.hashrate.toFixed(2)} ${minerData.hashrateUnit}, ${minerData.temperature || "-"}\xC2\xB0C, ${minerData.power || "-"}W`,
        metadata: {
          hashrate: minerData.hashrate,
          temperature: minerData.temperature,
          power: minerData.power,
          sharesAccepted: minerData.sharesAccepted
        }
      });
      await recordMinerStats({
        minerId: miner.id,
        hashrate: minerData.hashrate,
        temperature: minerData.temperature,
        fanSpeed: minerData.fanSpeed,
        power: minerData.power,
        voltage: minerData.voltage,
        frequency: minerData.frequency,
        sharesAccepted: minerData.sharesAccepted,
        sharesRejected: minerData.sharesRejected
      });
      return true;
    } else {
      await updateMiner(miner.id, {
        status: "offline"
      });
      await addMinerLog({
        minerId: miner.id,
        logLevel: "warning",
        source: "polling",
        message: `Failed to connect to miner at ${miner.ipAddress}`,
        metadata: {}
      });
      return false;
    }
  } catch (error) {
    console.error(`Error polling miner ${miner.id} (${miner.ipAddress}):`, error);
    await updateMiner(miner.id, {
      status: "error"
    });
    await addMinerLog({
      minerId: miner.id,
      logLevel: "error",
      source: "polling",
      message: `Error polling miner: ${error instanceof Error ? error.message : "Unknown error"}`,
      metadata: {}
    });
    return false;
  }
}
async function pollAllMiners(userId) {
  const miners = await getMinersByUserId(userId);
  let online = 0;
  let offline = 0;
  const batchSize = 10;
  for (let i = 0; i < miners.length; i += batchSize) {
    const batch = miners.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((miner) => pollMiner({
        id: miner.id,
        userId: miner.userId,
        name: miner.name,
        ipAddress: miner.ipAddress,
        minerType: miner.minerType,
        apiPort: miner.apiPort || 80
      }))
    );
    results.forEach((success) => {
      if (success) online++;
      else offline++;
    });
  }
  return {
    total: miners.length,
    online,
    offline
  };
}
function startPollingService() {
  if (_isPollingActive) {
    console.log("[Polling] Service already running");
    return;
  }
  console.log("[Polling] Starting miner polling service...");
  _isPollingActive = true;
  pollAllMinersBackground().catch((err) => {
    console.error("[Polling] Initial poll failed:", err);
  });
  _pollingInterval = setInterval(() => {
    pollAllMinersBackground().catch((err) => {
      console.error("[Polling] Scheduled poll failed:", err);
    });
  }, 1e4);
  console.log("[Polling] Service started (polling every 10 seconds)");
}
function stopPollingService() {
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
  _isPollingActive = false;
  console.log("[Polling] Service stopped");
}
async function pollAllMinersBackground() {
  try {
    const miners = await getMinersByUserId(1);
    if (miners.length === 0) {
      return;
    }
    console.log(`[Polling] Polling ${miners.length} miner(s)...`);
    const results = await Promise.allSettled(
      miners.map((miner) => pollMiner({
        id: miner.id,
        userId: miner.userId,
        name: miner.name,
        ipAddress: miner.ipAddress,
        minerType: miner.minerType,
        apiPort: miner.apiPort
      }))
    );
    const successes = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const failures = results.length - successes;
    console.log(`[Polling] Completed: ${successes} success, ${failures} failed`);
  } catch (error) {
    console.error("[Polling] Error polling miners:", error);
  }
}
var execAsync2, alertCooldown, _pollingInterval, _isPollingActive;
var init_minerPolling = __esm({
  "server/minerPolling.ts"() {
    "use strict";
    init_db();
    init_cgminerApi();
    init_poolVerify();
    init_macLookup();
    init_minerIdentify();
    execAsync2 = promisify3(exec2);
    alertCooldown = /* @__PURE__ */ new Map();
    _pollingInterval = null;
    _isPollingActive = false;
  }
});

// vite.config.ts
var vite_config_exports = {};
__export(vite_config_exports, {
  default: () => vite_config_default
});
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
var __filename, __dirname, plugins, vite_config_default;
var init_vite_config = __esm({
  "vite.config.ts"() {
    "use strict";
    __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
    plugins = [react(), tailwindcss(), jsxLocPlugin()];
    vite_config_default = defineConfig({
      plugins,
      resolve: {
        alias: {
          "@": path.resolve(__dirname, "client", "src"),
          "@shared": path.resolve(__dirname, "shared"),
          "@assets": path.resolve(__dirname, "attached_assets")
        }
      },
      envDir: path.resolve(__dirname),
      root: path.resolve(__dirname, "client"),
      publicDir: path.resolve(__dirname, "client", "public"),
      build: {
        outDir: path.resolve(__dirname, "dist/public"),
        emptyOutDir: true
      },
      server: {
        host: true,
        allowedHosts: true,
        // Allow all hosts for Umbrel deployment
        fs: {
          strict: true,
          deny: ["**/.*"]
        }
      }
    });
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
init_cgminerApi();
init_poolVerify();
init_minerIdentify();
init_db();
import { z as z2 } from "zod";
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  // Miners Router
  miners: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getMinersByUserId(ctx.user.id);
      return rows.map((m) => ({
        ...m,
        minerType: m.minerType ?? "other",
        model: m.model ?? null
      }));
    }),
    get: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ ctx, input }) => {
      const miner = await getMinerById(input.id);
      if (miner && miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return miner;
    }),
    create: protectedProcedure.input(z2.object({
      name: z2.string().min(1),
      minerType: z2.enum(["bitaxe", "nerdqaxe", "avalon", "antminer", "whatsminer", "canaan", "other"]),
      model: z2.string().optional(),
      ipAddress: z2.string(),
      apiPort: z2.number().int().positive().optional(),
      macAddress: z2.string().optional(),
      poolUrl: z2.string().optional(),
      poolPort: z2.number().int().positive().optional(),
      poolUser: z2.string().optional(),
      poolPassword: z2.string().optional(),
      poolUrl2: z2.string().optional(),
      poolPort2: z2.number().int().positive().optional(),
      poolUser2: z2.string().optional(),
      poolPassword2: z2.string().optional(),
      poolUrl3: z2.string().optional(),
      poolPort3: z2.number().int().positive().optional(),
      poolUser3: z2.string().optional(),
      poolPassword3: z2.string().optional(),
      tags: z2.array(z2.string()).optional()
    })).mutation(async ({ ctx, input }) => {
      const { tags, ...data } = input;
      const apiPort = data.apiPort || (data.minerType === "bitaxe" || data.minerType === "nerdqaxe" ? 80 : data.minerType === "avalon" || data.minerType === "antminer" || data.minerType === "whatsminer" || data.minerType === "canaan" ? 4028 : 80);
      return createMiner({
        ...data,
        apiPort,
        userId: ctx.user.id,
        status: "offline",
        tags: tags ? JSON.stringify(tags) : null
      });
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      minerType: z2.enum(["bitaxe", "nerdqaxe", "avalon", "antminer", "whatsminer", "canaan", "other"]).optional(),
      model: z2.string().optional(),
      ipAddress: z2.string().optional(),
      macAddress: z2.string().optional(),
      status: z2.enum(["online", "offline", "warning", "error"]).optional(),
      hashrate: z2.number().optional(),
      temperature: z2.number().optional(),
      fanSpeed: z2.number().optional(),
      power: z2.number().optional(),
      voltage: z2.number().optional(),
      frequency: z2.number().optional(),
      poolUrl: z2.string().optional(),
      poolPort: z2.number().int().positive().optional(),
      poolUser: z2.string().optional(),
      poolPassword: z2.string().optional(),
      poolUrl2: z2.string().optional(),
      poolPort2: z2.number().int().positive().optional(),
      poolUser2: z2.string().optional(),
      poolPassword2: z2.string().optional(),
      poolUrl3: z2.string().optional(),
      poolPort3: z2.number().int().positive().optional(),
      poolUser3: z2.string().optional(),
      poolPassword3: z2.string().optional(),
      sharesAccepted: z2.number().optional(),
      sharesRejected: z2.number().optional(),
      bestDifficulty: z2.string().optional(),
      tags: z2.array(z2.string()).optional()
    })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.id);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      const { id, tags, ...data } = input;
      const updateData = { ...data };
      if (tags !== void 0) {
        updateData.tags = JSON.stringify(tags);
      }
      return updateMiner(id, updateData);
    }),
    // Bulk update pool configuration for multiple miners (supports patch updates)
    bulkUpdatePools: protectedProcedure.input(z2.object({
      minerIds: z2.array(z2.number().int()).min(1),
      pool1: z2.object({ url: z2.string().optional(), port: z2.number().int().positive().optional(), user: z2.string().optional(), pass: z2.string().optional() }).optional(),
      pool2: z2.object({ url: z2.string().optional(), port: z2.number().int().positive().optional(), user: z2.string().optional(), pass: z2.string().optional() }).optional(),
      pool3: z2.object({ url: z2.string().optional(), port: z2.number().int().positive().optional(), user: z2.string().optional(), pass: z2.string().optional() }).optional()
    })).mutation(async ({ ctx, input }) => {
      const updated = [];
      for (const id of input.minerIds) {
        const miner = await getMinerById(id);
        if (!miner || miner.userId !== ctx.user.id) continue;
        const updateData = {};
        if (input.pool1) {
          if (input.pool1.url !== void 0) updateData.poolUrl = input.pool1.url;
          if (input.pool1.port !== void 0) updateData.poolPort = input.pool1.port;
          if (input.pool1.user !== void 0) updateData.poolUser = input.pool1.user;
          if (input.pool1.pass !== void 0) updateData.poolPassword = input.pool1.pass;
        }
        if (input.pool2) {
          if (input.pool2.url !== void 0) updateData.poolUrl2 = input.pool2.url;
          if (input.pool2.port !== void 0) updateData.poolPort2 = input.pool2.port;
          if (input.pool2.user !== void 0) updateData.poolUser2 = input.pool2.user;
          if (input.pool2.pass !== void 0) updateData.poolPassword2 = input.pool2.pass;
        }
        if (input.pool3) {
          if (input.pool3.url !== void 0) updateData.poolUrl3 = input.pool3.url;
          if (input.pool3.port !== void 0) updateData.poolPort3 = input.pool3.port;
          if (input.pool3.user !== void 0) updateData.poolUser3 = input.pool3.user;
          if (input.pool3.pass !== void 0) updateData.poolPassword3 = input.pool3.pass;
        }
        if (Object.keys(updateData).length === 0) continue;
        await updateMiner(id, updateData);
        updated.push(id);
      }
      return { updatedIds: updated };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.id);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return deleteMiner(input.id);
    }),
    // Get miner history for charts
    history: protectedProcedure.input(z2.object({
      minerId: z2.number(),
      hours: z2.number().default(24)
    })).query(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return getMinerStatsHistory(input.minerId, input.hours);
    }),
    // Record miner metrics (called periodically)
    recordMetrics: protectedProcedure.input(z2.object({
      minerId: z2.number(),
      hashrate: z2.number(),
      temperature: z2.number(),
      fanSpeed: z2.number(),
      power: z2.number(),
      sharesAccepted: z2.number(),
      sharesRejected: z2.number()
    })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return recordMinerStats(input);
    }),
    // Deep verify a pool by connecting to the stratum endpoint and inspecting coinbase outputs.
    // This is most accurate for SOLO/direct-payout pools where your address appears in the coinbase.
    verifyPool: protectedProcedure.input(z2.object({
      minerId: z2.number(),
      poolIndex: z2.number().int().min(1).max(3).default(1),
      // Minimum expected share of coinbase outputs that should pay the recipient.
      // Default: 98% (allows for small dev donation/fee outputs while still flagging scams).
      minShare: z2.number().min(0).max(1).default(0.98),
      timeoutS: z2.number().int().min(2).max(15).default(6)
    })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) throw new Error("Unauthorized");
      const idx = input.poolIndex;
      const url = idx === 1 ? miner.poolUrl : idx === 2 ? miner.poolUrl2 : miner.poolUrl3;
      const portField = idx === 1 ? miner.poolPort : idx === 2 ? miner.poolPort2 : miner.poolPort3;
      const user = idx === 1 ? miner.poolUser : idx === 2 ? miner.poolUser2 : miner.poolUser3;
      const pass = idx === 1 ? miner.poolPassword : idx === 2 ? miner.poolPassword2 : miner.poolPassword3;
      if (!url) {
        throw new Error("Pool URL is not configured");
      }
      const parsed = parseStratumEndpoint(url, portField ?? null);
      if (!parsed.port) {
        throw new Error("Missing pool port");
      }
      const recipient = (user || "").trim();
      const res = await verifyPoolOnStratum({
        host: parsed.host,
        port: parsed.port,
        transport: parsed.transport,
        user: recipient,
        password: pass || "x",
        recipient,
        minShare: input.minShare,
        timeoutS: input.timeoutS
      });
      const prev = miner.poolVerify ? safeJsonParse(miner.poolVerify) : {};
      const next = { ...typeof prev === "object" && prev ? prev : {}, [String(idx)]: res };
      await updateMiner(miner.id, {
        poolVerify: JSON.stringify(next),
        poolVerifyLastCheckedAt: Date.now()
      });
      return res;
    })
  }),
  // Groups Router
  groups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getMinerGroupsByUserId(ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({
      name: z2.string().min(1),
      description: z2.string().optional(),
      color: z2.string().optional()
    })).mutation(async ({ ctx, input }) => {
      return createMinerGroup({
        ...input,
        userId: ctx.user.id
      });
    }),
    update: protectedProcedure.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      description: z2.string().optional(),
      color: z2.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateMinerGroup(id, data);
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      return deleteMinerGroup(input.id);
    })
  }),
  // Alerts Router
  alerts: router({
    list: protectedProcedure.input(z2.object({
      unreadOnly: z2.boolean().default(false)
    }).optional()).query(async ({ ctx, input }) => {
      if (input?.unreadOnly) {
        return getUnreadAlerts(ctx.user.id);
      }
      return getAlertsByUserId(ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({
      minerId: z2.number().optional(),
      alertType: z2.enum(["high_temperature", "low_hashrate", "device_offline", "power_warning", "fan_failure", "share_rejection", "block_found", "overclock_warning", "voltage_warning", "connection_lost", "custom"]),
      severity: z2.enum(["critical", "warning", "info"]),
      title: z2.string(),
      message: z2.string()
    })).mutation(async ({ ctx, input }) => {
      return createAlert({
        ...input,
        userId: ctx.user.id
      });
    }),
    markRead: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      return markAlertAsRead(input.id);
    }),
    acknowledge: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      return acknowledgeAlert(input.id);
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      await deleteAlert(input.id);
      return { success: true };
    }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      return markAllAlertsAsRead(ctx.user.id);
    }),
    clearAll: protectedProcedure.mutation(async ({ ctx }) => {
      const alerts = await getAlertsByUserId(ctx.user.id);
      for (const alert of alerts) {
        await deleteAlert(alert.id);
      }
      return { success: true };
    })
  }),
  // Settings Router
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserSettings(ctx.user.id);
    }),
    update: protectedProcedure.input(z2.object({
      tempWarningThreshold: z2.number().optional(),
      tempCriticalThreshold: z2.number().optional(),
      hashrateDropThreshold: z2.number().optional(),
      offlineAlertDelay: z2.number().optional(),
      fanWarningBelowRpm: z2.number().optional(),
      fanCriticalBelowRpm: z2.number().optional(),
      pushNotifications: z2.boolean().optional(),
      emailNotifications: z2.boolean().optional(),
      blockFoundNotifications: z2.boolean().optional(),
      hashrateUnit: z2.string().optional(),
      temperatureUnit: z2.string().optional(),
      refreshInterval: z2.number().optional(),
      autoScanEnabled: z2.boolean().optional(),
      autoScanInterval: z2.number().optional(),
      scanSubnet: z2.string().optional(),
      poolProfilesJson: z2.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const settings = { ...input };
      if (input.pushNotifications !== void 0) settings.pushNotifications = input.pushNotifications ? 1 : 0;
      if (input.emailNotifications !== void 0) settings.emailNotifications = input.emailNotifications ? 1 : 0;
      if (input.blockFoundNotifications !== void 0) settings.blockFoundNotifications = input.blockFoundNotifications ? 1 : 0;
      if (input.autoScanEnabled !== void 0) settings.autoScanEnabled = input.autoScanEnabled ? 1 : 0;
      return upsertUserSettings(ctx.user.id, settings);
    })
  }),
  // Solo Blocks Router
  soloBlocks: router({
    list: publicProcedure.input(z2.object({
      limit: z2.number().default(20)
    }).optional()).query(async ({ input }) => {
      return getRecentSoloBlocks(input?.limit || 20);
    }),
    create: protectedProcedure.input(z2.object({
      blockHeight: z2.number(),
      blockHash: z2.string(),
      poolName: z2.string(),
      poolUrl: z2.string().optional(),
      minerAddress: z2.string().optional(),
      reward: z2.number(),
      difficulty: z2.string().optional(),
      localMinerId: z2.number().optional(),
      localMinerName: z2.string().optional(),
      isLocalFind: z2.boolean().default(false)
    })).mutation(async ({ ctx, input }) => {
      return addSoloBlock({
        ...input,
        timestamp: /* @__PURE__ */ new Date()
      });
    })
  }),
  // Network Scan Router - Ready for real network scanning
  network: router({
    scan: protectedProcedure.input(z2.object({
      subnet: z2.string().regex(
        /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\/24$/,
        "Only private network subnets allowed (10.x.x.x, 172.16-31.x.x, 192.168.x.x)"
      ).default("192.168.1.0/24")
    })).mutation(async ({ ctx, input }) => {
      const [baseIp, cidr] = input.subnet.split("/");
      const parts = baseIp.split(".").map(Number);
      const isPrivate = parts[0] === 10 || // 10.0.0.0/8
      parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || // 172.16.0.0/12
      parts[0] === 192 && parts[1] === 168;
      if (!isPrivate) {
        throw new Error("Only private network ranges are allowed for security");
      }
      if (cidr !== "24") {
        throw new Error("Only /24 subnets are supported");
      }
      const devices = [];
      const scanPromises = [];
      for (let i = 1; i <= 254; i++) {
        const ip = `${parts[0]}.${parts[1]}.${parts[2]}.${i}`;
        scanPromises.push(
          (async () => {
            try {
              const results = await Promise.allSettled([
                // 1) AxeOS HTTP API (Bitaxe/NerdQaxe) – try with explicit port 80 too for compatibility
                (async () => {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 5e3);
                  try {
                    const url = `http://${ip}:80/api/system/info`;
                    const response = await fetch(url, {
                      signal: controller.signal,
                      headers: { "Accept": "application/json" }
                    });
                    clearTimeout(timeoutId);
                    if (response.ok) {
                      const data = await response.json();
                      let model = data.deviceModel && data.deviceModel !== "None" && data.deviceModel !== "null" ? data.deviceModel : null;
                      if (!model && data.ASICModel) {
                        const asic = data.ASICModel.toUpperCase();
                        model = asic === "BM1366" ? "Bitaxe Ultra" : asic === "BM1368" ? "Bitaxe Supra" : asic === "BM1370" ? "Bitaxe Gamma" : asic === "BM1397" ? "Bitaxe" : data.ASICModel;
                      }
                      const checkStr = `${data.deviceModel || ""} ${data.hostname || ""} ${data.ASICModel || ""}`.toLowerCase();
                      const minerType = checkStr.includes("nerd") || checkStr.includes("qaxe") ? "nerdqaxe" : "bitaxe";
                      return {
                        found: true,
                        ip,
                        hostname: data.hostname || model || `miner-${i}`,
                        isMiner: true,
                        minerType,
                        model,
                        status: "online",
                        hashrate: data.hashRate || 0,
                        apiPort: 80
                      };
                    }
                  } catch {
                    clearTimeout(timeoutId);
                  }
                  return { found: false };
                })(),
                // 2) CGMiner API port 4028 (Avalon, Antminer, Whatsminer)
                (async () => {
                  try {
                    const cgVer = await cgminerCommand(ip, "version", 4028);
                    if (cgVer) {
                      const cgStats = await cgminerCommand(ip, "stats", 4028);
                      const cgSummary = await cgminerCommand(ip, "summary", 4028);
                      const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);
                      let hashrate = 0;
                      if (cgSummary?.json) {
                        const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
                        if (summary) {
                          const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
                          hashrate = mhs / 1e3;
                        }
                      }
                      return {
                        found: true,
                        ip,
                        hostname: identity.model || `miner-${i}`,
                        isMiner: true,
                        minerType: identity.minerType,
                        model: identity.model,
                        status: "online",
                        hashrate,
                        apiPort: 4028
                      };
                    }
                  } catch {
                  }
                  return { found: false };
                })(),
                // 3) CGMiner API port 4029 (some Avalon firmwares)
                (async () => {
                  try {
                    const cgVer = await cgminerCommand(ip, "version", 4029);
                    if (cgVer) {
                      const cgStats = await cgminerCommand(ip, "stats", 4029);
                      const cgSummary = await cgminerCommand(ip, "summary", 4029);
                      const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);
                      let hashrate = 0;
                      if (cgSummary?.json) {
                        const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
                        if (summary) {
                          const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
                          hashrate = mhs / 1e3;
                        }
                      }
                      return {
                        found: true,
                        ip,
                        hostname: identity.model || `miner-${i}`,
                        isMiner: true,
                        minerType: identity.minerType,
                        model: identity.model,
                        status: "online",
                        hashrate,
                        apiPort: 4029
                      };
                    }
                  } catch {
                  }
                  return { found: false };
                })()
              ]);
              const found = [];
              for (const result of results) {
                if (result.status === "fulfilled" && result.value.found) {
                  found.push(result.value);
                }
              }
              if (found.length > 0) {
                const preferAxe = (t2) => t2 === "bitaxe" || t2 === "nerdqaxe";
                found.sort((a, b) => (preferAxe(a.minerType) ? 0 : 1) - (preferAxe(b.minerType) ? 0 : 1));
                devices.push(found[0]);
                return;
              }
              try {
                const controller2 = new AbortController();
                const t2 = setTimeout(() => controller2.abort(), 1200);
                const r2 = await fetch(`http://${ip}/`, { signal: controller2.signal });
                clearTimeout(t2);
                if (r2.ok) {
                  const html = (await r2.text()).toLowerCase();
                  let minerType = null;
                  let model = null;
                  if (html.includes("avalon") || html.includes("canaan")) {
                    minerType = "avalon";
                    model = "Avalon";
                  } else if (html.includes("antminer") || html.includes("bitmain")) {
                    minerType = "antminer";
                    model = "Antminer";
                  } else if (html.includes("whatsminer") || html.includes("microbt")) {
                    minerType = "whatsminer";
                    model = "Whatsminer";
                  }
                  if (minerType) {
                    devices.push({
                      ip,
                      hostname: `miner-${i}`,
                      isMiner: true,
                      minerType,
                      model,
                      status: "online",
                      hashrate: 0
                    });
                  }
                }
              } catch {
              }
            } catch (e) {
            }
          })()
        );
      }
      await Promise.race([
        Promise.allSettled(scanPromises),
        new Promise((resolve) => setTimeout(resolve, 6e4))
        // 60 second max for full scan
      ]);
      return {
        success: true,
        devices
      };
    }),
    // Probe a specific IP for miner info
    probe: protectedProcedure.input(z2.object({
      ip: z2.string().regex(
        /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}$/,
        "Only private network IPs allowed"
      )
    })).mutation(async ({ ctx, input }) => {
      const parts = input.ip.split(".").map(Number);
      const isPrivate = parts[0] === 10 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31 || parts[0] === 192 && parts[1] === 168;
      if (!isPrivate) {
        throw new Error("Only private network IPs are allowed for security");
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5e3);
        const response = await fetch(`http://${input.ip}/api/system/info`, {
          signal: controller.signal,
          headers: { "Accept": "application/json" }
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            isMiner: true,
            minerType: data.ASICModel?.toLowerCase().includes("bitaxe") ? "bitaxe" : data.ASICModel?.toLowerCase().includes("nerd") ? "nerdqaxe" : "other",
            model: data.ASICModel || data.deviceModel || "Unknown",
            hashrate: data.hashRate || 0,
            status: "online",
            hostname: data.hostname,
            temperature: data.temp,
            fanSpeed: data.fanspeed,
            power: data.power
          };
        }
        let cgPort = 4028;
        let cgVer = await cgminerCommand(input.ip, "version", 4028);
        if (!cgVer) {
          cgVer = await cgminerCommand(input.ip, "version", 4029);
          if (cgVer) cgPort = 4029;
        }
        if (cgVer) {
          const cgStats = await cgminerCommand(input.ip, "stats", cgPort);
          const cgSummary = await cgminerCommand(input.ip, "summary", cgPort);
          const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);
          let hashrate = 0;
          let temp = null;
          let power = null;
          if (cgSummary?.json) {
            const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
            if (summary) {
              const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
              hashrate = mhs / 1e3;
            }
          }
          if (cgStats?.json) {
            const stats = cgStats.json.STATS?.[0] || cgStats.json.stats?.[0];
            if (stats) {
              temp = stats.TAvg || stats.Temperature || stats.temp || null;
              power = stats.Power || stats.power || null;
            }
          }
          return {
            success: true,
            isMiner: true,
            minerType: identity.minerType,
            model: identity.model,
            hashrate,
            status: "online",
            hostname: null,
            temperature: temp,
            fanSpeed: null,
            power
          };
        }
        try {
          const controller2 = new AbortController();
          const t2 = setTimeout(() => controller2.abort(), 1500);
          const r2 = await fetch(`http://${input.ip}/`, { signal: controller2.signal });
          clearTimeout(t2);
          if (r2.ok) {
            const html = (await r2.text()).toLowerCase();
            let minerType = null;
            if (html.includes("avalon") || html.includes("canaan")) minerType = "avalon";
            else if (html.includes("antminer") || html.includes("bitmain")) minerType = "antminer";
            else if (html.includes("whatsminer") || html.includes("microbt")) minerType = "whatsminer";
            if (minerType) {
              return {
                success: true,
                isMiner: true,
                minerType,
                model: minerType,
                hashrate: 0,
                status: "online",
                hostname: null,
                temperature: null,
                fanSpeed: null,
                power: null
              };
            }
          }
        } catch {
        }
        return {
          success: false,
          isMiner: false,
          minerType: null,
          model: null,
          hashrate: 0,
          status: "offline"
        };
      } catch (e) {
        return {
          success: false,
          isMiner: false,
          minerType: null,
          model: null,
          hashrate: 0,
          status: "offline"
        };
      }
    })
  }),
  // Dashboard stats
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStats(ctx.user.id);
    }),
    // Get aggregated stats history for all miners
    statsHistory: protectedProcedure.input(z2.object({ hours: z2.number().default(24) })).query(async ({ ctx, input }) => {
      const miners = await getMinersByUserId(ctx.user.id);
      const allStats = [];
      for (const miner of miners) {
        const stats = await getMinerStatsHistory(miner.id, input.hours);
        allStats.push(...stats.map((s) => ({
          minerId: miner.id,
          recordedAt: s.recordedAt,
          hashrate: s.hashrate || 0,
          temperature: s.temperature
        })));
      }
      return allStats;
    })
  }),
  // Stats Router - Miner statistics history
  stats: router({
    history: protectedProcedure.input(z2.object({ minerId: z2.number(), hours: z2.number().default(24) })).query(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      const stats = await getMinerStatsHistory(input.minerId, input.hours);
      return stats.map((s) => ({
        timestamp: s.recordedAt,
        hashrate: s.hashrate,
        temperature: s.temperature,
        power: s.power
      }));
    })
  }),
  // Polling Router - Fetch real-time data from miners
  polling: router({
    // Refresh all miners for the current user
    refreshAll: protectedProcedure.mutation(async ({ ctx }) => {
      const { pollAllMiners: pollAllMiners2 } = await Promise.resolve().then(() => (init_minerPolling(), minerPolling_exports));
      return pollAllMiners2(ctx.user.id);
    }),
    // Refresh a single miner
    refreshOne: protectedProcedure.input(z2.object({ minerId: z2.number() })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      const { pollMiner: pollMiner2 } = await Promise.resolve().then(() => (init_minerPolling(), minerPolling_exports));
      const success = await pollMiner2({
        id: miner.id,
        userId: miner.userId,
        name: miner.name,
        ipAddress: miner.ipAddress,
        minerType: miner.minerType,
        apiPort: 80
      });
      return { success };
    })
  }),
  // Miner Logs Router
  logs: router({
    list: protectedProcedure.input(z2.object({
      minerId: z2.number(),
      limit: z2.number().default(100)
    })).query(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return getMinerLogs(input.minerId, input.limit);
    }),
    add: protectedProcedure.input(z2.object({
      minerId: z2.number(),
      logLevel: z2.enum(["debug", "info", "warning", "error", "critical"]).default("info"),
      source: z2.string().optional(),
      message: z2.string(),
      metadata: z2.record(z2.string(), z2.unknown()).optional()
    })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return addMinerLog({
        minerId: input.minerId,
        logLevel: input.logLevel,
        source: input.source ?? null,
        message: input.message,
        metadata: input.metadata ?? null
      });
    }),
    clear: protectedProcedure.input(z2.object({ minerId: z2.number() })).mutation(async ({ ctx, input }) => {
      const miner = await getMinerById(input.minerId);
      if (!miner || miner.userId !== ctx.user.id) {
        throw new Error("Unauthorized");
      }
      return clearMinerLogs(input.minerId);
    })
  }),
  // App Settings Router (local auth)
  appSettings: router({
    get: publicProcedure.query(async () => {
      const settings = await getAppSettings();
      if (!settings) {
        return {
          username: "blackaxe",
          theme: "dark",
          appName: "BlackAxe"
        };
      }
      return {
        username: settings.username,
        theme: settings.theme,
        appName: settings.appName
      };
    }),
    updateCredentials: protectedProcedure.input(z2.object({
      currentPassword: z2.string(),
      newUsername: z2.string().min(3),
      newPassword: z2.string().min(6)
    })).mutation(async ({ ctx, input }) => {
      const isValid = await verifyAppPassword(input.currentPassword);
      if (!isValid) {
        throw new Error("Current password is incorrect");
      }
      await updateAppCredentials(input.newUsername, input.newPassword);
      return { success: true };
    }),
    updateTheme: protectedProcedure.input(z2.object({
      theme: z2.enum(["dark", "light"])
    })).mutation(async ({ ctx, input }) => {
      await createOrUpdateAppSettings({ theme: input.theme });
      return { success: true };
    }),
    verifyPassword: publicProcedure.input(z2.object({
      password: z2.string()
    })).mutation(async ({ input }) => {
      const isValid = await verifyAppPassword(input.password);
      return { valid: isValid };
    })
  }),
  // User settings (monitoring thresholds, refresh interval)
  userSettings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserSettings(ctx.user.id);
    }),
    update: protectedProcedure.input(z2.object({
      tempWarningThreshold: z2.number().int().min(0).max(120).optional(),
      tempCriticalThreshold: z2.number().int().min(0).max(130).optional(),
      hashrateDropThreshold: z2.number().int().min(1).max(100).optional(),
      offlineAlertDelay: z2.number().int().min(30).max(3600).optional(),
      fanWarningBelowRpm: z2.number().int().min(0).max(2e4).optional(),
      fanCriticalBelowRpm: z2.number().int().min(0).max(2e4).optional(),
      refreshInterval: z2.number().int().min(1).max(60).optional()
    })).mutation(async ({ ctx, input }) => {
      if (input.tempWarningThreshold !== void 0 && input.tempCriticalThreshold !== void 0) {
        if (input.tempWarningThreshold > input.tempCriticalThreshold) {
          throw new Error("Temperature warning threshold must be <= critical threshold");
        }
      }
      if (input.fanWarningBelowRpm !== void 0 && input.fanCriticalBelowRpm !== void 0) {
        if (input.fanWarningBelowRpm < input.fanCriticalBelowRpm) {
          throw new Error("Fan warning RPM threshold should be >= critical RPM threshold");
        }
      }
      return upsertUserSettings(ctx.user.id, input);
    })
  }),
  // Mempool API Router for real blockchain data
  mempool: router({
    // Solo Mining Pool identifiers
    // These are pools known for solo mining
    // Get recent Solo Blocks only from mempool.space
    soloBlocks: publicProcedure.input(z2.object({
      limit: z2.number().default(20)
    }).optional()).query(async ({ input }) => {
      try {
        const soloPoolSlugs = [
          "solock",
          "solo-ck",
          "ckpool",
          // CKPool Solo
          "public-pool",
          "publicpool",
          // Public Pool
          "ckpooleu",
          // CKPool EU
          "solo"
          // Generic solo
        ];
        const soloPoolNames = [
          "Solo CK",
          "solo.ckpool",
          "ckpool",
          "public-pool",
          "Public Pool",
          "public pool",
          "SOLO",
          "Solo Miner"
        ];
        const response = await fetch("https://mempool.space/api/v1/blocks");
        if (!response.ok) throw new Error("Failed to fetch blocks");
        let allBlocks = await response.json();
        const poolEndpoints = [
          "https://mempool.space/api/v1/mining/pool/solock/blocks",
          // Solo CK
          "https://mempool.space/api/v1/mining/pool/publicpool/blocks"
          // Public Pool
        ];
        let allPoolBlocks = [];
        for (const endpoint of poolEndpoints) {
          try {
            const poolResponse = await fetch(endpoint);
            if (poolResponse.ok) {
              const blocks = await poolResponse.json();
              allPoolBlocks = [...allPoolBlocks, ...blocks];
            }
          } catch (e) {
          }
        }
        const soloBlocks = allBlocks.filter((block) => {
          const poolSlug = block.extras?.pool?.slug?.toLowerCase() || "";
          const poolName = block.extras?.pool?.name?.toLowerCase() || "";
          return soloPoolSlugs.some((slug) => poolSlug.includes(slug)) || soloPoolNames.some((name) => poolName.toLowerCase().includes(name.toLowerCase())) || poolName.includes("solo") || poolSlug.includes("solo");
        });
        const combinedBlocks = [...soloBlocks];
        for (const block of allPoolBlocks) {
          if (!combinedBlocks.find((b) => b.height === block.height)) {
            combinedBlocks.push(block);
          }
        }
        combinedBlocks.sort((a, b) => b.height - a.height);
        return combinedBlocks.slice(0, input?.limit || 20).map((block) => ({
          height: block.height,
          hash: block.id,
          timestamp: block.timestamp,
          size: block.size,
          weight: block.weight,
          txCount: block.tx_count,
          difficulty: block.difficulty,
          nonce: block.nonce,
          reward: (block.extras?.reward || 3125e5) / 1e8,
          poolName: block.extras?.pool?.name || "Solo Miner",
          poolSlug: block.extras?.pool?.slug || "solo",
          isSolo: true
        }));
      } catch (error) {
        console.error("Error fetching solo blocks from mempool:", error);
        return [];
      }
    }),
    // Get all recent blocks (for reference)
    recentBlocks: publicProcedure.input(z2.object({
      limit: z2.number().default(20)
    }).optional()).query(async ({ input }) => {
      try {
        const response = await fetch("https://mempool.space/api/v1/blocks");
        if (!response.ok) throw new Error("Failed to fetch blocks");
        const blocks = await response.json();
        return blocks.slice(0, input?.limit || 20).map((block) => ({
          height: block.height,
          hash: block.id,
          timestamp: block.timestamp,
          size: block.size,
          weight: block.weight,
          txCount: block.tx_count,
          difficulty: block.difficulty,
          nonce: block.nonce,
          reward: (block.extras?.reward || 3125e5) / 1e8,
          poolName: block.extras?.pool?.name || "Unknown",
          poolSlug: block.extras?.pool?.slug || "unknown"
        }));
      } catch (error) {
        console.error("Error fetching blocks from mempool:", error);
        return [];
      }
    }),
    // Get specific block by height
    blockByHeight: publicProcedure.input(z2.object({
      height: z2.number()
    })).query(async ({ input }) => {
      try {
        const response = await fetch(`https://mempool.space/api/block-height/${input.height}`);
        if (!response.ok) throw new Error("Failed to fetch block");
        const blockHash = await response.text();
        const blockResponse = await fetch(`https://mempool.space/api/block/${blockHash}`);
        if (!blockResponse.ok) throw new Error("Failed to fetch block details");
        const block = await blockResponse.json();
        return {
          height: block.height,
          hash: block.id,
          timestamp: block.timestamp,
          size: block.size,
          weight: block.weight,
          txCount: block.tx_count,
          difficulty: block.difficulty,
          nonce: block.nonce,
          reward: (block.extras?.reward || 3125e5) / 1e8,
          poolName: block.extras?.pool?.name || "Unknown",
          poolSlug: block.extras?.pool?.slug || "unknown"
        };
      } catch (error) {
        console.error("Error fetching block:", error);
        return null;
      }
    }),
    // Get current blockchain stats
    stats: publicProcedure.query(async () => {
      try {
        const [diffResponse, hashResponse, tipResponse] = await Promise.all([
          fetch("https://mempool.space/api/v1/mining/difficulty-adjustments"),
          fetch("https://mempool.space/api/v1/mining/hashrate/1m"),
          fetch("https://mempool.space/api/blocks/tip/height")
        ]);
        const difficulty = diffResponse.ok ? await diffResponse.json() : [];
        const hashrate = hashResponse.ok ? await hashResponse.json() : { currentHashrate: 0 };
        const tipHeight = tipResponse.ok ? await tipResponse.text() : "0";
        return {
          currentHeight: parseInt(tipHeight),
          currentHashrate: hashrate.currentHashrate || 0,
          difficulty: difficulty[0]?.difficultyChange || 0,
          nextDifficultyAdjustment: difficulty[0]?.remainingBlocks || 0
        };
      } catch (error) {
        console.error("Error fetching mempool stats:", error);
        return {
          currentHeight: 0,
          currentHashrate: 0,
          difficulty: 0,
          nextDifficultyAdjustment: 0
        };
      }
    })
  })
});

// server/_core/localAuth.ts
init_db();
import { SignJWT, jwtVerify } from "jose";
function getSessionSecret() {
  const secret = ENV.cookieSecret || "blackaxe-local-secret-key-change-in-production";
  return new TextEncoder().encode(secret);
}
async function createLocalSessionToken(userId, username, expiresInMs = ONE_YEAR_MS) {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
  const secretKey = getSessionSecret();
  return new SignJWT({
    userId,
    username
  }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
}
async function verifyLocalSession(cookieValue) {
  if (!cookieValue) {
    return null;
  }
  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"]
    });
    const { userId, username } = payload;
    if (typeof userId !== "number" || typeof username !== "string") {
      return null;
    }
    return { userId, username };
  } catch (error) {
    console.warn("[LocalAuth] Session verification failed");
    return null;
  }
}
function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return /* @__PURE__ */ new Map();
  }
  const cookies = /* @__PURE__ */ new Map();
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies.set(name, rest.join("="));
    }
  });
  return cookies;
}
async function authenticateLocalRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  const session = await verifyLocalSession(sessionCookie);
  if (!session) {
    return null;
  }
  const user = await getUserById(session.userId);
  return user || null;
}
function registerLocalAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }
      const isValid = await verifyAppPassword(password);
      const settings = await getAppSettings();
      if (!isValid || settings?.username !== username) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }
      let user = await getUserByOpenId(`local:${username}`);
      console.log("[LocalAuth] Existing user:", user ? user.id : "none");
      if (!user) {
        console.log("[LocalAuth] Creating new user...");
        try {
          await upsertUser({
            openId: `local:${username}`,
            name: username,
            email: null,
            loginMethod: "local",
            role: "admin",
            // First user is admin
            lastSignedIn: /* @__PURE__ */ new Date()
          });
          console.log("[LocalAuth] User created, fetching...");
          user = await getUserByOpenId(`local:${username}`);
          console.log("[LocalAuth] Fetched user:", user ? user.id : "none");
        } catch (createError) {
          console.error("[LocalAuth] Failed to create user:", createError);
          res.status(500).json({ error: "Failed to create user: " + String(createError) });
          return;
        }
      } else {
        await upsertUser({
          openId: user.openId,
          lastSignedIn: /* @__PURE__ */ new Date()
        });
      }
      if (!user) {
        console.error("[LocalAuth] User is still null after creation");
        res.status(500).json({ error: "Failed to create user session - user not found after creation" });
        return;
      }
      const sessionToken = await createLocalSessionToken(user.id, username);
      res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: false,
        // localhost doesn't use HTTPS
        sameSite: "lax",
        maxAge: ONE_YEAR_MS,
        path: "/"
      });
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          username
        }
      });
    } catch (error) {
      console.error("[LocalAuth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await authenticateLocalRequest(req);
      if (!user) {
        res.json({ user: null });
        return;
      }
      const settings = await getAppSettings();
      res.json({
        user: {
          id: user.id,
          name: user.name,
          username: settings?.username || "blackaxe",
          role: user.role
        }
      });
    } catch (error) {
      res.json({ user: null });
    }
  });
}

// server/_core/localContext.ts
async function createLocalContext(opts) {
  let user = null;
  try {
    user = await authenticateLocalRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { createServer as createViteServer } from "vite";
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
async function setupVite(app, server) {
  const viteConfig = (await Promise.resolve().then(() => (init_vite_config(), vite_config_exports))).default;
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        __dirname2,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = path2.resolve(__dirname2, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
init_db();
init_minerPolling();
var PORT = parseInt(process.env.PORT || "30211");
var HOST = process.env.HOST || "127.0.0.1";
async function startServer() {
  await initializeDatabase();
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerLocalAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createLocalContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  server.listen(PORT, HOST, () => {
    console.log(`
\u{1F525} BlackAxe Mining Manager`);
    console.log(`\u{1F4CD} Running on http://${HOST}:${PORT}/`);
    console.log(`\u{1F512} Local authentication enabled`);
    console.log(`
\u{1F4A1} Default credentials: blackaxe / blackaxe`);
    console.log(`\u26A0\uFE0F  Please change the password after first login!
`);
    startPollingService();
  });
}
startServer().catch(console.error);
