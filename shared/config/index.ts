/**
 * Shared Configuration Loader
 * 
 * Isomorphic configuration loader that works in both browser and Node.js environments.
 */

import type { MQAConfig, ValidationProfile, ProfileConfig } from '../types';

// Environment detection
const isNode = typeof window === 'undefined';
const isBrowser = !isNode;

// Configuration cache
let configCache: MQAConfig | null = null;

/**
 * Load MQA configuration from the appropriate source
 */
export async function loadMQAConfig(): Promise<MQAConfig> {
  if (configCache) {
    return configCache;
  }

  if (isNode) {
    // Node.js environment - use dynamic import
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      // Try multiple paths to find the config
      const possiblePaths = [
        path.join(process.cwd(), 'src', 'config', 'mqa-config.json'),
        path.join(process.cwd(), 'public', 'data', 'mqa-config.json'),
        path.join(process.cwd(), 'mqa-config.json'),
        path.join(__dirname, '..', '..', 'src', 'config', 'mqa-config.json'),
        path.join(__dirname, '..', '..', 'public', 'data', 'mqa-config.json')
      ];
      
      for (const configPath of possiblePaths) {
        try {
          const content = await fs.readFile(configPath, 'utf-8');
          configCache = JSON.parse(content) as MQAConfig;
          console.log(`✅ Loaded MQA config from: ${configPath}`);
          return configCache;
        } catch {
          continue;
        }
      }
      
      throw new Error('MQA configuration file not found');
    } catch (error) {
      console.error('Failed to load MQA config:', error);
      throw new Error('Configuration not available');
    }
  } else {
    // Browser environment - use fetch
    try {
      let basePath = process.env.PUBLIC_URL || '/';
      if (!basePath.endsWith('/')) basePath += '/';
      
      const response = await fetch(`${basePath}data/mqa-config.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      
      configCache = await response.json() as MQAConfig;
      console.log('✅ Loaded MQA config from browser');
      return configCache;
    } catch (error) {
      console.error('Failed to load MQA config:', error);
      throw new Error('Configuration not available');
    }
  }
}

/**
 * Get profile configuration
 */
export async function getProfileConfig(profile: ValidationProfile): Promise<ProfileConfig> {
  const config = await loadMQAConfig();
  const profileConfig = config.profiles[profile];
  
  if (!profileConfig) {
    throw new Error(`Profile '${profile}' not found in configuration`);
  }
  
  return profileConfig;
}

/**
 * Get metrics configuration for a profile
 */
export async function getProfileMetrics(
  profile: ValidationProfile
): Promise<{ [category: string]: Array<{ id: string; weight: number; property: string }> }> {
  const config = await loadMQAConfig();
  const metricsConfig = config.profile_metrics[profile];
  
  if (!metricsConfig) {
    throw new Error(`Metrics not found for profile '${profile}'`);
  }
  
  return metricsConfig;
}

/**
 * Get SHACL files for a profile and version
 */
export async function getSHACLFiles(
  profile: ValidationProfile, 
  version?: string
): Promise<string[]> {
  const profileConfig = await getProfileConfig(profile);
  const targetVersion = version || profileConfig.defaultVersion;
  const versionConfig = profileConfig.versions[targetVersion];
  
  if (!versionConfig) {
    throw new Error(`Version '${targetVersion}' not found for profile '${profile}'`);
  }
  
  return versionConfig.shaclFiles || [];
}

/**
 * Get app info from configuration
 */
export async function getAppInfo(): Promise<MQAConfig['app_info']> {
  const config = await loadMQAConfig();
  return config.app_info;
}

/**
 * Get available profiles
 */
export async function getAvailableProfiles(): Promise<{ [key: string]: ProfileConfig }> {
  const config = await loadMQAConfig();
  return config.profiles;
}

/**
 * Clear configuration cache (useful for testing or hot reload)
 */
export function clearConfigCache(): void {
  configCache = null;
  console.log('✅ Configuration cache cleared');
}

export default {
  loadMQAConfig,
  getProfileConfig,
  getProfileMetrics,
  getSHACLFiles,
  getAppInfo,
  getAvailableProfiles,
  clearConfigCache
};
