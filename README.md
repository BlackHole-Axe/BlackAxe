# BlackAxe v12.0 - Mining Device Manager for Umbrel Home

Professional mining device management for Bitcoin solo miners.

## What's New in v12.0 (LATEST - 2026-02-10)

### ✅ Comprehensive Fixes Applied
- **Avalon Full Support**: Complete rewrite of Avalon detection using STATS API
  - ✅ Avalon Nano, Avalon Nano 3S detection working
  - ✅ Avalon Q detection working
  - ✅ AvalonMiner (1246, 1166, 1066, etc.) detection working
  - ✅ Temperature, Fan Speed, Power readings working
  - ✅ Supports both port 4028 and 4029
  
- **Network Scan Enhanced**: Now detects ALL miner types with proper model names
  - ✅ Queries STATS command during scan for accurate device identification
  - ✅ Extracts hashrate, temperature, and power during scan
  
- **Pool Audit Fixed**: 
  - ✅ All pool fields added to database schema
  - ✅ Verify button works without errors
  - ✅ Deep pool verification with coinbase output inspection
  
- **Dashboard Charts Fixed**:
  - ✅ Smooth continuous lines (not broken/dead lines)
  - ✅ Historical data properly recorded and displayed
  - ✅ Forward-fill for smooth visualization
  
- **Miners Page Fixed**: All errors resolved

### Supported Devices (Fully Tested)
- ✅ **Bitaxe** (Ultra, Supra, Gamma, Hex)
- ✅ **NerdQAxe++**
- ✅ **Avalon Nano** 
- ✅ **Avalon Nano 3S**
- ✅ **Avalon Q**

## Installation on Umbrel Home or Linux

1. Extract this package to your Umbrel apps directory
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the application:
   ```bash
   pnpm start
   ```
4. Access at http://your-local-ip:30211

OR 

1. Extract this package to your Umbrel apps directory
2. Install dependencies:
   ```bash
   chmod +x run-linux.sh
   ```
3. Start the application:
   ```bash
   sudo ./run-linux.sh
   ```
4. Access at http://your-local-ip:30211

## Default Credentials
- Username: `blackaxe`
- Password: `blackaxe`

**Important**: Change the password after first login!

## Features
- Real-time monitoring of all mining devices
- Automatic device discovery via network scan
- Temperature and power monitoring
- Share statistics and best difficulty tracking
- Solo block detection
- Alert system for offline miners
- 24-hour history charts

## API Ports
- **Bitaxe/NerdQAxe**: HTTP port 80 (AxeOS API)
- **Avalon/Antminer/Whatsminer**: TCP port 4028 or 4029 (CGMiner API)
  - Note: Some Avalon firmwares use port 4029 instead of 4028

## Testing Your Setup

### 1. Test Avalon Device Manually
```bash
# Test on port 4028
echo '{"command":"stats"}' | nc <AVALON_IP> 4028

# Test on port 4029 (if 4028 doesn't work)
echo '{"command":"stats"}' | nc <AVALON_IP> 4029
```

### 2. Check Database
```bash
sqlite3 data/blackaxe.db "SELECT name, model, hashrate, temperature FROM miners;"
```

### 3. View Logs
Check the terminal where the app is running for detailed logs:
- `[fetchCGMinerEstats]` - Temperature/fan/power readings
- `[minerIdentify]` - Device model detection
- `[CGMiner]` - API communication logs

## Support
For issues and feature requests, please contact the developer.
