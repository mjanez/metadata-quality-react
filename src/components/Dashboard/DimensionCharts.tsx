import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import QualityChart from '../QualityChart';
import DimensionChart from './DimensionChart';
import ScoreBadge from '../common/ScoreBadge';
import { DashboardMetricsData } from './DashboardTypes';
import { getRatingFromScore, getScoreColorClass, getScoreProgressClass, getProgressBarStyle, getProgressBarBaseClass } from '../../utils/ratingUtils';
import MQAService from '../../services/MQAService';
// fflate for creating ZIP archives in browser

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface DimensionChartsProps {
  metricsData: DashboardMetricsData;
  showProfileCard?: boolean;
}

const DimensionCharts: React.FC<DimensionChartsProps> = ({ metricsData, showProfileCard = false }) => {
  const { t } = useTranslation();
  const barChartRef = useRef<any>(null);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-bs-theme') || 'light');
  
  // Helper function using new rating system
  const getScoreColor = (score: number) => {
    const profileId = metricsData.profile?.id;
    if (!profileId) {
      // Fallback para casos sin profile definido
      if (score >= 350) return 'text-success';
      if (score >= 220) return 'text-success-light';
      if (score >= 120) return 'text-warning';
      return 'text-danger';
    }
    return getScoreColorClass(score, profileId as any);
  };
  
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

  // Prepare dimension data
  const dimensions = Object.keys(metricsData.dimensions).map(dimension => ({
    name: dimension,
    score: metricsData.dimensions[dimension as keyof typeof metricsData.dimensions],
    // Calculate max possible score for this dimension
    maxScore: metricsData.metrics
      .filter(metric => metric.dimension === dimension)
      .reduce((sum, metric) => sum + metric.maxScore, 0),
  }));

  // Calculate percentages for dimensions
  const dimensionData = dimensions.map(dim => ({
    ...dim,
    percentage: dim.maxScore > 0 ? (dim.score / dim.maxScore) * 100 : 0
  }));
  
  // Calculate total max score and overall percentage
  const totalMaxScore = dimensions.reduce((sum, dim) => sum + dim.maxScore, 0);
  const overallPercentage = totalMaxScore > 0 ? (metricsData.totalScore / totalMaxScore) * 100 : 0;

  // Prepare data for QualityChart
  const qualityChartData = dimensions.reduce((acc, dim) => {
    acc[dim.name] = {
      score: dim.score,
      maxScore: dim.maxScore,
      percentage: dim.maxScore > 0 ? (dim.score / dim.maxScore) * 100 : 0
    };
    return acc;
  }, {} as Record<string, { score: number; maxScore: number; percentage: number }>);

  const downloadChart = (chartRef: React.RefObject<any>, filename: string) => {
    if (chartRef.current) {
      const canvas = chartRef.current.canvas;
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
    }
  };

  const downloadAllCharts = async () => {
    try {
      // Dynamic import to reduce bundle size
      const { zip } = await import(/* webpackChunkName: "fflate" */ 'fflate');
      
      // Collect all files to zip
      const files: { [key: string]: Uint8Array } = {};

      // Add main bar chart
      if (barChartRef.current) {
        const barCanvas = barChartRef.current.canvas;
        const barDataUrl = barCanvas.toDataURL('image/png');
        const barData = barDataUrl.split(',')[1];
        files['dimension-scores-bar.png'] = new Uint8Array(
          atob(barData).split('').map(c => c.charCodeAt(0))
        );
      }

      // Add radar chart (QualityChart)
      const radarCanvas = document.querySelector('#quality-radar-chart canvas') as HTMLCanvasElement;
      if (radarCanvas) {
        const radarDataUrl = radarCanvas.toDataURL('image/png');
        const radarData = radarDataUrl.split(',')[1];
        files['quality-radar-chart.png'] = new Uint8Array(
          atob(radarData).split('').map(c => c.charCodeAt(0))
        );
      }

      // Add individual dimension charts
      dimensionData.forEach((dim) => {
        const canvas = document.querySelector(`#dimension-chart-${dim.name} canvas`) as HTMLCanvasElement;
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/png');
          const data = dataUrl.split(',')[1];
          files[`${dim.name}-metrics-chart.png`] = new Uint8Array(
            atob(data).split('').map(c => c.charCodeAt(0))
          );
        }
      });

      // Add JSON data file
      const jsonData = {
        source: metricsData.source,
        created: metricsData.created,
        profile: metricsData.profile,
        totalScore: metricsData.totalScore,
        maxScore: totalMaxScore,
        rating: getRatingFromScore(metricsData.totalScore, metricsData.profile?.id as any),
        overallPercentage: overallPercentage.toFixed(1),
        dimensions: metricsData.dimensions,
        metrics: metricsData.metrics,
        dimensionData: dimensionData.map(dim => ({
          name: dim.name,
          score: dim.score,
          maxScore: dim.maxScore,
          percentage: parseFloat(dim.percentage.toFixed(1))
        }))
      };
      
      const jsonString = JSON.stringify(jsonData, null, 2);
      files['metrics-data.json'] = new TextEncoder().encode(jsonString);

      // Create ZIP
      zip(files, (err, data) => {
        if (err) {
          console.error('Error creating ZIP:', err);
          alert(t('errors.unknown_error'));
          return;
        }
        
        // Download ZIP
        const arrayBuffer = (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength);
        const blob = new Blob([arrayBuffer], { type: 'application/zip' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `quality-charts-${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        URL.revokeObjectURL(link.href);
      });
      
    } catch (error) {
      console.error('Error downloading charts:', error);
      alert(t('errors.unknown_error'));
    }
  };

  // Bar Chart Configuration
  const barData = {
    labels: dimensionData.map(dim => t(`results.dimensions.${dim.name}`) || dim.name),
    datasets: [
      {
        label: t('dashboard.overview.overall_score'),
        data: dimensionData.map(dim => dim.score),
        backgroundColor: 'rgba(13, 110, 253, 0.2)',
        borderColor: 'rgba(13, 110, 253, 1)',
        borderWidth: 2,
      },
      {
        label: t('dashboard.table.max_score'),
        data: dimensionData.map(dim => dim.maxScore),
        backgroundColor: 'rgba(108, 117, 125, 0.3)',
        borderColor: 'rgba(108, 117, 125, 1)',
        borderWidth: 1,
      },
    ],
  };

  const isDark = theme === 'dark';
  const textColor = isDark ? '#ffffff' : '#000000';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: textColor,
        }
      },
      tooltip: {
        callbacks: {
          afterLabel: (context: any) => {
            const dimension = dimensionData[context.dataIndex];
            return `${t('dashboard.table.percentage')}: ${dimension.percentage.toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  // Metrics by dimension for detailed table
  const metricsByDimension = dimensions.reduce((acc, dim) => {
    acc[dim.name] = metricsData.metrics.filter(metric => metric.dimension === dim.name);
    return acc;
  }, {} as Record<string, typeof metricsData.metrics>);

  // Profile Card Component
  const ProfileCard = () => {
    // Handle both string and Profile object formats
    let profileString = '';
    let profileDisplayName = '';
    let profileUrl = '';
    
    if (typeof metricsData.profile === 'string') {
      // Legacy string format
      profileString = metricsData.profile;
    } else if (metricsData.profile && typeof metricsData.profile === 'object') {
      // New Profile object format
      profileString = metricsData.profile.id || 'dcat_ap_es';
      profileDisplayName = metricsData.profile.name || '';
      profileUrl = metricsData.profile.url || '';
    } else {
      // Fallback
      profileString = 'dcat_ap_es';
    }
    
    console.debug('ProfileCard - profile:', metricsData.profile, 'profileString:', profileString);
    
    // If we don't have profileDisplayName from the object, try to get it from MQAService
    if (!profileDisplayName) {
      const profileInfo = MQAService.getProfileInfo(profileString as any);
      const defaultVersion = profileInfo?.defaultVersion;
      const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
      const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;

      if (isValidVersionInfo) {
        profileDisplayName = (versionInfo as any).name;
        if (!profileUrl) {
          profileUrl = (versionInfo as any).url || '';
        }
      } else {
        // Try translation first, then format the profile string
        const translationKey = `validation.profiles.${profileString}`;
        const translatedName = t(translationKey);
        if (translatedName !== translationKey) {
          profileDisplayName = translatedName;
        } else {
          // Format profile string for display
          profileDisplayName = profileString.replace(/_/g, '-').toUpperCase();
        }
      }
    }
    
    const profileInfo = MQAService.getProfileInfo(profileString as any);
    const defaultVersion = profileInfo?.defaultVersion;
    const versionInfo = defaultVersion && profileInfo?.versions?.[defaultVersion];
    const isValidVersionInfo = versionInfo && typeof versionInfo === 'object' && 'name' in versionInfo;
    const maxScore = isValidVersionInfo ? (versionInfo as any).maxScore : undefined;
    
    return (
      <div className="col-md-4">
        <div className="card h-100">
          <div className="card-body text-center d-flex flex-column justify-content-center">
            <div className="mb-2">
              {isValidVersionInfo && (versionInfo as any).icon ? (
                // Check if icon is an image file (ends with image extensions) or a URL
                (typeof (versionInfo as any).icon === 'string' && 
                 ((versionInfo as any).icon.startsWith('http') || 
                  (versionInfo as any).icon.endsWith('.svg') || 
                  (versionInfo as any).icon.endsWith('.png') || 
                  (versionInfo as any).icon.endsWith('.jpg') || 
                  (versionInfo as any).icon.endsWith('.jpeg'))) ? (
                  <img
                    src={(versionInfo as any).icon}
                    alt={profileDisplayName}
                    style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%' }}
                  />
                ) : (
                  // Assume it's a Bootstrap icon class
                  <i
                    className={`${(versionInfo as any).icon || 'bi bi-shield-check'} text-info`}
                    style={{ fontSize: '1.5rem' }}
                    aria-hidden="true"
                  ></i>
                )
              ) : (
                <i className="bi bi-shield-check text-info" style={{ fontSize: '1.5rem' }}></i>
              )}
            </div>
            <h6 className="card-title text-secondary">
              {t('dashboard.files.validation_profile')}
            </h6>
            <span className="card-title text-primary">
              <a href={profileUrl}  target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary btn-sm"><i className="bi bi-box-arrow-up-right me-1"></i>{profileDisplayName}</a>
            </span>
            {defaultVersion && (
              <small className="text-muted d-block">
                {t('dashboard.files.version')}: {defaultVersion}
              </small>
            )}
            {maxScore && (
              <small className="text-muted d-block">
                {t('dashboard.table.max_score')}: {maxScore}
              </small>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dimension-charts">
      {/* Main Total Score Card - Top Row */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title mb-0">
                <i className="bi bi-trophy-fill text-secondary me-2"></i>
                {t('dashboard.overview.total_score')}
              </h6>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={downloadAllCharts}
                title={t('dashboard.downloads.download_all_charts')}
              >
                <i className="bi bi-file-earmark-zip me-1"></i>
                {t('dashboard.downloads.download_all_charts')}
              </button>
            </div>
            <div className="card-body text-center">
              <div className="mb-2">
                <span className={`badge fs-5 ${getScoreProgressClass(metricsData.totalScore, metricsData.profile?.id as any)}`}>
                  {t(`results.ratings.${getRatingFromScore(metricsData.totalScore, metricsData.profile?.id as any)}`)}
                </span>
              </div>
              <div className={`display-3 fw-bold ${getScoreColor(metricsData.totalScore)}`}>
                {metricsData.totalScore.toFixed(1)}
              </div>
              <div className="progress mt-3 mx-auto" style={{ height: '8px', maxWidth: '400px' }}>
                <div
                  className={`progress-bar ${getProgressBarBaseClass(metricsData.totalScore, metricsData.profile?.id as any)}`}
                  style={{ 
                    width: `${overallPercentage}%`,
                    ...getProgressBarStyle(metricsData.totalScore, metricsData.profile?.id as any)
                  }}
                ></div>
              </div>
              <p className="text-muted mt-2 mb-0 fs-6">
                {metricsData.totalScore.toFixed(1)} / {totalMaxScore} puntos ({overallPercentage.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Secondary Cards Row - Profile, Dimensions, Total Metrics */}
      <div className="row mb-4">
        {/* Profile Card - Only shown if showProfileCard is true */}
        {showProfileCard && <ProfileCard />}
        
        {/* Dimensions Card */}
        <div className={showProfileCard ? "col-md-4" : "col-md-6"}>
          <div className="card text-center h-100">
            <div className="card-body d-flex flex-column justify-content-center">
              <div className="mb-2">
                <i className="bi bi-pie-chart-fill text-info" style={{ fontSize: '1.5rem' }}></i>
              </div>
              <h3 className="card-title text-info mb-2">{dimensionData.length}</h3>
              <p className="card-text mb-0">{t('dashboard.overview.dimensions')}</p>
            </div>
          </div>
        </div>
        
        {/* Total Metrics Card */}
        <div className={showProfileCard ? "col-md-4" : "col-md-6"}>
          <div className="card text-center h-100">
            <div className="card-body d-flex flex-column justify-content-center">
              <div className="mb-2">
                <i className="bi bi-list-check text-warning" style={{ fontSize: '1.5rem' }}></i>
              </div>
              <h3 className="card-title text-warning mb-2">{metricsData.metrics.length}</h3>
              <p className="card-text mb-0">{t('dashboard.overview.total_metrics')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="row mb-4">
        {/* Bar Chart */}
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title mb-0">{t('dashboard.visualizations.dimension_scores')}</h6>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => downloadChart(barChartRef, 'dimension-scores-bar.png')}
                title={t('dashboard.downloads.download_bar_chart')}
              >
                <i className="bi bi-download me-1"></i>
                {t('common.actions.download')}
              </button>
            </div>
            <div className="card-body">
              <div style={{ height: '300px' }}>
                <Bar ref={barChartRef} data={barData} options={barOptions} />
              </div>
            </div>
          </div>
        </div>

        {/* Radar Chart using QualityChart */}
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h6 className="card-title mb-0">{t('dashboard.visualizations.quality_radar')}</h6>
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => {
                  // We'll implement this later with the ZIP download functionality
                  console.log('Download radar chart');
                }}
                title={t('dashboard.downloads.download_radar_chart')}
              >
                <i className="bi bi-download me-1"></i>
                {t('common.actions.download')}
              </button>
            </div>
            <div className="card-body" id="quality-radar-chart">
              <QualityChart data={qualityChartData} />
            </div>
          </div>
        </div>
      </div>

      {/* Individual Dimension Charts */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h6 className="card-title mb-0">
                  <i className="bi bi-bar-chart me-2"></i>
                  {t('dashboard.visualizations.dimension_specific_charts')}
                </h6>
              </div>
            </div>
            <div className="card-body">
              <div className="row">
                {dimensionData.map((dimension) => {
                  const dimensionMetrics = metricsByDimension[dimension.name];
                  if (!dimensionMetrics || dimensionMetrics.length === 0) return null;

                  return (
                    <div key={dimension.name} className="col-md-6 col-xl-4 mb-4">
                      <div id={`dimension-chart-${dimension.name}`}>
                        <DimensionChart
                          dimension={dimension.name}
                          metricsData={metricsData}
                          onDownload={downloadChart}
                          theme={theme}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Metrics Table */}
      <div className="card">
        <div className="card-header">
          <h6 className="card-title mb-0">
            <i className="bi bi-table me-2"></i>
            {t('dashboard.visualizations.detailed_metrics')}
          </h6>
        </div>
        <div className="card-body">
          <div className="accordion" id="metricsAccordion">
            {dimensionData.map((dimension, index) => (
              <div className="accordion-item" key={dimension.name}>
                <h2 className="accordion-header" id={`heading-${dimension.name}`}>
                  <button
                    className="accordion-button collapsed"
                    type="button"
                    data-bs-toggle="collapse"
                    data-bs-target={`#collapse-${dimension.name}`}
                    aria-expanded="false"
                    aria-controls={`collapse-${dimension.name}`}
                  >
                    <div className="d-flex w-100 justify-content-between align-items-center me-3">
                      <span className="fw-bold">
                        {t(`results.dimensions.${dimension.name}`) || dimension.name}
                      </span>
                      <div className="d-flex align-items-center">
                        <ScoreBadge 
                          score={dimension.score}
                          maxScore={dimension.maxScore}
                          variant="score"
                          size="sm"
                          className="me-2"
                          profile={metricsData.profile?.id as any}
                        />
                        <ScoreBadge 
                          percentage={dimension.percentage}
                          variant="percentage"
                          size="sm"
                          profile={metricsData.profile?.id as any}
                        />
                      </div>
                    </div>
                  </button>
                </h2>
                <div
                  id={`collapse-${dimension.name}`}
                  className="accordion-collapse collapse"
                  aria-labelledby={`heading-${dimension.name}`}
                  data-bs-parent="#metricsAccordion"
                >
                  <div className="accordion-body">
                    <div className="table-responsive">
                      <table className="table table-sm table-striped">
                        <thead>
                          <tr>
                            <th>{t('dashboard.table.metric_id')}</th>
                            <th>{t('dashboard.table.score')}</th>
                            <th>{t('dashboard.table.max_score')}</th>
                            <th>{t('dashboard.table.percentage')}</th>
                            <th>{t('dashboard.table.weight')}</th>
                            <th>{t('dashboard.table.found')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metricsByDimension[dimension.name]?.map((metric, metricIndex) => (
                            <tr key={`${metric.id}-${metricIndex}`}>
                              <td><code className="small">{metric.id}</code></td>
                              <td>
                                <ScoreBadge 
                                  score={metric.score}
                                  maxScore={metric.maxScore}
                                  variant="score"
                                  size="sm"
                                  profile={metricsData.profile?.id as any}
                                />
                              </td>
                              <td>{metric.maxScore}</td>
                              <td>
                                <ScoreBadge 
                                  percentage={(metric.percentage * 100)}
                                  variant="percentage"
                                  size="sm"
                                  profile={metricsData.profile?.id as any}
                                />
                              </td>
                              <td>{metric.weight}</td>
                              <td>
                                <i className={`bi bi-${metric.found ? 'check-circle-fill text-success' : 'x-circle-fill text-danger'}`}></i>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DimensionCharts;