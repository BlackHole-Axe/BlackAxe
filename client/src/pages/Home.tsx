import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { 
  Zap, 
  Cpu, 
  Radar, 
  Shield, 
  Activity, 
  Blocks,
  ArrowRight,
  Github,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect } from "react";

const features = [
  {
    icon: Cpu,
    title: "Multi-Device Support",
    description: "Monitor Bitaxe, NerdQaxe++, Avalon, Antminer, and other ASIC miners from a single dashboard."
  },
  {
    icon: Radar,
    title: "Auto Network Scan",
    description: "Automatically discover mining devices on your local network with intelligent device detection."
  },
  {
    icon: Activity,
    title: "Real-Time Metrics",
    description: "Track hashrate, temperature, power consumption, and shares with live updates."
  },
  {
    icon: Shield,
    title: "Safe Controls",
    description: "Adjust overclocking, fan speeds, and pool settings with built-in safety limits."
  },
  {
    icon: Blocks,
    title: "Block Discovery",
    description: "Get instant notifications when any of your devices finds a block."
  },
  {
    icon: Zap,
    title: "Umbrel Ready",
    description: "Designed specifically for Umbrel Home with seamless integration."
  }
];

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Zap className="w-12 h-12 text-primary animate-pulse" />
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 cyber-grid opacity-30" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-glow-cyan opacity-30" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[600px] bg-glow-purple opacity-20" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Zap className="w-8 h-8 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
            </div>
            <span className="font-bold text-xl">BlackAxe</span>
          </div>
          <Button onClick={() => window.location.href = getLoginUrl()}>
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 py-20 lg:py-32">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary">For Umbrel Home</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              <span className="text-gradient-cyan-purple">Professional Mining</span>
              <br />
              <span className="text-foreground">Device Management</span>
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Monitor and control all your ASIC miners from one powerful dashboard. 
              Real-time metrics, automatic device discovery, and safe overclocking controls.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg" 
                className="neon-glow-cyan w-full sm:w-auto"
                onClick={() => window.location.href = getLoginUrl()}
              >
                Launch Dashboard
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="w-full sm:w-auto"
                asChild
              >
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Github className="w-5 h-5 mr-2" />
                  View on GitHub
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 py-20 border-t border-border/50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Powerful Features</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage your mining operation efficiently
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="cyber-card p-6 hover:neon-glow-cyan transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Devices */}
      <section className="relative z-10 py-20 border-t border-border/50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Supported Devices</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Compatible with all major ASIC mining hardware
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {["Bitaxe", "NerdQaxe++", "Avalon", "Antminer", "Whatsminer", "Canaan"].map((device) => (
              <div 
                key={device}
                className="px-6 py-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <span className="font-medium">{device}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-20 border-t border-border/50">
        <div className="container">
          <div className="cyber-card p-8 lg:p-12 text-center max-w-3xl mx-auto">
            <Zap className="w-16 h-16 text-primary mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Ready to Start Mining?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Take control of your mining operation with BlackAxe. 
              Monitor, manage, and optimize all your devices from one place.
            </p>
            <Button 
              size="lg" 
              className="neon-glow-cyan"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Get Started Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-border/50">
        <div className="container">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-semibold">BlackAxe</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for Umbrel Home. Open source mining management.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
