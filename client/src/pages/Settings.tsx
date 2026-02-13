import BlackAxeLayout from "@/components/BlackAxeLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { 
  Settings as SettingsIcon, 
  Save,
  RefreshCw,
  Shield,
  User,
  Lock,
  Eye,
  EyeOff,
  Info,
  AlertTriangle
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Settings() {
  const [isSaving, setIsSaving] = useState(false);
  
  // Credentials
  const [currentPassword, setCurrentPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Password visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Get current app settings
  const { data: appSettings } = trpc.appSettings.get.useQuery();

  // Get monitoring/user settings
  const { data: userSettings, refetch: refetchUserSettings } = trpc.userSettings.get.useQuery();

  const [monitoring, setMonitoring] = useState({
    tempWarningThreshold: 70,
    tempCriticalThreshold: 80,
    fanWarningBelowRpm: 1000,
    fanCriticalBelowRpm: 500,
    refreshInterval: 3,
  });

  useEffect(() => {
    if (userSettings) {
      setMonitoring({
        tempWarningThreshold: userSettings.tempWarningThreshold ?? 70,
        tempCriticalThreshold: userSettings.tempCriticalThreshold ?? 80,
        fanWarningBelowRpm: (userSettings as any).fanWarningBelowRpm ?? 1000,
        fanCriticalBelowRpm: (userSettings as any).fanCriticalBelowRpm ?? 500,
        refreshInterval: (userSettings as any).refreshInterval ?? 3,
      });
    }
  }, [userSettings]);

  const updateUserSettings = trpc.userSettings.update.useMutation({
    onSuccess: async () => {
      await refetchUserSettings();
      toast.success("Monitoring settings saved successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save monitoring settings");
    },
  });
  
  // Update credentials mutation
  const updateCredentials = trpc.appSettings.updateCredentials.useMutation({
    onSuccess: () => {
      toast.success("Credentials updated successfully");
      // Clear form
      setCurrentPassword("");
      setNewUsername("");
      setNewPassword("");
      setConfirmPassword("");
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update credentials");
      setIsSaving(false);
    },
  });

  const handleSaveCredentials = async () => {
    // Validation
    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    
    if (newUsername && newUsername.length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    
    if (newPassword) {
      if (newPassword.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
      
      // Password strength check
      const hasUpperCase = /[A-Z]/.test(newPassword);
      const hasLowerCase = /[a-z]/.test(newPassword);
      const hasNumbers = /\d/.test(newPassword);
      
      if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
        toast.error("Password must contain uppercase, lowercase, and numbers");
        return;
      }
      
      if (newPassword !== confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }
    }
    
    if (!newUsername && !newPassword) {
      toast.error("Please enter a new username or password");
      return;
    }

    setIsSaving(true);
    
    // Call the API to update credentials
    updateCredentials.mutate({
      currentPassword,
      newUsername: newUsername || appSettings?.username || "blackaxe",
      newPassword: newPassword || currentPassword, // Keep current if not changing
    });
  };
  const handleSaveMonitoring = async () => {
    if (monitoring.tempWarningThreshold > monitoring.tempCriticalThreshold) {
      toast.error("Temperature warning threshold must be less than or equal to the critical threshold");
      return;
    }
    if (monitoring.fanWarningBelowRpm < monitoring.fanCriticalBelowRpm) {
      toast.error("Fan warning RPM threshold should be greater than or equal to the critical RPM threshold");
      return;
    }
    if (monitoring.refreshInterval < 1 || monitoring.refreshInterval > 60) {
      toast.error("Refresh interval must be between 1 and 60 seconds");
      return;
    }

    updateUserSettings.mutate({
      tempWarningThreshold: monitoring.tempWarningThreshold,
      tempCriticalThreshold: monitoring.tempCriticalThreshold,
      fanWarningBelowRpm: monitoring.fanWarningBelowRpm,
      fanCriticalBelowRpm: monitoring.fanCriticalBelowRpm,
      refreshInterval: monitoring.refreshInterval,
    });
  };


  return (
    <BlackAxeLayout>
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your BlackAxe account credentials</p>
        </div>

        {/* Security Warning */}
        <Card className="cyber-card border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">Security Recommendation</p>
                <p className="text-sm text-muted-foreground mt-1">
                  For security, please set a strong password on first use. 
                  Passwords are encrypted with bcrypt before storage.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="cyber-card border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-primary">Password Requirements</p>
                <ul className="text-sm text-muted-foreground mt-1 list-disc list-inside space-y-1">
                  <li>Minimum 6 characters</li>
                  <li>At least one uppercase letter (A-Z)</li>
                  <li>At least one lowercase letter (a-z)</li>
                  <li>At least one number (0-9)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Credentials */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Change Credentials
            </CardTitle>
            <CardDescription>
              Update your username and password for BlackAxe access
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Password */}
            <div className="space-y-2">
              <Label htmlFor="current-password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Current Password
              </Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            {/* New Username */}
            <div className="space-y-2">
              <Label htmlFor="new-username" className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                New Username
              </Label>
              <Input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={`Current: ${appSettings?.username || "blackaxe"}`}
                autoComplete="username"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to keep current username
              </p>
            </div>

            {/* New Password */}
            <div className="space-y-2">
              <Label htmlFor="new-password" className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (optional)"
                  className="pr-10"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to keep current password. Must meet requirements above.
              </p>
            </div>

            {/* Confirm Password */}
            {newPassword && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
            )}

            <Separator />

            <Button 
              onClick={handleSaveCredentials} 
              disabled={isSaving || updateCredentials.isPending}
              className="w-full"
            >
              {isSaving || updateCredentials.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Update Credentials
            </Button>
          </CardContent>
        </Card>

        {/* Monitoring */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Monitoring & Refresh
            </CardTitle>
            <CardDescription>
              Configure alert thresholds and the UI refresh interval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temp-warn">Temperature warning (°C)</Label>
                <Input
                  id="temp-warn"
                  type="number"
                  value={monitoring.tempWarningThreshold}
                  onChange={(e) => setMonitoring((s) => ({ ...s, tempWarningThreshold: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Triggers a warning alert when temperature is at or above this value
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="temp-crit">Temperature critical (°C)</Label>
                <Input
                  id="temp-crit"
                  type="number"
                  value={monitoring.tempCriticalThreshold}
                  onChange={(e) => setMonitoring((s) => ({ ...s, tempCriticalThreshold: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Triggers a critical alert when temperature is at or above this value
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fan-warn">Fan warning below (RPM)</Label>
                <Input
                  id="fan-warn"
                  type="number"
                  value={monitoring.fanWarningBelowRpm}
                  onChange={(e) => setMonitoring((s) => ({ ...s, fanWarningBelowRpm: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Triggers a warning alert when fan RPM is at or below this value
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fan-crit">Fan critical below (RPM)</Label>
                <Input
                  id="fan-crit"
                  type="number"
                  value={monitoring.fanCriticalBelowRpm}
                  onChange={(e) => setMonitoring((s) => ({ ...s, fanCriticalBelowRpm: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  Triggers a critical alert when fan RPM is at or below this value
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="refresh-interval">Refresh interval (seconds)</Label>
              <Input
                id="refresh-interval"
                type="number"
                value={monitoring.refreshInterval}
                onChange={(e) => setMonitoring((s) => ({ ...s, refreshInterval: Number(e.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">
                Controls how often the dashboard and miners list refresh device data
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveMonitoring}
                disabled={updateUserSettings.isPending}
              >
                {updateUserSettings.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Monitoring Settings
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card className="cyber-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-primary" />
              About BlackAxe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-mono">1.0.0</p>
              </div>
              <div>
                <p className="text-muted-foreground">Platform</p>
                <p className="font-mono">Umbrel Home</p>
              </div>
              <div>
                <p className="text-muted-foreground">License</p>
                <p className="font-mono">MIT</p>
              </div>
              <div>
                <p className="text-muted-foreground">Build</p>
                <p className="font-mono">2025.01.15</p>
              </div>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">
              BlackAxe is a professional mining device management platform designed for Umbrel Home. 
              Monitor, control, and optimize your ASIC miners from a single dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    </BlackAxeLayout>
  );
}
