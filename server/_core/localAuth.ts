import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { ENV } from "./env";
import type { User } from "../db";

// Session payload type
export type LocalSessionPayload = {
  userId: number;
  username: string;
};

// Get JWT secret
function getSessionSecret() {
  // Use a default secret for local development if not set
  const secret = ENV.cookieSecret || "blackaxe-local-secret-key-change-in-production";
  return new TextEncoder().encode(secret);
}

// Create session token
export async function createLocalSessionToken(
  userId: number,
  username: string,
  expiresInMs: number = ONE_YEAR_MS
): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({
    userId,
    username,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

// Verify session token
export async function verifyLocalSession(
  cookieValue: string | undefined | null
): Promise<LocalSessionPayload | null> {
  if (!cookieValue) {
    return null;
  }

  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(cookieValue, secretKey, {
      algorithms: ["HS256"],
    });
    
    const { userId, username } = payload as Record<string, unknown>;

    if (typeof userId !== "number" || typeof username !== "string") {
      return null;
    }

    return { userId, username };
  } catch (error) {
    console.warn("[LocalAuth] Session verification failed");
    return null;
  }
}

// Parse cookies from request
function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) {
    return new Map();
  }
  
  const cookies = new Map<string, string>();
  cookieHeader.split(";").forEach(cookie => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies.set(name, rest.join("="));
    }
  });
  return cookies;
}

// Authenticate request using local session
export async function authenticateLocalRequest(req: Request): Promise<User | null> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  
  const session = await verifyLocalSession(sessionCookie);
  if (!session) {
    return null;
  }

  // Get user from database by ID
  const user = await db.getUserById(session.userId);
  return user || null;
}

// Register local auth routes
export function registerLocalAuthRoutes(app: Express) {
  // Login endpoint
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      // Verify credentials
      const isValid = await db.verifyAppPassword(password);
      const settings = await db.getAppSettings();
      
      if (!isValid || settings?.username !== username) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      // Create or get local user
      let user = await db.getUserByOpenId(`local:${username}`);
      console.log("[LocalAuth] Existing user:", user ? user.id : "none");
      
      if (!user) {
        // Create local user
        console.log("[LocalAuth] Creating new user...");
        try {
          await db.upsertUser({
            openId: `local:${username}`,
            name: username,
            email: null,
            loginMethod: "local",
            role: "admin", // First user is admin
            lastSignedIn: new Date(),
          });
          console.log("[LocalAuth] User created, fetching...");
          user = await db.getUserByOpenId(`local:${username}`);
          console.log("[LocalAuth] Fetched user:", user ? user.id : "none");
        } catch (createError) {
          console.error("[LocalAuth] Failed to create user:", createError);
          res.status(500).json({ error: "Failed to create user: " + String(createError) });
          return;
        }
      } else {
        // Update last signed in
        await db.upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });
      }

      if (!user) {
        console.error("[LocalAuth] User is still null after creation");
        res.status(500).json({ error: "Failed to create user session - user not found after creation" });
        return;
      }

      // Create session token
      const sessionToken = await createLocalSessionToken(user.id, username);

      // Set cookie
      res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: false, // localhost doesn't use HTTPS
        sameSite: "lax",
        maxAge: ONE_YEAR_MS,
        path: "/",
      });

      res.json({ 
        success: true, 
        user: {
          id: user.id,
          name: user.name,
          username: username,
        }
      });
    } catch (error) {
      console.error("[LocalAuth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  });

  // Check session endpoint
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await authenticateLocalRequest(req);
      
      if (!user) {
        res.json({ user: null });
        return;
      }

      const settings = await db.getAppSettings();
      
      res.json({
        user: {
          id: user.id,
          name: user.name,
          username: settings?.username || "blackaxe",
          role: user.role,
        }
      });
    } catch (error) {
      res.json({ user: null });
    }
  });
}
