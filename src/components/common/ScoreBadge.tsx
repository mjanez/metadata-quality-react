import React from 'react';
import { ValidationProfile } from '../../types';
import { getRatingFromScore, getScoreBackgroundClass } from '../../utils/ratingUtils';

export interface ScoreBadgeProps {
  score?: number;
  maxScore?: number;
  percentage?: number;
  variant?: 'score' | 'percentage' | 'rating' | 'boolean';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showIcon?: boolean;
  profile?: ValidationProfile; // Nuevo: perfil para usar rangos específicos
}

/**
 * Componente reutilizable para mostrar badges de puntuación con colores consistentes
 * 
 * @param score - Puntuación actual
 * @param maxScore - Puntuación máxima (opcional, usado para calcular porcentaje)
 * @param percentage - Porcentaje directo (opcional, tiene prioridad sobre el cálculo)
 * @param variant - Tipo de visualización:
 *   - 'score': Muestra "score / maxScore"
 *   - 'percentage': Muestra "X%"
 *   - 'rating': Muestra texto de calificación (Excelente, Bueno, etc.)
 *   - 'boolean': Muestra ✓ o ✗ basado en si score > 0
 * @param size - Tamaño del badge
 * @param className - Clases CSS adicionales
 * @param showIcon - Mostrar icono junto al texto
 * @param profile - Perfil de validación para usar rangos específicos
 */
const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score = 0,
  maxScore,
  percentage,
  variant = 'score',
  size = 'md',
  className = '',
  showIcon = false,
  profile = 'dcat_ap_es' // Perfil por defecto
}) => {
  // Calcular porcentaje si no se proporciona directamente
  const calculatedPercentage = percentage !== undefined 
    ? percentage 
    : maxScore && maxScore > 0 
      ? (score / maxScore) * 100 
      : 0;

  // Función para obtener la clase de color basada en el variant y puntuación/perfil
  const getBadgeColorClass = (score: number, variant: string, profile: ValidationProfile): string => {
    // Para variant 'score' con maxScore proporcionado
    if (variant === 'score' && maxScore !== undefined && maxScore > 0) {
      // Si el maxScore es muy pequeño (métrica individual), usar porcentajes
      if (maxScore <= 100) {
        const percentage = (score / maxScore) * 100;
        if (percentage >= 86) return 'bg-success';
        if (percentage >= 55) return 'bg-success-light';
        if (percentage >= 30) return 'bg-warning';
        return 'bg-danger';
      } else {
        // Si el maxScore es grande (puntuación total), usar rangos absolutos del perfil
        return getScoreBackgroundClass(score, profile);
      }
    }
    
    // Para variant 'score' sin maxScore, usar color neutral basado en si hay puntuación
    if (variant === 'score') {
      return score > 0 ? 'bg-primary' : 'bg-secondary';
    }
    
    // Para otros variants, usar colores basados en puntuación calculada desde porcentaje
    if (profile && percentage !== undefined) {
      const scoreFromPercentage = (percentage / 100) * (maxScore || 405); // Usar maxScore del perfil por defecto
      return getScoreBackgroundClass(scoreFromPercentage, profile);
    }
    
    // Fallback a rangos legacy basados en porcentaje
    if (calculatedPercentage >= 86) return 'bg-success';
    if (calculatedPercentage >= 55) return 'bg-success-light';
    if (calculatedPercentage >= 30) return 'bg-warning';
    return 'bg-danger';
  };

  // Función para obtener el texto de rating basado en puntuación y perfil
  const getRatingText = (score: number, profile: ValidationProfile): string => {
    let rating: string;
    
    // Si tenemos maxScore y es pequeño (métrica individual), usar porcentajes
    if (maxScore !== undefined && maxScore <= 100) {
      const percentage = (score / maxScore) * 100;
      if (percentage >= 86) rating = 'excellent';
      else if (percentage >= 55) rating = 'good';
      else if (percentage >= 30) rating = 'sufficient';
      else rating = 'poor';
    } else {
      // Para puntuaciones totales, usar rangos absolutos del perfil
      rating = getRatingFromScore(score, profile);
    }
    
    switch (rating) {
      case 'excellent': return 'Excelente';
      case 'good': return 'Bueno';
      case 'sufficient': return 'Suficiente';
      case 'poor': return 'Deficiente';
      default: return 'No evaluado';
    }
  };

  // Función para obtener el icono basado en la puntuación y perfil
  const getIcon = (score: number, profile: ValidationProfile): string => {
    let rating: string;
    
    // Si tenemos maxScore y es pequeño (métrica individual), usar porcentajes
    if (maxScore !== undefined && maxScore <= 100) {
      const percentage = (score / maxScore) * 100;
      if (percentage >= 86) rating = 'excellent';
      else if (percentage >= 55) rating = 'good';
      else if (percentage >= 30) rating = 'sufficient';
      else rating = 'poor';
    } else {
      // Para puntuaciones totales, usar rangos absolutos del perfil
      rating = getRatingFromScore(score, profile);
    }
    
    switch (rating) {
      case 'excellent': return 'bi-check-circle-fill';
      case 'good': return 'bi-check-circle';
      case 'sufficient': return 'bi-exclamation-triangle-fill';
      case 'poor': return 'bi-x-circle-fill';
      default: return 'bi-question-circle';
    }
  };

  // Clases de tamaño
  const sizeClass = size === 'sm' ? 'badge-sm' : size === 'lg' ? 'fs-6' : '';

  // Obtener el contenido del badge según el variant
  const getBadgeContent = (): React.ReactNode => {
    const scoreForRating = percentage !== undefined 
      ? (percentage / 100) * (maxScore || 405) 
      : score;

    switch (variant) {
      case 'score':
        return maxScore !== undefined 
          ? `${score.toFixed(1)} / ${maxScore}`
          : score.toFixed(1);
      
      case 'percentage':
        return `${calculatedPercentage.toFixed(1)}%`;
      
      case 'rating':
        return getRatingText(scoreForRating, profile);
      
      case 'boolean':
        return score > 0 ? '✓' : '✗';
      
      default:
        return score.toFixed(1);
    }
  };

  // Clases CSS combinadas
  const badgeClasses = [
    'badge',
    getBadgeColorClass(score, variant, profile),
    sizeClass,
    className
  ].filter(Boolean).join(' ');

  // Generar el título apropiado según el variant
  const getTitle = (): string => {
    let ratingText: string;
    
    if (variant === 'score' && maxScore !== undefined) {
      // Para métricas con maxScore, usar la lógica apropiada
      if (maxScore <= 100) {
        // Métrica individual: usar porcentajes
        const percentage = (score / maxScore) * 100;
        if (percentage >= 86) ratingText = 'Excelente';
        else if (percentage >= 55) ratingText = 'Bueno';
        else if (percentage >= 30) ratingText = 'Suficiente';
        else ratingText = 'Deficiente';
      } else {
        // Puntuación total: usar rangos del perfil
        const rating = getRatingFromScore(score, profile);
        switch (rating) {
          case 'excellent': ratingText = 'Excelente'; break;
          case 'good': ratingText = 'Bueno'; break;
          case 'sufficient': ratingText = 'Suficiente'; break;
          case 'poor': ratingText = 'Deficiente'; break;
          default: ratingText = 'No evaluado';
        }
      }
      
      return `${score.toFixed(1)} de ${maxScore} puntos (${calculatedPercentage.toFixed(1)}% - ${ratingText})`;
    }
    
    const scoreForRating = percentage !== undefined 
      ? (percentage / 100) * (maxScore || 405) 
      : score;

    switch (variant) {
      case 'score':
        if (maxScore !== undefined && maxScore > 0) {
          // Si tenemos maxScore, mostrar información completa incluyendo rendimiento
          return `${score.toFixed(1)} de ${maxScore} puntos (${calculatedPercentage.toFixed(1)}% - ${getRatingText(scoreForRating, profile)})`;
        } else {
          // Si no tenemos maxScore, solo mostrar puntos
          return `${score.toFixed(1)} puntos`;
        }
      
      case 'percentage':
      case 'rating':
        return `${calculatedPercentage.toFixed(1)}% - ${getRatingText(scoreForRating, profile)}`;
      
      case 'boolean':
        return score > 0 ? 'Encontrado' : 'No encontrado';
      
      default:
        return `${score.toFixed(1)}`;
    }
  };

  return (
    <span 
      className={badgeClasses}
      title={getTitle()}
    >
      {showIcon && <i className={`bi ${getIcon(score, profile)} me-1`}></i>}
      {getBadgeContent()}
    </span>
  );
};

export default ScoreBadge;