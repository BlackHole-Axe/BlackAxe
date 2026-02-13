import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { cgminerCommand } from "./cgminerApi";
import { parseStratumEndpoint, verifyPoolOnStratum } from "./poolVerify";
import { inferMinerIdentity } from "./minerIdentify";
import { 
  getMinersByUserId, 
  getMinerById, 
  createMiner, 
  updateMiner, 
  deleteMiner,
  getMinerStatsHistory,
  recordMinerStats,
  getAlertsByUserId,
  getUnreadAlerts,
  createAlert,
  markAlertAsRead,
  acknowledgeAlert,
  markAllAlertsAsRead,
  deleteAlert,
  getUserSettings,
  upsertUserSettings,
  getRecentSoloBlocks,
  addSoloBlock,
  getDashboardStats,
  getMinerGroupsByUserId,
  createMinerGroup,
  updateMinerGroup,
  deleteMinerGroup,
  getMinerLogs,
  addMinerLog,
  clearMinerLogs,
  getAppSettings,
  createOrUpdateAppSettings,
  verifyAppPassword,
  updateAppCredentials,
} from "./db";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Miners Router
  miners: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await getMinersByUserId(ctx.user.id);
      return rows.map((m: any) => ({
        ...m,
        minerType: m.minerType ?? "other",
        model: m.model ?? null,
      }));
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const miner = await getMinerById(input.id);
        if (miner && miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return miner;
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        minerType: z.enum(["bitaxe", "nerdqaxe", "avalon", "antminer", "whatsminer", "canaan", "other"]),
        model: z.string().optional(),
        ipAddress: z.string(),
        apiPort: z.number().int().positive().optional(),
        macAddress: z.string().optional(),
        poolUrl: z.string().optional(),
        poolPort: z.number().int().positive().optional(),
        poolUser: z.string().optional(),
        poolPassword: z.string().optional(),
        poolUrl2: z.string().optional(),
        poolPort2: z.number().int().positive().optional(),
        poolUser2: z.string().optional(),
        poolPassword2: z.string().optional(),
        poolUrl3: z.string().optional(),
        poolPort3: z.number().int().positive().optional(),
        poolUser3: z.string().optional(),
        poolPassword3: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { tags, ...data } = input;
        
        // Set default apiPort based on minerType if not provided
        const apiPort = data.apiPort || (
          (data.minerType === 'bitaxe' || data.minerType === 'nerdqaxe') ? 80 :
          (data.minerType === 'avalon' || data.minerType === 'antminer' || data.minerType === 'whatsminer' || data.minerType === 'canaan') ? 4028 :
          80
        );
        
        return createMiner({
          ...data,
          apiPort,
          userId: ctx.user.id,
          status: "offline",
          tags: tags ? JSON.stringify(tags) : null,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        minerType: z.enum(["bitaxe", "nerdqaxe", "avalon", "antminer", "whatsminer", "canaan", "other"]).optional(),
        model: z.string().optional(),
        ipAddress: z.string().optional(),
        macAddress: z.string().optional(),
        status: z.enum(["online", "offline", "warning", "error"]).optional(),
        hashrate: z.number().optional(),
        temperature: z.number().optional(),
        fanSpeed: z.number().optional(),
        power: z.number().optional(),
        voltage: z.number().optional(),
        frequency: z.number().optional(),
        poolUrl: z.string().optional(),
        poolPort: z.number().int().positive().optional(),
        poolUser: z.string().optional(),
        poolPassword: z.string().optional(),
        poolUrl2: z.string().optional(),
        poolPort2: z.number().int().positive().optional(),
        poolUser2: z.string().optional(),
        poolPassword2: z.string().optional(),
        poolUrl3: z.string().optional(),
        poolPort3: z.number().int().positive().optional(),
        poolUser3: z.string().optional(),
        poolPassword3: z.string().optional(),
        sharesAccepted: z.number().optional(),
        sharesRejected: z.number().optional(),
        bestDifficulty: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.id);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        const { id, tags, ...data } = input;
        // Convert tags array to JSON string for SQLite storage
        const updateData: any = { ...data };
        if (tags !== undefined) {
          updateData.tags = JSON.stringify(tags);
        }
        return updateMiner(id, updateData);
      }),



    // Bulk update pool configuration for multiple miners (supports patch updates)
    bulkUpdatePools: protectedProcedure
      .input(z.object({
        minerIds: z.array(z.number().int()).min(1),
        pool1: z.object({ url: z.string().optional(), port: z.number().int().positive().optional(), user: z.string().optional(), pass: z.string().optional() }).optional(),
        pool2: z.object({ url: z.string().optional(), port: z.number().int().positive().optional(), user: z.string().optional(), pass: z.string().optional() }).optional(),
        pool3: z.object({ url: z.string().optional(), port: z.number().int().positive().optional(), user: z.string().optional(), pass: z.string().optional() }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated: number[] = [];
        for (const id of input.minerIds) {
          const miner = await getMinerById(id);
          if (!miner || miner.userId !== ctx.user.id) continue;

          const updateData: any = {};
          if (input.pool1) {
            if (input.pool1.url !== undefined) updateData.poolUrl = input.pool1.url;
            if (input.pool1.port !== undefined) updateData.poolPort = input.pool1.port;
            if (input.pool1.user !== undefined) updateData.poolUser = input.pool1.user;
            if (input.pool1.pass !== undefined) updateData.poolPassword = input.pool1.pass;
          }
          if (input.pool2) {
            if (input.pool2.url !== undefined) updateData.poolUrl2 = input.pool2.url;
            if (input.pool2.port !== undefined) updateData.poolPort2 = input.pool2.port;
            if (input.pool2.user !== undefined) updateData.poolUser2 = input.pool2.user;
            if (input.pool2.pass !== undefined) updateData.poolPassword2 = input.pool2.pass;
          }
          if (input.pool3) {
            if (input.pool3.url !== undefined) updateData.poolUrl3 = input.pool3.url;
            if (input.pool3.port !== undefined) updateData.poolPort3 = input.pool3.port;
            if (input.pool3.user !== undefined) updateData.poolUser3 = input.pool3.user;
            if (input.pool3.pass !== undefined) updateData.poolPassword3 = input.pool3.pass;
          }

          if (Object.keys(updateData).length === 0) continue;
          await updateMiner(id, updateData);
          updated.push(id)
        }
        return { updatedIds: updated } as const;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.id);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return deleteMiner(input.id);
      }),

    // Get miner history for charts
    history: protectedProcedure
      .input(z.object({ 
        minerId: z.number(),
        hours: z.number().default(24),
      }))
      .query(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return getMinerStatsHistory(input.minerId, input.hours);
      }),

    // Record miner metrics (called periodically)
    recordMetrics: protectedProcedure
      .input(z.object({
        minerId: z.number(),
        hashrate: z.number(),
        temperature: z.number(),
        fanSpeed: z.number(),
        power: z.number(),
        sharesAccepted: z.number(),
        sharesRejected: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return recordMinerStats(input);
      }),

    // Deep verify a pool by connecting to the stratum endpoint and inspecting coinbase outputs.
    // This is most accurate for SOLO/direct-payout pools where your address appears in the coinbase.
    verifyPool: protectedProcedure
      .input(z.object({
        minerId: z.number(),
        poolIndex: z.number().int().min(1).max(3).default(1),
        // Minimum expected share of coinbase outputs that should pay the recipient.
        // Default: 98% (allows for small dev donation/fee outputs while still flagging scams).
        minShare: z.number().min(0).max(1).default(0.98),
        timeoutS: z.number().int().min(2).max(15).default(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) throw new Error("Unauthorized");

        const idx = input.poolIndex;
        const url = idx === 1 ? miner.poolUrl : idx === 2 ? (miner as any).poolUrl2 : (miner as any).poolUrl3;
        const portField = idx === 1 ? (miner as any).poolPort : idx === 2 ? (miner as any).poolPort2 : (miner as any).poolPort3;
        const user = idx === 1 ? miner.poolUser : idx === 2 ? (miner as any).poolUser2 : (miner as any).poolUser3;
        const pass = idx === 1 ? miner.poolPassword : idx === 2 ? (miner as any).poolPassword2 : (miner as any).poolPassword3;

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
          timeoutS: input.timeoutS,
        });

        // Store per-pool verify results in a single JSON blob for easy UI use.
        const prev = (miner as any).poolVerify ? safeJsonParse((miner as any).poolVerify) : {};
        const next = { ...(typeof prev === "object" && prev ? prev : {}), [String(idx)]: res };
        await updateMiner(miner.id, {
          poolVerify: JSON.stringify(next),
          poolVerifyLastCheckedAt: Date.now(),
        } as any);

        return res;
      }),
  }),

  // Groups Router
  groups: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getMinerGroupsByUserId(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createMinerGroup({
          ...input,
          userId: ctx.user.id,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return updateMinerGroup(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return deleteMinerGroup(input.id);
      }),
  }),

  // Alerts Router
  alerts: router({
    list: protectedProcedure
      .input(z.object({
        unreadOnly: z.boolean().default(false),
      }).optional())
      .query(async ({ ctx, input }) => {
        if (input?.unreadOnly) {
          return getUnreadAlerts(ctx.user.id);
        }
        return getAlertsByUserId(ctx.user.id);
      }),

    create: protectedProcedure
      .input(z.object({
        minerId: z.number().optional(),
        alertType: z.enum(["high_temperature", "low_hashrate", "device_offline", "power_warning", "fan_failure", "share_rejection", "block_found", "overclock_warning", "voltage_warning", "connection_lost", "custom"]),
        severity: z.enum(["critical", "warning", "info"]),
        title: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return createAlert({
          ...input,
          userId: ctx.user.id,
        });
      }),

    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return markAlertAsRead(input.id);
      }),

    acknowledge: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return acknowledgeAlert(input.id);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAlert(input.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      return markAllAlertsAsRead(ctx.user.id);
    }),

    clearAll: protectedProcedure.mutation(async ({ ctx }) => {
      // Delete all alerts for user - we'll add this function
      const alerts = await getAlertsByUserId(ctx.user.id);
      for (const alert of alerts) {
        await deleteAlert(alert.id);
      }
      return { success: true };
    }),
  }),

  // Settings Router
  settings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserSettings(ctx.user.id);
    }),

    update: protectedProcedure
      .input(z.object({
        tempWarningThreshold: z.number().optional(),
        tempCriticalThreshold: z.number().optional(),
        hashrateDropThreshold: z.number().optional(),
        offlineAlertDelay: z.number().optional(),
        fanWarningBelowRpm: z.number().optional(),
        fanCriticalBelowRpm: z.number().optional(),
        pushNotifications: z.boolean().optional(),
        emailNotifications: z.boolean().optional(),
        blockFoundNotifications: z.boolean().optional(),
        hashrateUnit: z.string().optional(),
        temperatureUnit: z.string().optional(),
        refreshInterval: z.number().optional(),
        autoScanEnabled: z.boolean().optional(),
        autoScanInterval: z.number().optional(),
        scanSubnet: z.string().optional(),
        poolProfilesJson: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Convert booleans to numbers for SQLite
        const settings: any = { ...input };
        if (input.pushNotifications !== undefined) settings.pushNotifications = input.pushNotifications ? 1 : 0;
        if (input.emailNotifications !== undefined) settings.emailNotifications = input.emailNotifications ? 1 : 0;
        if (input.blockFoundNotifications !== undefined) settings.blockFoundNotifications = input.blockFoundNotifications ? 1 : 0;
        if (input.autoScanEnabled !== undefined) settings.autoScanEnabled = input.autoScanEnabled ? 1 : 0;
        return upsertUserSettings(ctx.user.id, settings);
      }),
  }),

  // Solo Blocks Router
  soloBlocks: router({
    list: publicProcedure
      .input(z.object({
        limit: z.number().default(20),
      }).optional())
      .query(async ({ input }) => {
        return getRecentSoloBlocks(input?.limit || 20);
      }),

    create: protectedProcedure
      .input(z.object({
        blockHeight: z.number(),
        blockHash: z.string(),
        poolName: z.string(),
        poolUrl: z.string().optional(),
        minerAddress: z.string().optional(),
        reward: z.number(),
        difficulty: z.string().optional(),
        localMinerId: z.number().optional(),
        localMinerName: z.string().optional(),
        isLocalFind: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        return addSoloBlock({
          ...input,
          timestamp: new Date(),
        });
      }),
  }),

  // Network Scan Router - Ready for real network scanning
  network: router({
    scan: protectedProcedure
      .input(z.object({
        subnet: z.string()
          .regex(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\/24$/, 
            "Only private network subnets allowed (10.x.x.x, 172.16-31.x.x, 192.168.x.x)")
          .default("192.168.1.0/24"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate subnet is a private network range (security check)
        const [baseIp, cidr] = input.subnet.split('/');
        const parts = baseIp.split('.').map(Number);
        
        // Only allow private IP ranges for security
        const isPrivate = 
          (parts[0] === 10) || // 10.0.0.0/8
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
          (parts[0] === 192 && parts[1] === 168); // 192.168.0.0/16
        
        if (!isPrivate) {
          throw new Error("Only private network ranges are allowed for security");
        }
        
        // Only allow /24 subnets (254 hosts max)
        if (cidr !== "24") {
          throw new Error("Only /24 subnets are supported");
        }
        
        // For /24 subnet, scan last octet
        const devices: Array<{
          ip: string;
          hostname?: string;
          isMiner: boolean;
          minerType?: string;
          model?: string;
          status?: string;
          hashrate?: number;
        }> = [];
        
        // Parallel scan with optimized probing
        // Try multiple ports/protocols concurrently for each IP
        const scanPromises: Promise<void>[] = [];
        
        for (let i = 1; i <= 254; i++) {
          const ip = `${parts[0]}.${parts[1]}.${parts[2]}.${i}`;
          
          scanPromises.push(
            (async () => {
              try {
                // Try all probe methods in parallel for this IP
                const results = await Promise.allSettled([
                  // 1) AxeOS HTTP API (Bitaxe/NerdQaxe) – try with explicit port 80 too for compatibility
                  (async () => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    try {
                      const url = `http://${ip}:80/api/system/info`;
                      const response = await fetch(url, {
                        signal: controller.signal,
                        headers: { 'Accept': 'application/json' },
                      });
                      clearTimeout(timeoutId);
                      
                      if (response.ok) {
                        const data = await response.json();
                        
                        // Quick model detection
                        let model = (data.deviceModel && data.deviceModel !== 'None' && data.deviceModel !== 'null') ? data.deviceModel : null;
                        if (!model && data.ASICModel) {
                          const asic = data.ASICModel.toUpperCase();
                          model = asic === 'BM1366' ? 'Bitaxe Ultra' :
                                  asic === 'BM1368' ? 'Bitaxe Supra' :
                                  asic === 'BM1370' ? 'Bitaxe Gamma' :
                                  asic === 'BM1397' ? 'Bitaxe' : data.ASICModel;
                        }
                        
                        // Quick type detection
                        const checkStr = `${data.deviceModel || ''} ${data.hostname || ''} ${data.ASICModel || ''}`.toLowerCase();
                        const minerType = (checkStr.includes('nerd') || checkStr.includes('qaxe')) ? 'nerdqaxe' : 'bitaxe';
                        
                        return {
                          found: true,
                          ip,
                          hostname: data.hostname || model || `miner-${i}`,
                          isMiner: true,
                          minerType,
                          model,
                          status: 'online',
                          hashrate: data.hashRate || 0,
                          apiPort: 80,
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
                        // Pass VERSION JSON (not just raw string) for better detection
                        const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);
                        
                        let hashrate = 0;
                        if (cgSummary?.json) {
                          const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
                          if (summary) {
                            const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
                            hashrate = mhs / 1000;
                          }
                        }
                        
                        return {
                          found: true,
                          ip,
                          hostname: identity.model || `miner-${i}`,
                          isMiner: true,
                          minerType: identity.minerType,
                          model: identity.model,
                          status: 'online',
                          hashrate,
                          apiPort: 4028,
                        };
                      }
                    } catch {}
                    return { found: false };
                  })(),
                  
                  // 3) CGMiner API port 4029 (some Avalon firmwares)
                  (async () => {
                    try {
                      const cgVer = await cgminerCommand(ip, "version", 4029);
                      if (cgVer) {
                        const cgStats = await cgminerCommand(ip, "stats", 4029);
                        const cgSummary = await cgminerCommand(ip, "summary", 4029);
                        // Pass VERSION JSON (not just raw string) for better detection
                        const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);
                        
                        let hashrate = 0;
                        if (cgSummary?.json) {
                          const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
                          if (summary) {
                            const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
                            hashrate = mhs / 1000;
                          }
                        }
                        
                        return {
                          found: true,
                          ip,
                          hostname: identity.model || `miner-${i}`,
                          isMiner: true,
                          minerType: identity.minerType,
                          model: identity.model,
                          status: 'online',
                          hashrate,
                          apiPort: 4029,
                        };
                      }
                    } catch {}
                    return { found: false };
                  })(),
                ]);

                // Prefer Bitaxe/NerdQAxe when multiple probes succeed (AxeOS first, then CGMiner)
                const found: Array<{ found: true; ip: string; hostname: string; isMiner: true; minerType: string; model: string; status: string; hashrate?: number; apiPort?: number }> = [];
                for (const result of results) {
                  if (result.status === 'fulfilled' && result.value.found) {
                    found.push(result.value);
                  }
                }
                if (found.length > 0) {
                  const preferAxe = (t: string) => t === 'bitaxe' || t === 'nerdqaxe';
                  found.sort((a, b) => (preferAxe(a.minerType) ? 0 : 1) - (preferAxe(b.minerType) ? 0 : 1));
                  devices.push(found[0]);
                  return;
                }
                // 2) Web UI fallback: fingerprint common miner web UIs (helps devices with CGMiner API disabled)
                // Only try this if CGMiner API probe failed
                try {
                  const controller2 = new AbortController();
                  const t2 = setTimeout(() => controller2.abort(), 1200);
                  const r2 = await fetch(`http://${ip}/`, { signal: controller2.signal });
                  clearTimeout(t2);
                  if (r2.ok) {
                    const html = (await r2.text()).toLowerCase();
                    let minerType: string | null = null;
                    let model: string | null = null;
                    
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
                        hashrate: 0,
                      });
                    }
                  }
                } catch {
                  // ignore
                }
              } catch (e) {
                // Device not responding or not a miner - skip silently
              }
            })()
          );
        }
        
        // Wait for all probes to complete (with overall timeout)
        // 254 IPs * 2.5s max per IP = need generous timeout
        await Promise.race([
          Promise.allSettled(scanPromises),
          new Promise(resolve => setTimeout(resolve, 60000)), // 60 second max for full scan
        ]);
        
        return {
          success: true,
          devices,
        };
      }),

    // Probe a specific IP for miner info
    probe: protectedProcedure
      .input(z.object({
        ip: z.string()
          .regex(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}$/,
            "Only private network IPs allowed"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Validate IP is in private range
        const parts = input.ip.split('.').map(Number);
        const isPrivate = 
          (parts[0] === 10) ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168);
        
        if (!isPrivate) {
          throw new Error("Only private network IPs are allowed for security");
        }
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(`http://${input.ip}/api/system/info`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              isMiner: true,
              minerType: data.ASICModel?.toLowerCase().includes('bitaxe') ? 'bitaxe' : 
                         data.ASICModel?.toLowerCase().includes('nerd') ? 'nerdqaxe' : 'other',
              model: data.ASICModel || data.deviceModel || 'Unknown',
              hashrate: data.hashRate || 0,
              status: 'online',
              hostname: data.hostname,
              temperature: data.temp,
              fanSpeed: data.fanspeed,
              power: data.power,
            };
          }

          // Fallback: CGMiner API probe (for Avalon, Antminer, Whatsminer, etc.)
          let cgPort = 4028;
          let cgVer = await cgminerCommand(input.ip, "version", 4028);
          
          // Try port 4029 if 4028 fails (some Avalon firmwares)
          if (!cgVer) {
            cgVer = await cgminerCommand(input.ip, "version", 4029);
            if (cgVer) cgPort = 4029;
          }
          
          if (cgVer) {
            // Get STATS and SUMMARY for complete device info
            const cgStats = await cgminerCommand(input.ip, "stats", cgPort);
            const cgSummary = await cgminerCommand(input.ip, "summary", cgPort);
            
            // Identify device (pass VERSION JSON for better detection)
            const identity = inferMinerIdentity(cgVer.json || cgVer.raw || "", cgStats?.json);

            // Extract metrics from summary
            let hashrate = 0;
            let temp: number | null = null;
            let power: number | null = null;
            
            if (cgSummary?.json) {
              const summary = cgSummary.json.SUMMARY?.[0] || cgSummary.json.summary?.[0];
              if (summary) {
                const mhs = summary["MHS av"] || summary.MHS_av || summary["MHS 5m"] || summary.MHS_5m || 0;
                hashrate = mhs / 1000; // Convert to GH/s
              }
            }

            // Try to get temperature/power from stats
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
              power,
            };
          }

          // Fallback: fingerprint common miner web UIs (helps devices with CGMiner API disabled)
          try {
            const controller2 = new AbortController();
            const t2 = setTimeout(() => controller2.abort(), 1500);
            const r2 = await fetch(`http://${input.ip}/`, { signal: controller2.signal });
            clearTimeout(t2);
            if (r2.ok) {
              const html = (await r2.text()).toLowerCase();
              let minerType: string | null = null;
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
                  power: null,
                };
              }
            }
          } catch {
            // ignore
          }
          return {
            success: false,
            isMiner: false,
            minerType: null,
            model: null,
            hashrate: 0,
            status: 'offline',
          };
        } catch (e) {
          return {
            success: false,
            isMiner: false,
            minerType: null,
            model: null,
            hashrate: 0,
            status: 'offline',
          };
        }
      }),
  }),

  // Dashboard stats
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getDashboardStats(ctx.user.id);
    }),

    // Get aggregated stats history for all miners
    statsHistory: protectedProcedure
      .input(z.object({ hours: z.number().default(24) }))
      .query(async ({ ctx, input }) => {
        const miners = await getMinersByUserId(ctx.user.id);
        const allStats: Array<{ minerId: number; recordedAt: number; hashrate: number; temperature: number | null }> = [];
        
        for (const miner of miners) {
          const stats = await getMinerStatsHistory(miner.id, input.hours);
          allStats.push(...stats.map(s => ({
            minerId: miner.id,
            recordedAt: s.recordedAt,
            hashrate: s.hashrate || 0,
            temperature: s.temperature,
          })));
        }
        
        return allStats;
      }),
  }),

  // Stats Router - Miner statistics history
  stats: router({
    history: protectedProcedure
      .input(z.object({ minerId: z.number(), hours: z.number().default(24) }))
      .query(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        const stats = await getMinerStatsHistory(input.minerId, input.hours);
        return stats.map(s => ({
          timestamp: s.recordedAt,
          hashrate: s.hashrate,
          temperature: s.temperature,
          power: s.power,
        }));
      }),
  }),

  // Polling Router - Fetch real-time data from miners
  polling: router({
    // Refresh all miners for the current user
    refreshAll: protectedProcedure.mutation(async ({ ctx }) => {
      const { pollAllMiners } = await import("./minerPolling");
      return pollAllMiners(ctx.user.id);
    }),

    // Refresh a single miner
    refreshOne: protectedProcedure
      .input(z.object({ minerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        const { pollMiner } = await import("./minerPolling");
        const success = await pollMiner({
          id: miner.id,
          userId: miner.userId,
          name: miner.name,
          ipAddress: miner.ipAddress,
          minerType: miner.minerType,
          apiPort: 80,
        });
        return { success };
      }),
  }),

  // Miner Logs Router
  logs: router({
    list: protectedProcedure
      .input(z.object({
        minerId: z.number(),
        limit: z.number().default(100),
      }))
      .query(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return getMinerLogs(input.minerId, input.limit);
      }),

    add: protectedProcedure
      .input(z.object({
        minerId: z.number(),
        logLevel: z.enum(["debug", "info", "warning", "error", "critical"]).default("info"),
        source: z.string().optional(),
        message: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return addMinerLog({
          minerId: input.minerId,
          logLevel: input.logLevel,
          source: input.source ?? null,
          message: input.message,
          metadata: input.metadata ?? null,
        });
      }),

    clear: protectedProcedure
      .input(z.object({ minerId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const miner = await getMinerById(input.minerId);
        if (!miner || miner.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }
        return clearMinerLogs(input.minerId);
      }),
  }),

  // App Settings Router (local auth)
  appSettings: router({
    get: publicProcedure.query(async () => {
      const settings = await getAppSettings();
      if (!settings) {
        return {
          username: "blackaxe",
          theme: "dark",
          appName: "BlackAxe",
        };
      }
      return {
        username: settings.username,
        theme: settings.theme,
        appName: settings.appName,
      };
    }),

    updateCredentials: protectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newUsername: z.string().min(3),
        newPassword: z.string().min(6),
      }))
      .mutation(async ({ ctx, input }) => {
        const isValid = await verifyAppPassword(input.currentPassword);
        if (!isValid) {
          throw new Error("Current password is incorrect");
        }
        await updateAppCredentials(input.newUsername, input.newPassword);
        return { success: true };
      }),

    updateTheme: protectedProcedure
      .input(z.object({
        theme: z.enum(["dark", "light"]),
      }))
      .mutation(async ({ ctx, input }) => {
        await createOrUpdateAppSettings({ theme: input.theme });
        return { success: true };
      }),

    verifyPassword: publicProcedure
      .input(z.object({
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        const isValid = await verifyAppPassword(input.password);
        return { valid: isValid };
      }),
  }),

  // User settings (monitoring thresholds, refresh interval)
  userSettings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserSettings(ctx.user.id);
    }),

    update: protectedProcedure
      .input(z.object({
        tempWarningThreshold: z.number().int().min(0).max(120).optional(),
        tempCriticalThreshold: z.number().int().min(0).max(130).optional(),
        hashrateDropThreshold: z.number().int().min(1).max(100).optional(),
        offlineAlertDelay: z.number().int().min(30).max(3600).optional(),
        fanWarningBelowRpm: z.number().int().min(0).max(20000).optional(),
        fanCriticalBelowRpm: z.number().int().min(0).max(20000).optional(),
        refreshInterval: z.number().int().min(1).max(60).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Basic sanity: warning should be below critical when both provided
        if (input.tempWarningThreshold !== undefined && input.tempCriticalThreshold !== undefined) {
          if (input.tempWarningThreshold > input.tempCriticalThreshold) {
            throw new Error('Temperature warning threshold must be <= critical threshold');
          }
        }
        if (input.fanWarningBelowRpm !== undefined && input.fanCriticalBelowRpm !== undefined) {
          if (input.fanWarningBelowRpm < input.fanCriticalBelowRpm) {
            // warning threshold should generally be above critical threshold
            throw new Error('Fan warning RPM threshold should be >= critical RPM threshold');
          }
        }
        return upsertUserSettings(ctx.user.id, input as any);
      }),
  }),

  // Mempool API Router for real blockchain data
  mempool: router({
    // Solo Mining Pool identifiers
    // These are pools known for solo mining
    
    // Get recent Solo Blocks only from mempool.space
    soloBlocks: publicProcedure
      .input(z.object({
        limit: z.number().default(20),
      }).optional())
      .query(async ({ input }) => {
        try {
          // All known Solo Mining pool slugs/names
          const soloPoolSlugs = [
            'solock', 'solo-ck', 'ckpool',           // CKPool Solo
            'public-pool', 'publicpool',             // Public Pool
            'ckpooleu',                              // CKPool EU
            'solo',                                  // Generic solo
          ];
          const soloPoolNames = [
            'Solo CK', 'solo.ckpool', 'ckpool',
            'public-pool', 'Public Pool', 'public pool',
            'SOLO', 'Solo Miner',
          ];
          
          // Fetch more blocks to find enough solo blocks
          const response = await fetch('https://mempool.space/api/v1/blocks');
          if (!response.ok) throw new Error('Failed to fetch blocks');
          let allBlocks = await response.json();
          
          // Fetch blocks from all known solo pools
          const poolEndpoints = [
            'https://mempool.space/api/v1/mining/pool/solock/blocks',      // Solo CK
            'https://mempool.space/api/v1/mining/pool/publicpool/blocks',  // Public Pool
          ];
          
          let allPoolBlocks: any[] = [];
          for (const endpoint of poolEndpoints) {
            try {
              const poolResponse = await fetch(endpoint);
              if (poolResponse.ok) {
                const blocks = await poolResponse.json();
                allPoolBlocks = [...allPoolBlocks, ...blocks];
              }
            } catch (e) {
              // Continue if one pool fails
            }
          }
          
          // Filter for solo mining pools from recent blocks
          const soloBlocks = allBlocks.filter((block: any) => {
            const poolSlug = block.extras?.pool?.slug?.toLowerCase() || '';
            const poolName = block.extras?.pool?.name?.toLowerCase() || '';
            
            return soloPoolSlugs.some(slug => poolSlug.includes(slug)) ||
                   soloPoolNames.some(name => poolName.toLowerCase().includes(name.toLowerCase())) ||
                   poolName.includes('solo') ||
                   poolSlug.includes('solo');
          });
          
          // Combine with all pool-specific blocks
          const combinedBlocks = [...soloBlocks];
          
          // Add blocks from pool endpoints that aren't already in the list
          for (const block of allPoolBlocks) {
            if (!combinedBlocks.find((b: any) => b.height === block.height)) {
              combinedBlocks.push(block);
            }
          }
          
          // Sort by height descending
          combinedBlocks.sort((a: any, b: any) => b.height - a.height);
          
          return combinedBlocks.slice(0, input?.limit || 20).map((block: any) => ({
            height: block.height,
            hash: block.id,
            timestamp: block.timestamp,
            size: block.size,
            weight: block.weight,
            txCount: block.tx_count,
            difficulty: block.difficulty,
            nonce: block.nonce,
            reward: (block.extras?.reward || 312500000) / 100000000,
            poolName: block.extras?.pool?.name || 'Solo Miner',
            poolSlug: block.extras?.pool?.slug || 'solo',
            isSolo: true,
          }));
        } catch (error) {
          console.error('Error fetching solo blocks from mempool:', error);
          return [];
        }
      }),

    // Get all recent blocks (for reference)
    recentBlocks: publicProcedure
      .input(z.object({
        limit: z.number().default(20),
      }).optional())
      .query(async ({ input }) => {
        try {
          const response = await fetch('https://mempool.space/api/v1/blocks');
          if (!response.ok) throw new Error('Failed to fetch blocks');
          const blocks = await response.json();
          return blocks.slice(0, input?.limit || 20).map((block: any) => ({
            height: block.height,
            hash: block.id,
            timestamp: block.timestamp,
            size: block.size,
            weight: block.weight,
            txCount: block.tx_count,
            difficulty: block.difficulty,
            nonce: block.nonce,
            reward: (block.extras?.reward || 312500000) / 100000000,
            poolName: block.extras?.pool?.name || 'Unknown',
            poolSlug: block.extras?.pool?.slug || 'unknown',
          }));
        } catch (error) {
          console.error('Error fetching blocks from mempool:', error);
          return [];
        }
      }),

    // Get specific block by height
    blockByHeight: publicProcedure
      .input(z.object({
        height: z.number(),
      }))
      .query(async ({ input }) => {
        try {
          const response = await fetch(`https://mempool.space/api/block-height/${input.height}`);
          if (!response.ok) throw new Error('Failed to fetch block');
          const blockHash = await response.text();
          
          const blockResponse = await fetch(`https://mempool.space/api/block/${blockHash}`);
          if (!blockResponse.ok) throw new Error('Failed to fetch block details');
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
            reward: (block.extras?.reward || 312500000) / 100000000,
            poolName: block.extras?.pool?.name || 'Unknown',
            poolSlug: block.extras?.pool?.slug || 'unknown',
          };
        } catch (error) {
          console.error('Error fetching block:', error);
          return null;
        }
      }),

    // Get current blockchain stats
    stats: publicProcedure.query(async () => {
      try {
        const [diffResponse, hashResponse, tipResponse] = await Promise.all([
          fetch('https://mempool.space/api/v1/mining/difficulty-adjustments'),
          fetch('https://mempool.space/api/v1/mining/hashrate/1m'),
          fetch('https://mempool.space/api/blocks/tip/height'),
        ]);
        
        const difficulty = diffResponse.ok ? await diffResponse.json() : [];
        const hashrate = hashResponse.ok ? await hashResponse.json() : { currentHashrate: 0 };
        const tipHeight = tipResponse.ok ? await tipResponse.text() : '0';
        
        return {
          currentHeight: parseInt(tipHeight),
          currentHashrate: hashrate.currentHashrate || 0,
          difficulty: difficulty[0]?.difficultyChange || 0,
          nextDifficultyAdjustment: difficulty[0]?.remainingBlocks || 0,
        };
      } catch (error) {
        console.error('Error fetching mempool stats:', error);
        return {
          currentHeight: 0,
          currentHashrate: 0,
          difficulty: 0,
          nextDifficultyAdjustment: 0,
        };
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
