import { ValidationProfile } from '../types';
import mqaConfigData from '../config/mqa-config.json';

/**
 * Obtener configuración del perfil desde mqa-config.json
 */
function getProfileConfig(profile: ValidationProfile) {
  const mqaConfig = mqaConfigData as any;
  const profileConfig = mqaConfig.profiles[profile];
  if (!profileConfig) {
    console.warn(`Profile ${profile} not found in mqa-config.json`);
    return null;
  }
  
  const defaultVersion = profileConfig.defaultVersion;
  const versionConfig = profileConfig.versions?.[defaultVersion];
  
  return {
    maxScore: versionConfig?.maxScore || 405,
    name: versionConfig?.name || profile.toUpperCase(),
    version: defaultVersion
  };
}

/**
 * Obtener umbrales de calificación basados en porcentajes estándar MQA
 * Excelente: 86%+, Bueno: 55-85%, Suficiente: 30-54%, Deficiente: 0-29%
 */
function getRatingThresholds(profile: ValidationProfile) {
  const config = getProfileConfig(profile);
  if (!config) {
    // Fallback values
    return {
      excellent: 351,
      good: 221,
      sufficient: 121,
      maxScore: 405
    };
  }
  
  const maxScore = config.maxScore;
  return {
    excellent: Math.floor(maxScore * 0.867), // 87% (351/405)
    good: Math.floor(maxScore * 0.546),      // 55% (221/405) 
    sufficient: Math.floor(maxScore * 0.299), // 30% (121/405)
    maxScore: maxScore
  };
}

/**
 * Obtener rangos de calificación para un perfil específico
 */
export function getRatingRanges(profile: ValidationProfile) {
  const thresholds = getRatingThresholds(profile);
  
  return {
    excellent: { min: thresholds.excellent, max: thresholds.maxScore },
    good: { min: thresholds.good, max: thresholds.excellent - 1 },
    sufficient: { min: thresholds.sufficient, max: thresholds.good - 1 },
    poor: { min: 0, max: thresholds.sufficient - 1 }
  };
}

/**
 * Obtener calificación textual basada en la puntuación y perfil
 */
export function getRatingFromScore(score: number, profile: ValidationProfile): 'excellent' | 'good' | 'sufficient' | 'poor' {
  const thresholds = getRatingThresholds(profile);
  
  if (score >= thresholds.excellent) return 'excellent';
  if (score >= thresholds.good) return 'good';
  if (score >= thresholds.sufficient) return 'sufficient';
  return 'poor';
}

/**
 * Obtener calificación textual basada en el porcentaje (para retrocompatibilidad)
 * DEPRECATED: Usar getRatingFromScore en su lugar
 */
export function getRatingFromPercentage(percentage: number, profile: ValidationProfile): 'excellent' | 'good' | 'sufficient' | 'poor' {
  const thresholds = getRatingThresholds(profile);
  const score = (percentage / 100) * thresholds.maxScore;
  return getRatingFromScore(score, profile);
}

/**
 * Obtener porcentaje basado en la puntuación y perfil
 */
export function getPercentageFromScore(score: number, profile: ValidationProfile): number {
  const thresholds = getRatingThresholds(profile);
  return Math.min(100, Math.max(0, (score / thresholds.maxScore) * 100));
}

/**
 * Verificar si un perfil tiene rangos de calificación personalizados
 */
export function hasCustomRatingThresholds(profile: ValidationProfile): boolean {
  return getProfileConfig(profile) !== null;
}

/**
 * Obtener clase CSS de color basada en la puntuación y perfil
 */
export function getScoreColorClass(score: number, profile: ValidationProfile): string {
  const rating = getRatingFromScore(score, profile);
  
  switch (rating) {
    case 'excellent': return 'text-success';
    case 'good': return 'text-success-light';
    case 'sufficient': return 'text-warning';
    case 'poor': return 'text-danger';
    default: return 'text-muted';
  }
}

/**
 * Obtener clase CSS de fondo basada en la puntuación y perfil
 */
export function getScoreBackgroundClass(score: number, profile: ValidationProfile): string {
  const rating = getRatingFromScore(score, profile);
  
  switch (rating) {
    case 'excellent': return 'bg-success';
    case 'good': return 'bg-success-light';
    case 'sufficient': return 'bg-warning';
    case 'poor': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

/**
 * Obtener clase CSS de color de progress-bar basada en la puntuación y perfil
 */
export function getScoreProgressClass(score: number, profile: ValidationProfile): string {
  const rating = getRatingFromScore(score, profile);
  
  switch (rating) {
    case 'excellent': return 'bg-success';
    case 'good': return 'bg-success-light';
    case 'sufficient': return 'bg-warning';
    case 'poor': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

/**
 * Obtener estilo inline para barras de progreso (solución para bg-success-light)
 */
export function getProgressBarStyle(score: number, profile: ValidationProfile): { backgroundColor?: string } {
  const rating = getRatingFromScore(score, profile);
  
  switch (rating) {
    case 'excellent': return {}; // Usar clase bg-success estándar
    case 'good': return { backgroundColor: '#7dd87d' }; // Verde claro inline
    case 'sufficient': return {}; // Usar clase bg-warning estándar
    case 'poor': return {}; // Usar clase bg-danger estándar
    default: return {};
  }
}

/**
 * Obtener clase base para barras de progreso (sin bg-success-light)
 */
export function getProgressBarBaseClass(score: number, profile: ValidationProfile): string {
  const rating = getRatingFromScore(score, profile);
  
  switch (rating) {
    case 'excellent': return 'bg-success';
    case 'good': return 'bg-success-light';
    case 'sufficient': return 'bg-warning';
    case 'poor': return 'bg-danger';
    default: return 'bg-secondary';
  }
}

/**
 * Obtener los rangos formatados para mostrar en la UI
 */
export function getFormattedRatingRanges(profile: ValidationProfile) {
  const ranges = getRatingRanges(profile);
  
  return [
    { 
      label: 'excellent', 
      points: `${ranges.excellent.min}-${ranges.excellent.max}`, 
      color: 'success' 
    },
    { 
      label: 'good', 
      points: `${ranges.good.min}-${ranges.good.max}`, 
      color: 'success-light' 
    },
    { 
      label: 'sufficient', 
      points: `${ranges.sufficient.min}-${ranges.sufficient.max}`, 
      color: 'warning' 
    },
    { 
      label: 'poor', 
      points: `${ranges.poor.min}-${ranges.poor.max}`, 
      color: 'danger' 
    }
  ];
}