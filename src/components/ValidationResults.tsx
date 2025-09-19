import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ValidationResult, ExtendedValidationResult, ValidationProfile } from '../types';
import { getRatingFromScore, getScoreColorClass, getScoreProgressClass, getProgressBarStyle, getProgressBarBaseClass } from '../utils/ratingUtils';
import QualityChart from './QualityChart';
import SHACLReportViewer from './SHACLReportViewer';
import ScoreBadge from './common/ScoreBadge';
import { RDFService } from '../services/RDFService';
import MQAService from '../services/MQAService';
import { ValidationLoadingStates, ValidationProgress, ValidationResultsProps } from './ValidationResults.types';

const ValidationResults: React.FC<ValidationResultsProps> = ({ 
  result, 
  onReset, 
  loadingStates, 
  isProgressive = false, 
  validationProgress 
}) => {
  const { t } = useTranslation();
  const { quality, profile, stats } = result;
  const [expandedAccordions, setExpandedAccordions] = useState<Set<string>>(new Set());

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'findability': return 'bi-search';
      case 'accessibility': return 'bi-unlock';
      case 'interoperability': return 'bi-link-45deg';
      case 'reusability': return 'bi-recycle';
      case 'contextuality': return 'bi-clipboard-data';
      default: return 'bi-graph-up';
    }
  };

  const getScoreColor = (score: number) => {
    return getScoreColorClass(score, profile);
  };

  // Función auxiliar para obtener el color de fondo de la barra de progreso basado en porcentaje
  const getProgressColor = (percentage: number) => {
    // Use percentage-based thresholds for dimension progress bars
    if (percentage >= 86) return 'bg-success';       // excellent: 86%+
    if (percentage >= 55) return 'bg-success-light'; // good: 55-85%
    if (percentage >= 30) return 'bg-warning';       // sufficient: 30-54%
    return 'bg-danger';                              // poor: 0-29%
  };
  
  // Función auxiliar para obtener el estilo inline de la barra de progreso basado en porcentaje
  const getProgressStyle = (percentage: number) => {
    // For bg-success-light, we need inline styles since it's a custom color
    if (percentage >= 55 && percentage < 86) {
      return { backgroundColor: '#7dd87d' }; // Light green color
    }
    return {}; // Use CSS classes for other colors
  };

  const toggleAccordion = (category: string) => {
    const newExpanded = new Set(expandedAccordions);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedAccordions(newExpanded);
  };

  const expandAll = () => {
    const allCategories = Object.keys(quality.byCategory);
    setExpandedAccordions(new Set(allCategories));
  };

  const collapseAll = () => {
    setExpandedAccordions(new Set());
  };

  // Calcular tiempo estimado basado en datasets y distribuciones
  const calculateEstimatedTime = (datasets: number = 0, distributions: number = 0, isRemoteUrl: boolean = true): number => {
    // Basado en datos reales:
    // - 59 datasets, 213 distribuciones, 7155 tripletas → 62 segundos (URL remota)
    // - 1 dataset, 1 distribución → 5 segundos (URL local/ejemplo)
    
    if (datasets === 0 && distributions === 0) return 10; // tiempo base
    
    if (isRemoteUrl) {
      // Para URLs remotas: ~1s por dataset + factores adicionales
      const baseTime = Math.max(5, datasets * 1.2 + distributions * 0.3);
      return Math.ceil(baseTime);
    } else {
      // Para URLs locales/ejemplos: más rápido
      const baseTime = Math.max(3, datasets * 0.8 + distributions * 0.2);
      return Math.ceil(baseTime);
    }
  };

  // Determinar si es URL remota (heurística simple)
  const isRemoteUrl = (url?: string): boolean => {
    if (!url) return false;
    return !url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('example');
  };

  // Download functions
  const downloadCSV = () => {
    const csvHeader = 'dimension,metric,score,maxScore,percentage,weight\n';
    const csvData = quality.metrics.map(metric => {
      const percentage = (metric.score / metric.maxScore * 100).toFixed(1);
      return `${metric.category},${metric.id},${metric.score.toFixed(1)},${metric.maxScore},${percentage},${metric.weight}`;
    }).join('\n');
    
    const blob = new Blob([csvHeader + csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mqa-metrics-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadJSON = () => {
    // Get profile information dynamically from MQAService
    const profileInfo = MQAService.getProfileInfo(profile);
    const defaultVersion = profileInfo?.defaultVersion;
    const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
    const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;
    
    const jsonData = {
      source: result.timestamp ? `validation-${result.timestamp}` : 'unknown',
      created: new Date().toISOString().split('T')[0],
      profile: {
        id: profile,
        name: isValidVersionInfo ? (versionInfo as any).name : profile,
        version: defaultVersion || 'latest',
        url: isValidVersionInfo ? (versionInfo as any).url : null,
      },
      totalScore: parseFloat(quality.totalScore.toFixed(1)),
      maxScore: parseFloat(quality.maxScore.toFixed(1)),
      rating: getRatingFromScore(quality.totalScore, profile),
      dimensions: Object.entries(quality.byCategory).reduce((acc, [key, value]) => {
        acc[key] = parseFloat(value.score.toFixed(1));
        return acc;
      }, {} as Record<string, number>),
      metrics: quality.metrics.map(metric => ({
        id: metric.id,
        dimension: metric.category,
        score: parseFloat(metric.score.toFixed(1)),
        maxScore: metric.maxScore,
        percentage: parseFloat((metric.score / metric.maxScore).toFixed(3)),
        weight: metric.weight,
        found: metric.found || false
      }))
    };
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mqa-results-${profile}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const downloadDQV = () => {
    // Create DQV JSON-LD structure based on the converters.py logic
    const sourceUrl = result.timestamp ? `urn:mqa:validation:${result.timestamp}` : 'urn:mqa:validation:unknown';
    const measurementId = `urn:mqa:measurement:${new Date().toISOString().split('T')[0]}`;
    
    const dqvData = {
      "@context": {
        "dqv": "http://www.w3.org/ns/dqv#",
        "dcat": "http://www.w3.org/ns/dcat#",
        "dct": "http://purl.org/dc/terms/",
        "prov": "http://www.w3.org/ns/prov#",
        "foaf": "http://xmlns.com/foaf/0.1/",
        "xsd": "http://www.w3.org/2001/XMLSchema#",
        "oa": "http://www.w3.org/ns/oa#",
        "skos": "http://www.w3.org/2004/02/skos/core#",
        "schema": "http://schema.org/",
        "fair": "https://w3id.org/fair/principles/terms/"
      },
      "@id": measurementId,
      "@type": "dqv:QualityMeasurement",
      "dct:created": `${new Date().toISOString()}`,
      "dct:title": `Quality Assessment - ${profile.toUpperCase()}`,
      "dct:description": `Metadata quality assessment using ${profile.toUpperCase()} profile`,
      "dqv:computedOn": {
        "@id": sourceUrl,
        "@type": "dcat:Dataset"
      },
      "dqv:value": parseFloat(quality.totalScore.toFixed(1)),
      "dqv:isMeasurementOf": {
        "@id": "urn:mqa:metric:totalScore",
        "@type": "dqv:Metric",
        "skos:prefLabel": "Total Quality Score",
        "dct:description": `Total quality score based on ${profile.toUpperCase()} validation profile`
      },
      "prov:wasGeneratedBy": {
        "@id": `urn:mqa:activity:${measurementId}`,
        "@type": "prov:Activity",
        "prov:used": {
          "@id": `urn:mqa:profile:${profile}`,
          "@type": "dqv:QualityPolicy",
          "skos:prefLabel": `${profile.toUpperCase()} Validation Profile`,
          "dct:hasVersion": "latest"
        }
      },
      "schema:rating": {
        "@type": "schema:Rating",
        "schema:ratingValue": getRatingFromScore(quality.totalScore, profile),
        "schema:worstRating": "Poor",
        "schema:bestRating": "Excellent"
      },
      "dqv:hasQualityMeasurement": [] as any[]
    };

    // Add dimension measurements
    Object.entries(quality.byCategory).forEach(([dimension, categoryData]) => {
      const dimensionMapping: Record<string, string> = {
        "findability": "fair:F",
        "accessibility": "fair:A", 
        "interoperability": "fair:I",
        "reusability": "fair:R",
        "contextuality": "dqv:contextualQuality"
      };
      
      (dqvData["dqv:hasQualityMeasurement"] as any[]).push({
        "@id": `${measurementId}-${dimension}`,
        "@type": "dqv:QualityMeasurement",
        "dqv:value": parseFloat(categoryData.score.toFixed(1)),
        "dqv:isMeasurementOf": {
          "@id": dimensionMapping[dimension] || `urn:mqa:dimension:${dimension}`,
          "@type": "dqv:Dimension",
          "skos:prefLabel": dimension.charAt(0).toUpperCase() + dimension.slice(1)
        }
      });
    });

    const blob = new Blob([JSON.stringify(dqvData, null, 2)], { type: 'application/ld+json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mqa-dqv-${new Date().toISOString().split('T')[0]}.jsonld`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openSourceRDF = () => {
    if (result.content) {
      const blob = new Blob([result.content], { type: 'text/turtle' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Clean up the URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const getMetricsByCategory = (category: string) => {
    return quality.metrics.filter(metric => metric.category === category);
  };

  return (
    <div className="validation-results">
      <style>{`
        .btn-group .btn:not(:last-child) {
          border-right: 1px solid var(--bs-border-color) !important;
        }
        .btn-group .btn {
          border-radius: 0;
        }
        .btn-group .btn:first-child {
          border-top-left-radius: 0.375rem;
          border-bottom-left-radius: 0.375rem;
        }
        .btn-group .btn:last-child {
          border-top-right-radius: 0.375rem;
          border-bottom-right-radius: 0.375rem;
        }
      `}</style>
      
      {/* Banner de validación en progreso */}
      {isProgressive && validationProgress?.isValidating && (
        <div className="row mb-4">
          <div className="col">
            <div className="alert alert-primary border-primary d-flex align-items-center" role="alert">
              <div className="spinner-border spinner-border-sm text-primary me-3" role="status">
                <span className="visually-hidden">{t('common.states.loading')}</span>
              </div>
              <div className="flex-grow-1">
                <h6 className="alert-heading mb-1">
                  <i className="bi bi-hourglass-split me-2"></i>
                  {t('common.actions.validating')}
                </h6>
                <div className="small">
                  {validationProgress.currentStep || t('common.states.validating_detailed')}
                </div>
                {(validationProgress.datasetsCount || validationProgress.distributionsCount) && (
                  <div className="mt-2">
                    <small className="text-muted">
                      <i className="bi bi-info-circle me-1"></i>
                      {validationProgress.datasetsCount && (
                        <>
                          <strong>{validationProgress.datasetsCount}</strong> {t('validation.progress.banner.datasets')}
                          {validationProgress.distributionsCount && <>, </>}
                        </>
                      )}
                      {validationProgress.distributionsCount && (
                        <>
                          <strong>{validationProgress.distributionsCount}</strong> {t('validation.progress.banner.distributions')}
                        </>
                      )}
                      {' • '}
                      {t('validation.progress.banner.estimated_time')}: <strong>
                        {calculateEstimatedTime(
                          validationProgress.datasetsCount || 0,
                          validationProgress.distributionsCount || 0,
                          true // Asumir URL remota por defecto
                        )}s
                      </strong>
                    </small>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* RDF Warnings */}
      {result.warnings && result.warnings.length > 0 && (
        <div className="row mb-4">
          <div className="col">
            <div className="alert alert-warning border-warning" role="alert">
              <div className="d-flex align-items-start">
                <i className="bi bi-exclamation-triangle-fill me-2 mt-1"></i>
                <div className="flex-grow-1">
                  <h6 className="alert-heading mb-2">
                    <i className="bi bi-tools me-1"></i>
                    {t('rdf_preprocessing.title', 'RDF Preprocessing Applied')}
                  </h6>
                  <p className="mb-2">
                    {t('rdf_preprocessing.description', 'Some issues were automatically corrected in your RDF data to enable proper validation:')}
                  </p>
                  <div className="overflow-auto" style={{ maxHeight: '200px' }}>
                    <ul className="mb-0 ps-3">
                      {result.warnings.map((warning, index) => (
                        <li key={index} className="small text-muted">{warning}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-2">
                    <small className="text-muted">
                      <i className="bi bi-info-circle me-1"></i>
                      {t('rdf_preprocessing.note', 'These corrections do not affect your original data, only the copy used for analysis.')}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overall Score */}
      <div className="row mb-4">
        <div className="col">
          <div className="card border-primary position-relative">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="bi-trophy me-2"></i>
                {t('validation.overall_score')}
              </h5>
              {isProgressive && loadingStates && (loadingStates.qualityMetrics || loadingStates.mqaEvaluation) && (
                <div className="spinner-border spinner-border-sm text-light" role="status">
                  <span className="visually-hidden">{t('common.states.loading')}</span>
                </div>
              )}
            </div>
            <div className="card-body text-center">
              {/* Loading overlay para la card de puntuación total */}
              {isProgressive && loadingStates && (loadingStates.qualityMetrics || loadingStates.mqaEvaluation) && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-light bg-opacity-75" style={{ zIndex: 10 }}>
                  <div className="text-center">
                    <div className="spinner-border text-primary mb-2" role="status">
                      <span className="visually-hidden">{t('common.states.loading')}</span>
                    </div>
                    <div className="small text-muted">{t('common.actions.validating')}</div>
                  </div>
                </div>
              )}
              
              <div className="mb-2">
                <span className={`badge fs-5 ${getScoreProgressClass(quality.totalScore, profile)}`}>
                  {t(`results.ratings.${getRatingFromScore(quality.totalScore, profile)}`)}
                </span>
              </div>
              <div className={`display-4 fw-bold ${getScoreColor(quality.totalScore)}`}>
                {quality.totalScore.toFixed(1)}
              </div>
              <div className="progress mt-2" style={{ height: '6px' }}>
                <div
                  className={`progress-bar ${getProgressBarBaseClass(quality.totalScore, profile)}`}
                  style={{ 
                    width: `${quality.percentage}%`,
                    ...getProgressBarStyle(quality.totalScore, profile)
                  }}
                ></div>
              </div>
              <small className="text-muted mt-1 d-block">
                {quality.totalScore.toFixed(1)} / {quality.maxScore} ({quality.percentage.toFixed(1)}%)
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Download Buttons */}
      <div className="row mb-4">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">
                <i className="bi bi-download me-2"></i>
                {t('common.actions.download')} & {t('common.actions.export')}
              </h5>
            </div>
            <div className="card-body">
              <div className="row g-2">
                <div className="col-md-3">
                  <button 
                    className="btn btn-outline-success w-100" 
                    onClick={downloadCSV}
                    title={ t('results.downloads.csv_metrics_description') }
                  >
                    <i className="bi bi-file-earmark-spreadsheet me-1"></i>
                    { t('results.downloads.csv_metrics') }
                  </button>
                </div>
                <div className="col-md-3">
                  <button 
                    className="btn btn-outline-primary w-100" 
                    onClick={downloadJSON}
                    title={ t('results.downloads.json_results_description') }
                  >
                    <i className="bi bi-filetype-json me-1"></i>
                    { t('results.downloads.json_results') }
                  </button>
                </div>
                <div className="col-md-3">
                  <button 
                    className="btn btn-outline-info w-100" 
                    onClick={downloadDQV}
                    title={ t('results.downloads.json_ld_dqv_description') }
                  >
                    <i className="bi bi-file-earmark-code me-1"></i>
                    { t('results.downloads.json_ld_dqv') }
                  </button>
                </div>
                <div className="col-md-3">
                  <button 
                    className="btn btn-outline-secondary w-100" 
                    onClick={openSourceRDF}
                    title={ t('results.downloads.source_rdf_description') }
                    disabled={!result.content}
                  >
                    <i className="bi bi-file-earmark-text me-1"></i>
                    { t('results.downloads.source_rdf') }
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Chart */}
      <div className="row mb-4">
        <div className="col">
          <div className="card position-relative">
            <div className="card-header">
              <h5 className="card-title mb-0">{t('results.quality.radar_chart_title')}</h5>
            </div>
            <div className="card-body">
              {/* Loading overlay para el radar chart */}
              {isProgressive && loadingStates && (loadingStates.qualityMetrics || loadingStates.mqaEvaluation) && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-light bg-opacity-75" style={{ zIndex: 10 }}>
                  <div className="text-center">
                    <div className="spinner-border text-primary mb-2" role="status">
                      <span className="visually-hidden">{t('common.states.loading')}</span>
                    </div>
                    <div className="small text-muted">{t('common.actions.validating')}</div>
                  </div>
                </div>
              )}
              
              <QualityChart data={quality.byCategory} showDownload={true} />
            </div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="row mb-4">
        <div className="col">
          <div className="card position-relative">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">{t('results.quality.summary')}</h5>
            </div>
            <div className="card-body">
              {/* Loading overlay para el resumen de calidad */}
              {isProgressive && loadingStates && (loadingStates.qualityMetrics || loadingStates.mqaEvaluation) && (
                <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-light bg-opacity-75" style={{ zIndex: 10 }}>
                  <div className="text-center">
                    <div className="spinner-border text-primary mb-2" role="status">
                      <span className="visually-hidden">{t('common.states.loading')}</span>
                    </div>
                    <div className="small text-muted">{t('common.actions.validating')}</div>
                  </div>
                </div>
              )}
              
              <div className="row justify-content-center">
                {Object.entries(quality.byCategory).map(([category, scores]) => {
                  const isLoading = isProgressive && loadingStates && loadingStates[category as keyof ValidationLoadingStates];
                  
                  return scores.maxScore > 0 && (
                    <div key={category} className="col-md-6 col-lg-4 col-xl-2 mb-3 d-flex">
                      <div className="border rounded p-3 w-100 position-relative">
                        {/* Loading overlay para cada categoría */}
                        {isLoading && (
                          <div className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-light bg-opacity-75 rounded" style={{ zIndex: 5 }}>
                            <div className="spinner-border spinner-border-sm text-primary" role="status">
                              <span className="visually-hidden">{t('common.states.loading')}</span>
                            </div>
                          </div>
                        )}
                        
                        <div className="d-flex align-items-center mb-2">
                          <i className={`${getCategoryIcon(category)} me-2`}></i>
                          <h6 className="mb-0">{t(`results.dimensions.${category}`)}</h6>
                        </div>
                        <div className="progress mb-2" style={{ height: '8px' }}>
                          <div
                            className={`progress-bar ${getProgressColor(scores.percentage)}`}
                            style={{
                              width: `${scores.percentage}%`,
                              ...getProgressStyle(scores.percentage)
                            }}
                          ></div>
                        </div>
                        <small className="text-muted">
                          {scores.score.toFixed(1)} / {scores.maxScore} ({scores.percentage.toFixed(1)}%)
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SHACL Compliance Report */}
      {result.shaclReport && (
        <div className="row mb-4">
          <div className="col">
            <SHACLReportViewer 
              report={result.shaclReport} 
              onExportReport={async () => {
                try {
                  const reportTurtle = await RDFService.exportSHACLReport(result.shaclReport!);
                  const blob = new Blob([reportTurtle], { type: 'text/turtle' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `shacl-report-${result.shaclReport!.profile}-${new Date().toISOString().split('T')[0]}.ttl`;
                  link.click();
                  URL.revokeObjectURL(link.href);
                } catch (error) {
                  console.error('Error exporting SHACL report:', error);
                }
              }}
              onExportCSV={async () => {
                try {
                  const { default: SHACLValidationService } = await import('../services/SHACLValidationService');
                  const csvContent = await SHACLValidationService.exportReportAsCSV(result.shaclReport!);
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `shacl-report-${result.shaclReport!.profile}-${new Date().toISOString().split('T')[0]}.csv`;
                  link.click();
                  URL.revokeObjectURL(link.href);
                } catch (error) {
                  console.error('Error exporting SHACL CSV report:', error);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Detailed Metrics by Dimension - Accordion */}
      <div className="row mb-4">
        <div className="col">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="card-title mb-0">{t('results.quality.metrics_by_dimension')}</h5>
              <div className="btn-group btn-group-sm" role="group" aria-label="Accordion controls">
                <button 
                  className="btn btn-outline-primary"
                  onClick={expandAll}
                >
                  {t('results.expand_all')}
                </button>
                <button 
                  className="btn btn-outline-secondary"
                  onClick={collapseAll}
                >
                  {t('results.collapse_all')}
                </button>
              </div>
            </div>
            <div 
              className="accordion accordion-flush" 
              id="metricsAccordion"
              style={{ 
                maxHeight: '600px', 
                overflowY: 'auto',
                borderTop: '1px solid #dee2e6',
                borderBottom: '1px solid #dee2e6'
              }}
            >
              {Object.entries(quality.byCategory).map(([category, scores]) => {
                const categoryMetrics = getMetricsByCategory(category);
                if (categoryMetrics.length === 0) return null;

                const accordionId = `accordion-${category}`;
                const isExpanded = expandedAccordions.has(category);

                return (
                  <div key={category} className="accordion-item">
                    <h2 className="accordion-header">
                      <button
                        className={`accordion-button ${isExpanded ? '' : 'collapsed'}`}
                        type="button"
                        onClick={() => toggleAccordion(category)}
                        aria-expanded={isExpanded}
                        aria-controls={accordionId}
                      >
                        <div className="d-flex align-items-center w-100">
                          <i className={`${getCategoryIcon(category)} me-3`}></i>
                          <div className="flex-grow-1">
                            <strong>{t(`results.dimensions.${category}`)}</strong>
                            <div className="d-flex align-items-center mt-1">
                              <div className="progress flex-grow-1 me-3" style={{ height: '6px' }}>
                                <div
                                  className={`progress-bar ${getProgressColor(scores.percentage)}`}
                                  style={{ 
                                    width: `${scores.percentage}%`,
                                    ...getProgressStyle(scores.percentage)
                                  }}
                                ></div>
                              </div>
                              <ScoreBadge 
                                percentage={scores.percentage}
                                variant="percentage"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    </h2>
                    <div
                      id={accordionId}
                      className={`accordion-collapse collapse ${isExpanded ? 'show' : ''}`}
                    >
                      <div className="accordion-body">
                        <div className="table-responsive">
                          <table className="table table-sm table-hover">
                            <thead>
                              <tr>
                                <th>{t('metrics.labels.name')}</th>
                                <th>{t('metrics.labels.score')}</th>
                                <th>{t('metrics.labels.weight')}</th>
                                <th>{t('metrics.labels.description')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {categoryMetrics.map((metric) => (
                                <tr key={metric.id}>
                                  <td>
                                    <code className="text-primary">{metric.id}</code>
                                    <br />
                                    <small className="text-muted">{metric.name}</small>
                                  </td>
                                  <td>
                                    <ScoreBadge 
                                      score={metric.score}
                                      maxScore={metric.maxScore}
                                      variant="score"
                                      size="sm"
                                      profile={profile}
                                    />
                                  </td>
                                  <td>
                                    <span className="badge bg-info">
                                      {metric.weight}
                                    </span>
                                  </td>
                                  <td>
                                    <small>{metric.description}</small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Metadata Info */}
      <div className="row mb-4">
        <div className="col">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">{t('results.metadata_info.title')}</h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <dl className="row">
                    <dt className="col-sm-4">{t('results.metadata_info.profile')}</dt>
                    <dd className="col-sm-8">
                      <span className="badge bg-primary">{t(`validation.profiles.${profile}`)}</span>
                    </dd>
                    <dt className="col-sm-4">{t('results.metadata_info.triples')}</dt>
                    <dd className="col-sm-8">{stats.triples.toLocaleString()}</dd>
                  </dl>
                </div>
                <div className="col-md-6">
                  <dl className="row">
                    <dt className="col-sm-4">{t('results.metadata_info.subjects')}</dt>
                    <dd className="col-sm-8">{stats.subjects.toLocaleString()}</dd>
                    <dt className="col-sm-4">{t('results.metadata_info.predicates')}</dt>
                    <dd className="col-sm-8">{stats.predicates.toLocaleString()}</dd>
                    <dt className="col-sm-4">{t('results.metadata_info.objects')}</dt>
                    <dd className="col-sm-8">{stats.objects.toLocaleString()}</dd>
                  </dl>
                </div>
              </div>
              
              {onReset && (
                <div className="row mt-3">
                  <div className="col text-center">
                    <button 
                      className="btn btn-outline-secondary"
                      onClick={onReset}
                    >
                      <i className="bi bi-arrow-left me-2"></i>
                      {t('results.downloads.validate_another')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidationResults;
