import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Zap, 
  Github, 
  Heart, 
  Code2, 
  Users, 
  Coffee,
  ExternalLink,
  Cpu,
  Shield,
  Sparkles,
  Bitcoin,
  Copy,
  Check
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import BlackAxeLayout from "@/components/BlackAxeLayout";

const DONATION_ADDRESS = "bc1qdqqyez86m22mu55gjz4x58nyt59sxsr96t9uax";

export default function About() {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy address", err);
    }
  };

  return (
    <BlackAxeLayout>
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" />
            About BlackAxe
          </h1>
          <p className="text-muted-foreground">Mining Manager for Umbrel Home</p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* Main Info */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Project Info */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              BlackAxe Mining Manager
            </CardTitle>
            <CardDescription>Version 1.0.0</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              BlackAxe is a professional mining device management platform designed specifically 
              for Umbrel Home. Monitor, control, and optimize your Bitcoin mining operation 
              with real-time data, beautiful charts, and comprehensive device management.
            </p>
            
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm">
                <Cpu className="w-4 h-4 text-primary" />
                <span>Multi-Device Support</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-green-500" />
                <span>Self-Hosted</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Zap className="w-4 h-4 text-yellow-500" />
                <span>Real-time Monitoring</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Code2 className="w-4 h-4 text-blue-500" />
                <span>Open Source</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Developer Info */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              Developer
            </CardTitle>
            <CardDescription>Created with passion</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">BH</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold">BlackHole</h3>
                <p className="text-sm text-muted-foreground">Solo Developer</p>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground leading-relaxed">
              Passionate about Bitcoin, solo mining, and building tools that empower 
              individual miners. BlackAxe was built to give solo miners the same 
              professional monitoring capabilities as large mining operations.
            </p>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Github className="w-4 h-4" />
                GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Special Thanks */}
      <Card className="cyber-card border-yellow-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            Special Thanks
          </CardTitle>
          <CardDescription>Gratitude to those who inspired this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* HashWatcher Thanks */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-yellow-500/10 to-orange-500/5 border border-yellow-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <h4 className="font-semibold">HashWatcher</h4>
                  <p className="text-xs text-muted-foreground">Mining Dashboard App</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Special thanks to the HashWatcher team for inspiring the solo mining community 
                with their excellent mobile app. Their work motivated the creation of BlackAxe 
                as a self-hosted web alternative for Umbrel users.
              </p>
            </div>

            {/* Open Source Community */}
            <div className="p-4 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h4 className="font-semibold">Open Source Community</h4>
                  <p className="text-xs text-muted-foreground">Bitcoin & Mining Projects</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Thanks to the entire open source community, especially the Bitaxe project, 
                AxeOS developers, Umbrel team, and all the solo miners who share their 
                knowledge and tools freely.
              </p>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Additional Thanks */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-card/50">
              <p className="font-medium text-sm">Bitaxe Project</p>
              <p className="text-xs text-muted-foreground">Open Source ASIC</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-card/50">
              <p className="font-medium text-sm">AxeOS</p>
              <p className="text-xs text-muted-foreground">Miner Firmware</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-card/50">
              <p className="font-medium text-sm">Umbrel</p>
              <p className="text-xs text-muted-foreground">Home Server OS</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-card/50">
              <p className="font-medium text-sm">Mempool.space</p>
              <p className="text-xs text-muted-foreground">Block Explorer API</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Supported Devices */}
      <Card className="cyber-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            Supported Mining Devices
          </CardTitle>
          <CardDescription>Compatible hardware for BlackAxe</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { name: "Bitaxe", desc: "Ultra/Supra/Hex" },
              { name: "NerdQaxe++", desc: "Solo Miner" },
              { name: "Avalon Nano", desc: "Canaan Miners" },
              { name: "Antminer", desc: "S9/S19 Series" },
              { name: "Whatsminer", desc: "M Series" },
              { name: "Custom", desc: "CGMiner API" },
            ].map((device) => (
              <div key={device.name} className="text-center p-3 rounded-lg bg-card/50 border border-border/50">
                <p className="font-medium text-sm">{device.name}</p>
                <p className="text-xs text-muted-foreground">{device.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card className="cyber-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-primary" />
            Technology Stack
          </CardTitle>
          <CardDescription>Built with modern technologies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "React 19", category: "Frontend" },
              { name: "TypeScript", category: "Language" },
              { name: "Tailwind CSS", category: "Styling" },
              { name: "tRPC", category: "API" },
              { name: "Express", category: "Backend" },
              { name: "Drizzle ORM", category: "Database" },
              { name: "Recharts", category: "Charts" },
              { name: "Umbrel", category: "Platform" },
            ].map((tech) => (
              <div key={tech.name} className="p-3 rounded-lg bg-card/50 border border-border/50">
                <p className="font-medium text-sm">{tech.name}</p>
                <p className="text-xs text-muted-foreground">{tech.category}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Support the Project */}
      <Card className="cyber-card bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-orange-500" />
            Support the Project
          </CardTitle>
          <CardDescription>Help keep BlackAxe free and open-source</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            BlackAxe is free and open-source. If you find it useful, consider supporting 
            the development with a Bitcoin donation. Every sat helps keep this project alive!
          </p>

          <div className="p-4 rounded-lg bg-background/50 border border-border/50">
            <p className="text-sm text-muted-foreground mb-2">Bitcoin Address (Native SegWit)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-foreground break-all">
                {DONATION_ADDRESS}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copyAddress}
                className="shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Thank you for your support! 🧡
          </p>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground pt-4">
        <p>Made with <Heart className="w-4 h-4 inline text-red-500" /> by BlackHole</p>
        <p className="mt-1">BlackAxe v1.0.0 • Open Source • MIT License</p>
      </div>
    </div>
    </BlackAxeLayout>
  );
}
