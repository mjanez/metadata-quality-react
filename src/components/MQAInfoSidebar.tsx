import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tooltip';
import { ValidationProfile, MQAConfig } from '../types';
import { formatValidationDurationWithIcon } from '../utils/timeUtils';
import { getRatingFromScore, getScoreColorClass, getRatingRanges, getProgressBarStyle, getProgressBarBaseClass } from '../utils/ratingUtils';
import mqaConfigData from '../config/mqa-config.json';

interface MQAInfoSidebarProps {
  selectedProfile?: ValidationProfile;
  validationResult?: any;
  isVisible?: boolean;
  onToggle?: () => void;
}

const MQAInfoSidebar: React.FC<MQAInfoSidebarProps> = ({ 
  selectedProfile = 'dcat_ap_es', 
  validationResult = null,
  isVisible = true,
  onToggle
}) => {
  const { t } = useTranslation();
  const mqaConfig = (mqaConfigData as any);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-bs-theme') || 'light');

  // Watch for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-bs-theme') || 'light');
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme']
    });
    
    return () => observer.disconnect();
  }, []);

  const getProfileInfo = (profile: ValidationProfile) => {
    const configProfile = mqaConfig.profiles[profile];
    const defaultVersion = configProfile?.defaultVersion;
    const versionData = defaultVersion ? configProfile?.versions?.[defaultVersion] : null;
    
    if (!versionData) {
      console.warn(`No version data found for profile ${profile} version ${defaultVersion}`);
      return {
        name: profile,
        style: 'text-primary',
        icon: 'img/icons/esp.svg',
        description: t(`validation.profiles.${profile}_description`),
        maxPoints: 405,
        url: '#'
      };
    }

    // Default values by profile
    const defaults = {
      'dcat_ap_es': {
        icon: 'img/icons/esp.svg',
        url: 'https://datosgobes.github.io/DCAT-AP-ES/'
      },
      'dcat_ap': {
        icon: 'img/icons/eur.svg',
        url: 'https://semiceu.github.io/DCAT-AP/'
      },
      'nti_risp': {
        icon: 'img/icons/esp.svg',
        url: 'https://www.boe.es/eli/es/res/2013/02/19/(4)'
      }
    };

    const profileDefaults = defaults[profile] || defaults['dcat_ap_es'];

    return {
      name: versionData.name,
      style: 'text-primary',
      icon: versionData.icon || profileDefaults.icon,
      description: t(`validation.profiles.${profile}_description`),
      maxPoints: versionData.maxScore,
      url: versionData.url || profileDefaults.url
    };
  };

  const profileInfo = getProfileInfo(selectedProfile);
  
  // Usar las utilidades centralizadas para obtener los rangos de rating
  const ratingRanges = getRatingRanges(selectedProfile);
  
  // Convertir a formato de array para la tabla
  const ratings = [
    { 
      label: t('results.ratings.excellent'), 
      points: `${ratingRanges.excellent.min}-${ratingRanges.excellent.max}`, 
      color: 'success' 
    },
    { 
      label: t('results.ratings.good'), 
      points: `${ratingRanges.good.min}-${ratingRanges.good.max}`, 
      color: 'success-light' 
    },
    { 
      label: t('results.ratings.sufficient'), 
      points: `${ratingRanges.sufficient.min}-${ratingRanges.sufficient.max}`, 
      color: 'warning' 
    },
    { 
      label: t('results.ratings.poor'), 
      points: `${ratingRanges.poor.min}-${ratingRanges.poor.max}`, 
      color: 'danger' 
    }
  ];

  return (
    <div 
      className={`mqa-sidebar position-fixed top-0 h-100 border-end shadow-sm d-flex flex-column ${theme === 'dark' ? 'bg-dark' : 'bg-white'}`}
      style={{
        zIndex: 1040,
        paddingTop: '76px',
        width: isVisible ? '350px' : '60px',
        transition: 'width 0.3s ease-in-out',
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }}

      >
        {/* Toggle Button - Fixed position within sidebar */}
        <div className="position-absolute" style={{ top: '20px', right: '10px', zIndex: 1050 }}>
          <button
            className={`btn ${theme === 'dark' ? 'btn-dark' : 'btn-light'} border shadow-sm d-flex align-items-center justify-content-center`}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
            }}
            onClick={onToggle}
            aria-label={isVisible ? t('sidebar.collapse') : t('sidebar.expand')}
          >
            <i className={`bi bi-${isVisible ? 'chevron-left' : 'chevron-right'} fs-6`}></i>
          </button>
        </div>

        {/* Mobile Overlay - only when expanded */}
        {isVisible && (
          <div 
            className="position-fixed w-100 h-100 d-lg-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1030,
              top: 0,
              left: 0
            }}
            onClick={onToggle}
          />
        )}

        {/* Sidebar Content */}
        <div 
          className="flex-grow-1 overflow-hidden"
          style={{
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out'
          }}
        >
          {isVisible && (
            <div className="p-3 h-100 overflow-auto">
              {/* Profile Banner */}
              <div className="card mb-3 border-0 bg-gradient">
                <div className="card-body text-center py-3">
                  <div className="mb-2">
                    <img 
                      src={profileInfo.icon} 
                      alt={profileInfo.name}
                      className="rounded-circle"
                      style={{ 
                        width: '3rem', 
                        height: '3rem',
                        objectFit: 'cover'
                      }}
                      aria-label={profileInfo.name}
                    />
                  </div>
                  <h6 className="card-title mb-1">
                    <span className={`${profileInfo.style} fw-bold fs-5`}>
                      {profileInfo.name}
                    </span>
                  </h6>
                  <small className="text-muted d-block">
                    {profileInfo.description}
                  </small>
                </div>
              </div>

              {/* Current Validation Stats - Show only when there are results */}
              {validationResult && validationResult.quality && validationResult.quality.totalScore > 0 && (
                <>
                  {/* Total Score Card */}
                  <div className="card mb-3">
                    <div className="card-header py-2">
                      <h6 className="card-title mb-0">
                        <i className="bi bi-trophy me-2"></i>
                        {t('sidebar.current_validation.total_score')}
                      </h6>
                    </div>
                    <div className="card-body py-3 text-center">
                      <div className={`display-6 fw-bold ${getScoreColorClass(validationResult.quality.totalScore, selectedProfile)}`}>
                        {validationResult.quality.totalScore.toFixed(1)}
                      </div>
                      <div className="progress mt-2" style={{ height: '6px' }}>
                        <div
                          className={`progress-bar ${getProgressBarBaseClass(validationResult.quality.totalScore, selectedProfile)}`}
                          style={{ 
                            width: `${validationResult.quality.percentage}%`,
                            ...getProgressBarStyle(validationResult.quality.totalScore, selectedProfile)
                          }}
                        ></div>
                      </div>
                      <small className="text-muted mt-1 d-block">
                        {validationResult.quality.totalScore.toFixed(1)} / {validationResult.quality.maxScore} ({validationResult.quality.percentage.toFixed(1)}%)
                      </small>
                    </div>
                  </div>

                  {/* Validation Time Card */}
                  {validationResult.validationDuration && (
                    <div className="card mb-3">
                      <div className="card-header py-2">
                        <h6 className="card-title mb-0">
                          <i className="bi bi-stopwatch me-2"></i>
                          {t('sidebar.current_validation.validation_time')}
                        </h6>
                      </div>
                      <div className="card-body py-3 text-center">
                        {(() => {
                          // Cast the i18n function to the simple signature expected by the util
                          const { formattedTime, icon, className } = formatValidationDurationWithIcon(
                            validationResult.validationDuration,
                            t as unknown as (key: string, options?: any) => string
                          );
                          return (
                            <>
                              <div className={`h5 fw-bold ${className} mb-1`}>
                                <i className={`bi ${icon} me-1`}></i>
                                {formattedTime}
                              </div>
                              <small className="text-muted">
                                {validationResult.validationDuration < 5000 ? t('common.performance.very_fast', 'Muy rápido') :
                                 validationResult.validationDuration < 30000 ? t('common.performance.fast', 'Rápido') :
                                 validationResult.validationDuration < 120000 ? t('common.performance.moderate', 'Moderado') :
                                 t('common.performance.slow', 'Lento')}
                              </small>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Entity Counts Cards */}
                  <div className="card mb-3">
                    <div className="card-header py-2">
                      <h6 className="card-title mb-0">
                        <i className="bi bi-collection me-2"></i>
                        {t('sidebar.current_validation.current_validation')}
                      </h6>
                    </div>
                    <div className="card-body py-2">
                      <div className="row g-2 text-center">
                        {/* Datasets */}
                        <div className="col-4">
                          <div className="card border-0" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
                            <div className="card-body py-2">
                              <div className="d-flex align-items-center justify-content-center mb-1 position-relative">
                                <i className="bi bi-database text-primary me-1"></i>
                                <button 
                                  type="button" 
                                  className="btn btn-link p-0 text-decoration-none position-absolute"
                                  data-tooltip-id="datasets-help"
                                  data-tooltip-content={t('sidebar.current_validation.datasets_help')}
                                  style={{ border: 'none', background: 'none', top: '0px', right: '2px' }}
                                >
                                  <i className="bi bi-question-circle-fill text-muted small"></i>
                                </button>
                              </div>
                              <div className="fs-6 fw-bold text-primary">
                                {validationResult.stats.datasets}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Data Services */}
                        <div className="col-4">
                          <div className="card border-0" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
                            <div className="card-body py-2">
                              <div className="d-flex align-items-center justify-content-center mb-1 position-relative">
                                <i className="bi bi-cloud-arrow-up text-warning me-1"></i>
                                <button 
                                  type="button" 
                                  className="btn btn-link p-0 text-decoration-none position-absolute"
                                  data-tooltip-id="data-services-help"
                                  data-tooltip-content={t('sidebar.current_validation.data_services_help')}
                                  style={{ border: 'none', background: 'none', top: '0px', right: '2px' }}
                                >
                                  <i className="bi bi-question-circle-fill text-muted small"></i>
                                </button>
                              </div>
                              <div className="fs-6 fw-bold text-warning">
                                {validationResult.stats.dataServices}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Distributions */}
                        <div className="col-4">
                          <div className="card border-0" style={{ backgroundColor: 'var(--bs-secondary-bg)' }}>
                            <div className="card-body py-2">
                              <div className="d-flex align-items-center justify-content-center mb-1 position-relative">
                                <i className="bi bi-folder-symlink text-success me-1"></i>
                                <button 
                                  type="button" 
                                  className="btn btn-link p-0 text-decoration-none position-absolute"
                                  data-tooltip-id="distributions-help"
                                  data-tooltip-content={t('sidebar.current_validation.distributions_help')}
                                  style={{ border: 'none', background: 'none', top: '0px', right: '2px' }}
                                >
                                  <i className="bi bi-question-circle-fill text-muted small"></i>
                                </button>
                              </div>
                              <div className="fs-6 fw-bold text-success">
                                {validationResult.stats.distributions}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* MQA Information */}
              <div className="card mb-3">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-info-circle me-2"></i>
                    {t('sidebar.about_mqa')}
                  </h6>
                </div>
                <div className="card-body py-2">
                  <p className="small mb-2">
                    {t('sidebar.mqa_description')} <strong>{profileInfo.name}</strong>.
                  </p>
                  <a 
                    href={profileInfo.url}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-outline-primary btn-sm w-100"
                  >
                    <i className="bi bi-box-arrow-up-right me-1"></i>
                    {t('sidebar.learn_more')}
                  </a>
                </div>
              </div>

              {/* Rating Scale */}
              <div className="card mb-3">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-star me-2"></i>
                    {t('sidebar.principles.rating_scale')}
                  </h6>
                </div>
                <div className="card-body py-2">
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th className="border-0 py-1 small">{t('sidebar.principles.rating')}</th>
                          <th className="border-0 py-1 small text-end">{t('sidebar.principles.points')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ratings.map((rating, index) => (
                          <tr key={index}>
                            <td className="border-0 py-1">
                              <span className={`badge bg-${rating.color} small`}>
                                {rating.label}
                              </span>
                            </td>
                            <td className="border-0 py-1 text-end small font-monospace">
                              {rating.points}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <small className="text-muted mt-2 d-block">
                    {t('sidebar.principles.max_points')}: {profileInfo.maxPoints}
                  </small>
                </div>
              </div>

              {/* FAIR+C Principles */}
              <div className="card mb-3">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-list-check me-2"></i>
                    {t('sidebar.principles.fairc_principles')}
                  </h6>
                </div>
                <div className="card-body py-2">
                  <div className="list-group list-group-flush">
                    {[
                      { key: 'findability', icon: 'bi-search', letter: 'F' },
                      { key: 'accessibility', icon: 'bi-unlock', letter: 'A' },
                      { key: 'interoperability', icon: 'bi-link-45deg', letter: 'I' },
                      { key: 'reusability', icon: 'bi-recycle', letter: 'R' },
                      { key: 'contextuality', icon: 'bi-clipboard-data', letter: 'C' }
                    ].map(({ key, icon, letter }) => (
                      <div key={key} className="list-group-item border-0 px-0 py-1">
                        <div className="d-flex align-items-center">
                          <span className="badge bg-secondary rounded-circle me-2" style={{ width: '24px', height: '24px', fontSize: '12px' }}>
                            {letter}
                          </span>
                          <i className={`${icon} me-2`}></i>
                          <small className="flex-grow-1">
                            <strong>{t(`results.dimensions.${key}`)}</strong>
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="card">
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-link-45deg me-2"></i>
                    {t('sidebar.links.quick_links')}
                  </h6>
                </div>
                <div className="card-body py-2">
                  <div className="d-grid gap-2">
                    <a 
                      href="https://data.europa.eu/mqa/methodology"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-outline-info btn-sm"
                    >
                      <i className="bi bi-journal-text me-1"></i>
                      {t('sidebar.links.mqa_methodology')}
                    </a>
                    <a 
                      href="https://www.w3.org/TR/shacl/"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-outline-secondary btn-sm"
                    >
                      <i className="bi bi-book me-1"></i>
                      {t('sidebar.links.shacl_docs')}
                    </a>
                    <a 
                      href="https://www.go-fair.org/fair-principles/"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-outline-secondary btn-sm"
                    >
                      <i className="bi bi-book me-1"></i>
                      {t('sidebar.links.fair_principles')}
                    </a>
                    <a 
                      href="https://github.com/mjanez/metadata-quality-react"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-outline-secondary btn-sm"
                    >
                      <i className="bi bi-github me-1"></i>
                      {t('sidebar.links.github_repository')}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Collapsed State Icons - show when collapsed */}
        {!isVisible && (
          <div className="d-flex flex-column align-items-center py-3 flex-grow-1">
            <div className="mb-3">
              <img 
                src={profileInfo.icon} 
                alt={profileInfo.name}
                className="rounded-circle"
                style={{ 
                  width: '32px', 
                  height: '32px',
                  objectFit: 'cover'
                }}
              />
            </div>
            
            {validationResult && validationResult.quality && validationResult.quality.totalScore > 0 && (
              <div className="text-center mb-3">
                <div className={`small fw-bold ${getScoreColorClass(validationResult.quality.totalScore, selectedProfile)}`}>
                  {validationResult.quality.totalScore.toFixed(0)}
                </div>
                <div className="small text-muted" style={{ fontSize: '10px' }}>
                  {validationResult.quality.percentage.toFixed(0)}%
                </div>
              </div>
            )}

            <div className="d-flex flex-column gap-2 align-items-center">
              <i className="bi bi-info-circle text-muted" title={t('sidebar.about_mqa')}></i>
              <i className="bi bi-star text-muted" title={t('sidebar.principles.rating_scale')}></i>
              <i className="bi bi-list-check text-muted" title={t('sidebar.principles.fairc_principles')}></i>
              <i className="bi bi-link-45deg text-muted" title={t('sidebar.links.quick_links')}></i>
            </div>
          </div>
        )}

        {/* React Tooltip Components */}
        <Tooltip 
          id="datasets-help" 
          place="top"
          style={{ zIndex: 10000 }}
          className="custom-tooltip"
        />
        <Tooltip 
          id="data-services-help" 
          place="top"
          style={{ zIndex: 10000 }}
          className="custom-tooltip"
        />
        <Tooltip 
          id="distributions-help" 
          place="top"
          style={{ zIndex: 10000 }}
          className="custom-tooltip"
        />
      </div>

  );
};

export default MQAInfoSidebar;