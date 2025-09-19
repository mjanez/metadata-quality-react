import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from 'react-tooltip';
import { ValidationProfile } from '../types';
import { formatValidationDurationWithIcon } from '../utils/timeUtils';
import { getFormattedRatingRanges, getScoreBackgroundClass, getScoreColorClass, getScoreProgressClass, getProgressBarStyle, getProgressBarBaseClass } from '../utils/ratingUtils';
import MQAService from '../services/MQAService';

interface ResponsiveSidebarProps {
  selectedProfile?: ValidationProfile;
  validationResult?: any;
  isVisible?: boolean;
  onToggle?: () => void;
}

const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({ 
  selectedProfile = 'dcat_ap_es', 
  validationResult = null,
  isVisible = true,
  onToggle
}) => {
  const { t } = useTranslation();
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
    const profileInfo = MQAService.getProfileInfo(profile);
    const defaultVersion = profileInfo?.defaultVersion;
    const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
    const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;
    
    if (!isValidVersionInfo) {
      return {
        name: profile.replace(/_/g, '-').toUpperCase(),
        style: 'text-primary',
        icon: 'img/icons/esp.svg',
        description: t(`validation.profiles.${profile}_description`),
        maxPoints: 405,
        url: '#'
      };
    }

    return {
      name: (versionInfo as any).name,
      style: 'text-primary',
      icon: (versionInfo as any).icon || 'img/icons/esp.svg',
      description: t(`validation.profiles.${profile}_description`),
      maxPoints: (versionInfo as any).maxScore,
      url: (versionInfo as any).url || '#'
    };
  };

  const profileInfo = getProfileInfo(selectedProfile);
  
  const getRatingRanges = () => {
    return getFormattedRatingRanges(selectedProfile);
  };

  const getBadgeColor = (score: number) => {
    return getScoreBackgroundClass(score, selectedProfile);
  };

  const ratings = getRatingRanges();

  return (
    <>
      {/* Mobile Overlay - Only show on mobile when sidebar is visible */}
      {isVisible && (
        <div 
          className="position-fixed w-100 h-100 d-lg-none"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1045,
            top: 0,
            left: 0
          }}
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`responsive-sidebar position-fixed h-100 border-end shadow-sm d-flex flex-column ${theme === 'dark' ? 'bg-dark border-secondary' : 'bg-white'} ${
          isVisible ? 'sidebar-open' : 'sidebar-collapsed'
        }`}
        style={{
          zIndex: 1050,
          top: '76px', // Below navbar
          left: 0,
          width: isVisible ? '350px' : '60px',
          height: 'calc(100vh - 76px)',
          transition: 'all 0.3s ease-in-out',
          overflow: 'hidden'
        }}
      >
        {/* Collapsed State - Always visible */}
        {!isVisible && (
          <div className="d-flex flex-column align-items-center py-3 h-100">
            {/* Toggle Button */}
            <button
              className={`btn ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'} btn-sm mb-3`}
              onClick={onToggle}
              style={{
                width: '36px',
                height: '36px',
                padding: '0',
                borderRadius: '50%'
              }}
              title={t('sidebar.expand')}
            >
              <i className="bi bi-chevron-right"></i>
            </button>

            {/* Profile Icon */}
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
                title={profileInfo.name}
              />
            </div>
            
            {/* Score indicator if available - moved up and improved */}
            {validationResult && validationResult.quality && validationResult.quality.totalScore > 0 && (
              <div className="text-center mb-3">
                <div className={`fw-bold ${getBadgeColor(validationResult.quality.totalScore).replace('bg-', 'text-')}`} 
                     style={{ fontSize: '14px' }}>
                  {validationResult.quality.totalScore.toFixed(1)}
                </div>
                <div className="text-muted" style={{ fontSize: '10px' }}>
                  {validationResult.quality.percentage.toFixed(0)}%
                </div>
              </div>
            )}

            {/* Validation time if available */}
            {validationResult && validationResult.validationDuration && (
              <div className="text-center mb-3">
                <div className="d-flex flex-column align-items-center">
                  <i className="bi bi-stopwatch text-muted" style={{ fontSize: '16px' }}></i>
                  <div className="text-muted mt-1" style={{ fontSize: '10px', fontWeight: '500' }}>
                    {validationResult.validationDuration < 10000 ? 
                     `${(validationResult.validationDuration / 1000).toFixed(1)}s` :
                     `${Math.round(validationResult.validationDuration / 1000)}s`}
                  </div>
                </div>
              </div>
            )}

            {/* Entity counts if available */}
            {validationResult && validationResult.stats && (
              <div className="text-center mb-3">
                <div className="d-flex flex-column gap-2">
                  {validationResult.stats.datasets > 0 && (
                    <div className="d-flex flex-column align-items-center">
                      <i 
                        className="bi bi-database text-primary" 
                        style={{ fontSize: '14px' }}
                        title={t('sidebar.entities.datasets')}
                      ></i>
                      <div className="text-muted" style={{ fontSize: '10px', fontWeight: '500' }}>
                        {validationResult.stats.datasets}
                      </div>
                    </div>
                  )}
                  {validationResult.stats.dataServices > 0 && (
                    <div className="d-flex flex-column align-items-center">
                      <i 
                        className="bi bi-cloud-arrow-up text-info" 
                        style={{ fontSize: '14px' }}
                        title={t('sidebar.entities.data_services')}
                      ></i>
                      <div className="text-muted" style={{ fontSize: '10px', fontWeight: '500' }}>
                        {validationResult.stats.dataServices}
                      </div>
                    </div>
                  )}
                  {validationResult.stats.distributions > 0 && (
                    <div className="d-flex flex-column align-items-center">
                      <i 
                        className="bi bi-folder-symlink text-success" 
                        style={{ fontSize: '14px' }}
                        title={t('sidebar.entities.distributions')}
                      ></i>
                      <div className="text-muted" style={{ fontSize: '10px', fontWeight: '500' }}>
                        {validationResult.stats.distributions}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Minimal navigation icons - moved to bottom */}
            <div className="d-flex flex-column gap-2 align-items-center mt-auto mb-3">
              <button 
                className="btn btn-link p-0 text-muted"
                style={{ fontSize: '14px' }}
                title={t('sidebar.about_mqa')}
                onClick={onToggle}
              >
                <i className="bi bi-info-circle"></i>
              </button>
              <button 
                className="btn btn-link p-0 text-muted"
                style={{ fontSize: '14px' }}
                title={t('sidebar.principles.rating_scale')}
                onClick={onToggle}
              >
                <i className="bi bi-star"></i>
              </button>
              <button 
                className="btn btn-link p-0 text-muted"
                style={{ fontSize: '14px' }}
                title={t('sidebar.principles.fairc_principles')}
                onClick={onToggle}
              >
                <i className="bi bi-list-check"></i>
              </button>
              <button 
                className="btn btn-link p-0 text-muted"
                style={{ fontSize: '14px' }}
                title={t('sidebar.links.quick_links')}
                onClick={onToggle}
              >
                <i className="bi bi-link-45deg"></i>
              </button>
            </div>
          </div>
        )}

        {/* Expanded State */}
        {isVisible && (
          <div className="d-flex flex-column h-100">
            {/* Header with toggle */}
            <div className="d-flex justify-content-center align-items-center p-3 border-bottom flex-shrink-0">
              <button
                className={`btn ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-secondary'} btn-sm`}
                onClick={onToggle}
                style={{
                  width: '32px',
                  height: '32px',
                  padding: '0',
                  borderRadius: '50%'
                }}
                title={t('sidebar.collapse')}
              >
                <i className="bi bi-chevron-left"></i>
              </button>
            </div>

            {/* Scrollable content - improved height calculation and padding */}
            <div className="flex-grow-1" style={{ 
              height: 'calc(100% - 64px)', // Subtract header height
              overflowY: 'auto',
              overflowX: 'hidden',
              paddingLeft: '1rem',
              paddingRight: '1rem',
              paddingTop: '1rem',
              paddingBottom: '4rem' // Much larger bottom padding for complete links visibility
            }}>
              {/* Profile Banner */}
              <div className={`card mb-3 border-0 ${theme === 'dark' ? 'bg-dark' : 'bg-gradient'}`}>
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

              {/* Current Validation Stats */}
              {validationResult && validationResult.quality && validationResult.quality.totalScore > 0 && (
                <>
                  {/* Total Score Card */}
                  <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
                    <div className="card-header py-2">
                      <h6 className="card-title mb-0">
                        <i className="bi bi-trophy me-2"></i>
                        {t('sidebar.current_validation.total_score')}
                      </h6>
                    </div>
                    <div className="card-body py-3 text-center">
                      <div className={`display-6 fw-bold ${getBadgeColor(validationResult.quality.totalScore).replace('bg-', 'text-')}`}>
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
                    <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
                      <div className="card-header py-2">
                        <h6 className="card-title mb-0">
                          <i className="bi bi-stopwatch me-2"></i>
                          {t('sidebar.current_validation.validation_time')}
                        </h6>
                      </div>
                      <div className="card-body py-3 text-center">
                        {(() => {
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

                  {/* Entity Statistics Card */}
                  {validationResult.stats && (validationResult.stats.datasets > 0 || validationResult.stats.dataServices > 0 || validationResult.stats.distributions > 0) && (
                    <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
                      <div className="card-header py-2">
                        <h6 className="card-title mb-0">
                          <i className="bi bi-diagram-3 me-2"></i>
                          {t('sidebar.current_validation.entity_statistics')}
                        </h6>
                      </div>
                      <div className="card-body py-2">
                        <div className="row g-2 text-center">
                          {validationResult.stats.datasets > 0 && (
                            <div className="col-4">
                              <div className="border rounded py-3">
                                <i 
                                  className="bi bi-database text-primary d-block mb-2" 
                                  style={{ fontSize: '24px' }}
                                  title={t('sidebar.entities.datasets')}
                                ></i>
                                <div className="fw-bold fs-5">{validationResult.stats.datasets}</div>
                              </div>
                            </div>
                          )}
                          {validationResult.stats.dataServices > 0 && (
                            <div className="col-4">
                              <div className="border rounded py-3">
                                <i 
                                  className="bi bi-cloud-arrow-up text-info d-block mb-2" 
                                  style={{ fontSize: '24px' }}
                                  title={t('sidebar.entities.data_services')}
                                ></i>
                                <div className="fw-bold fs-5">{validationResult.stats.dataServices}</div>
                              </div>
                            </div>
                          )}
                          {validationResult.stats.distributions > 0 && (
                            <div className="col-4">
                              <div className="border rounded py-3">
                                <i 
                                  className="bi bi-folder-symlink text-secondary d-block mb-2" 
                                  style={{ fontSize: '24px' }}
                                  title={t('sidebar.entities.distributions')}
                                ></i>
                                <div className="fw-bold fs-5">{validationResult.stats.distributions}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Rest of the content - same as before but with better styling */}
              {/* MQA Information */}
              <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-info-circle me-2"></i>
                    {t('sidebar.about_mqa')}
                  </h6>
                </div>
                <div className="card-body py-2">
                  <p className="small mb-2 text-center">
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
              <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
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
                                {t(`results.ratings.${rating.label}`)}
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
              <div className={`card mb-3 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
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
              <div className={`card mb-5 ${theme === 'dark' ? 'bg-dark border-secondary' : ''}`}>
                <div className="card-header py-2">
                  <h6 className="card-title mb-0">
                    <i className="bi bi-link-45deg me-2"></i>
                    {t('sidebar.links.quick_links')}
                  </h6>
                </div>
                <div className="card-body py-3">
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
          </div>
        )}
      </div>

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
    </>
  );
};

export default ResponsiveSidebar;