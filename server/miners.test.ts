import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database functions
vi.mock("./db", () => ({
  getMinersByUserId: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Bitaxe-001",
      minerType: "bitaxe",
      model: "Gamma 601",
      status: "online",
      hashrate: 1.85,
      temperature: 56,
      power: 15,
      userId: 1,
    },
    {
      id: 2,
      name: "NerdQaxe-001",
      minerType: "nerdqaxe",
      model: "NerdQaxe++",
      status: "online",
      hashrate: 0.45,
      temperature: 52,
      power: 8,
      userId: 1,
    },
  ]),
  getMinerById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) {
      return Promise.resolve({
        id: 1,
        name: "Bitaxe-001",
        minerType: "bitaxe",
        model: "Gamma 601",
        status: "online",
        hashrate: 1.85,
        temperature: 56,
        power: 15,
        userId: 1,
      });
    }
    return Promise.resolve(undefined);
  }),
  createMiner: vi.fn().mockResolvedValue(3),
  updateMiner: vi.fn().mockResolvedValue(undefined),
  deleteMiner: vi.fn().mockResolvedValue(undefined),
  getMinerStatsHistory: vi.fn().mockResolvedValue([]),
  recordMinerStats: vi.fn().mockResolvedValue(undefined),
  getAlertsByUserId: vi.fn().mockResolvedValue([]),
  getUnreadAlerts: vi.fn().mockResolvedValue([]),
  createAlert: vi.fn().mockResolvedValue(1),
  markAlertAsRead: vi.fn().mockResolvedValue(undefined),
  acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
  markAllAlertsAsRead: vi.fn().mockResolvedValue(undefined),
  getUserSettings: vi.fn().mockResolvedValue(null),
  upsertUserSettings: vi.fn().mockResolvedValue(undefined),
  getRecentSoloBlocks: vi.fn().mockResolvedValue([]),
  addSoloBlock: vi.fn().mockResolvedValue(undefined),
  getDashboardStats: vi.fn().mockResolvedValue({
    totalMiners: 2,
    onlineMiners: 2,
    offlineMiners: 0,
    warningMiners: 0,
    totalHashrate: 2.3,
    totalPower: 23,
    avgTemperature: 54,
    totalAccepted: 1000,
    totalRejected: 5,
    efficiency: 10,
  }),
  getMinerGroupsByUserId: vi.fn().mockResolvedValue([]),
  createMinerGroup: vi.fn().mockResolvedValue(1),
  updateMinerGroup: vi.fn().mockResolvedValue(undefined),
  deleteMinerGroup: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockResolvedValue({
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "oauth",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createPublicContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("miners router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists miners for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.miners.list();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Bitaxe-001");
    expect(result[1].name).toBe("NerdQaxe-001");
  });

  it("gets a specific miner by id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.miners.get({ id: 1 });

    expect(result).toBeDefined();
    expect(result?.name).toBe("Bitaxe-001");
    expect(result?.minerType).toBe("bitaxe");
  });

  it("creates a new miner", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.miners.create({
      name: "New-Miner",
      minerType: "bitaxe",
      ipAddress: "192.168.1.200",
    });

    expect(result).toBe(3);
  });
});

describe("dashboard router", () => {
  it("returns dashboard stats for authenticated user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.dashboard.stats();

    expect(result).toBeDefined();
    expect(result?.totalMiners).toBe(2);
    expect(result?.onlineMiners).toBe(2);
    expect(result?.totalHashrate).toBe(2.3);
  });
});

describe("soloBlocks router", () => {
  it("lists solo blocks without authentication", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.soloBlocks.list();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("network router", () => {
  it("scans network and returns device array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.network.scan({ subnet: "192.168.1.0/24" });

    // In test environment, no real devices will be found
    expect(result.success).toBe(true);
    expect(Array.isArray(result.devices)).toBe(true);
  }, 35000); // 35 second timeout for network scan

  it("rejects public IP ranges for security", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should reject public IP ranges
    await expect(
      caller.network.scan({ subnet: "8.8.8.0/24" })
    ).rejects.toThrow();
  });

  it("rejects public IP in probe for security", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should reject public IP
    await expect(
      caller.network.probe({ ip: "8.8.8.8" })
    ).rejects.toThrow();
  });

  it("accepts private IP ranges", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should accept private IP (will fail to connect but not throw validation error)
    const result = await caller.network.probe({ ip: "192.168.1.1" });
    // Result will be offline since no real device exists
    expect(result).toBeDefined();
  }, 10000);
});
