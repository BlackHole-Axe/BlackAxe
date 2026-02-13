/**
 * Miner identification helpers.
 *
 * Primary goal: correctly fingerprint Avalon/Canaan miners during network scan even when
 * the "version" command is generic or hidden.
 *
 * Patterns are based on public Avalon tooling (e.g. AvalonPS7) that reads STATS fields like
 * "MM ID0" or "MM ID0:Summary".
 */

export type MinerIdentity = {
  minerType: "bitaxe" | "nerdqaxe" | "avalon" | "antminer" | "whatsminer" | "canaan" | "other";
  model: string;
};

function safeLower(v: any): string {
  return (v ?? "").toString().toLowerCase();
}

/**
 * Extract Avalon model from a STATS JSON payload.
 * Enhanced detection based on AvalonPS7 and Public Pool patterns.
 */
export function inferAvalonModelFromStats(statsJson: any): string | null {
  try {
    // Handle both STATS array and direct object
    const statsList = (() => {
      if (!statsJson) return [];
      if (Array.isArray(statsJson)) return statsJson;
      if (statsJson.STATS) {
        return Array.isArray(statsJson.STATS) ? statsJson.STATS : [statsJson.STATS];
      }
      // Sometimes it's wrapped differently
      if (typeof statsJson === 'object') return [statsJson];
      return [];
    })();

    for (const s of statsList) {
      if (!s || typeof s !== "object") continue;

      // Pattern 1: Check "MM ID" fields (Avalon Nano 3S, Avalon Q)
      // These fields contain the actual device model information
      const mmFields = [
        s["MM ID0"],
        s["MM ID1"], 
        s["MM ID2"],
        s["MM ID3"],
        s["MM ID"],
        s["MM ID0:Summary"],
        s["MM ID1:Summary"],
        s["ID"],
      ].filter(Boolean);

      for (const mmValue of mmFields) {
        const text = String(mmValue).toLowerCase();
        
        // Nano detection (various patterns)
        if (text.includes("nano3s") || text.includes("nano 3s")) return "Avalon Nano 3S";
        if (text.includes("nano")) return "Avalon Nano";
        
        // Avalon Q detection
        if (text.includes("avalon q") || /\bq\b/.test(text)) return "Avalon Q";
        
        // AvalonMiner with model number (e.g., 1246, 1166, 1066)
        const modelMatch = text.match(/(?:avalon|miner|model)[\s_-]*([0-9]{3,4})/i);
        if (modelMatch) return `AvalonMiner ${modelMatch[1]}`;
        
        // Model[1246] format
        const bracketMatch = text.match(/model\s*\[\s*([0-9]{3,4})\s*\]/i);
        if (bracketMatch) return `AvalonMiner ${bracketMatch[1]}`;
      }

      // Pattern 2: Check Type/Model/Description fields
      const infoFields = [
        s.Type,
        s.Model,
        s.Description,
        s.DeviceModel,
        s.Desc,
        s.Name,
      ].filter(Boolean).map(v => String(v).toLowerCase()).join(" ");

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

      // Pattern 3: Check for Canaan-specific identifiers
      if (s.ID && String(s.ID).toLowerCase().includes("canaan")) {
        return "Canaan Avalon";
      }
    }
  } catch (err) {
    console.error("[minerIdentify] Error parsing Avalon STATS:", err);
  }

  return null;
}

/**
 * Infer miner type/model from CGMiner responses.
 * @param versionRaw - Can be raw string OR parsed JSON object from cgminerCommand
 * @param statsJson - Optional STATS JSON for enhanced detection
 */
export function inferMinerIdentity(versionRaw: string | any, statsJson?: any): MinerIdentity {
  // Try to parse VERSION JSON if it's a string
  let versionJson: any = null;
  if (typeof versionRaw === 'object' && versionRaw !== null) {
    versionJson = versionRaw;
  } else if (typeof versionRaw === 'string') {
    try {
      versionJson = JSON.parse(versionRaw);
    } catch {
      // Not JSON, use as string
    }
  }

  // Check VERSION JSON first (most reliable for Avalon Q)
  if (versionJson && versionJson.VERSION && Array.isArray(versionJson.VERSION)) {
    const ver = versionJson.VERSION[0];
    if (ver) {
      // Check PROD field (Avalon Q has "PROD":"Avalon Q")
      if (ver.PROD) {
        const prod = String(ver.PROD);
        if (prod.includes("Avalon Q") || prod === "Q") {
          return { minerType: "avalon", model: "Avalon Q" };
        }
        // Fix "Avalonnano" -> "Avalon Nano"
        const prodLower = prod.toLowerCase();
        if (prodLower === "avalonnano" || prodLower === "avalon nano") {
          return { minerType: "avalon", model: "Avalon Nano" };
        }
        if (prod.includes("Nano")) {
          // Ensure proper spacing
          const formatted = prod.includes("Avalon") ? prod : `Avalon ${prod}`;
          return { minerType: "avalon", model: formatted };
        }
        if (prod.includes("Avalon")) {
          return { minerType: "avalon", model: prod };
        }
      }
      
      // Check MODEL field
      if (ver.MODEL) {
        const model = String(ver.MODEL);
        if (model === "Q") {
          return { minerType: "avalon", model: "Avalon Q" };
        }
        if (model.includes("Nano")) {
          return { minerType: "avalon", model: `Avalon ${model}` };
        }
        // AvalonMiner numbers (1246, 1166, etc.)
        if (/^[0-9]{3,4}$/.test(model)) {
          return { minerType: "avalon", model: `AvalonMiner ${model}` };
        }
      }
    }
  }

  // Try stats for Avalon (secondary method)
  const avalonModel = statsJson ? inferAvalonModelFromStats(statsJson) : null;
  if (avalonModel) return { minerType: "avalon", model: avalonModel };

  // Fallback to string parsing
  const v = safeLower(typeof versionRaw === 'string' ? versionRaw : JSON.stringify(versionRaw));
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
