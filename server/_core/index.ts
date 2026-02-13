import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createLocalContext } from "./localContext";
import { registerLocalAuthRoutes } from "./localAuth";
import { serveStatic, setupVite } from "./vite";
import { initializeDatabase } from "../db";
import { startPollingService } from "../minerPolling";

const PORT = parseInt(process.env.PORT || "30211");
const HOST = process.env.HOST || "127.0.0.1";

async function startServer() {
  // Initialize SQLite database
  await initializeDatabase();
  
  const app = express();
  const server = createServer(app);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Local authentication routes
  registerLocalAuthRoutes(app);
  
  // tRPC API with local context
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createLocalContext,
    })
  );
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  server.listen(PORT, HOST, () => {
    console.log(`\n🔥 BlackAxe Mining Manager`);
    console.log(`📍 Running on http://${HOST}:${PORT}/`);
    console.log(`🔒 Local authentication enabled`);
    console.log(`\n💡 Default credentials: blackaxe / blackaxe`);
    console.log(`⚠️  Please change the password after first login!\n`);
    
    // Start miner polling service
    startPollingService();
  });
}

startServer().catch(console.error);
