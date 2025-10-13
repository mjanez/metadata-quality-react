import React from 'react';
import { useTranslation } from 'react-i18next';
import { QualityAnalysisResult, DataQualityReport, QualityObservation } from '../../types/dataQuality';
import {
  exportIndicatorsCSV,
  exportSampleRecordsCSV,
  exportObservationsCSV,
  exportAllCSVs,
  downloadCSV
} from '../../utils/DataQualityCsvExport';

interface DataQualityReportViewerProps {
  result: QualityAnalysisResult;
}

const DataQualityReportViewer: React.FC<DataQualityReportViewerProps> = ({ result }) => {
  const { t } = useTranslation();
  
  if (result.status === 'error') {
    return (
      <div className="alert alert-danger">
        <h4>{t('data_quality.report.error')}</h4>
        <p>{result.error}</p>
      </div>
    );
  }
  
  if (result.status === 'loading') {
    return (
      <div className="text-center py-4">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-2">{t('data_quality.report.analyzing')}</p>
      </div>
    );
  }

  const { report, observations, score } = result;

  // Export handlers
  const handleExportIndicators = () => {
    const csv = exportIndicatorsCSV(report);
    downloadCSV(csv, 'quality-indicators.csv');
  };

  const handleExportSamples = () => {
    const csv = exportSampleRecordsCSV(report);
    downloadCSV(csv, 'sample-records.csv');
  };

  const handleExportObservations = () => {
    const csv = exportObservationsCSV(observations);
    downloadCSV(csv, 'quality-observations.csv');
  };

  const handleExportAll = async () => {
    await exportAllCSVs(report, observations, 'data-quality-report');
  };

  return (
    <div className="data-quality-report">
      {/* Export Actions Bar */}
      <div className="card mb-3 border-primary">
        <div className="card-body py-2">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center">
                <i className="bi bi-download me-2 text-primary"></i>
                <strong className="text-primary">{t('common.actions.export')}</strong>
              </div>
              {(result.downloadUrl || result.sourceUrl) && (
                <div className="d-flex align-items-center">
                  <i className="bi bi-link-45deg me-1 text-secondary"></i>
                  <a 
                    href={result.downloadUrl || result.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-decoration-none small"
                    title={t('data_quality.report.viewOriginalFile')}
                  >
                    <i className="bi bi-box-arrow-up-right me-1"></i>
                    {t('data_quality.report.originalFile')}
                  </a>
                </div>
              )}
            </div>
            <div className="btn-group" role="group">
              <button 
                className="btn btn-sm btn-primary"
                onClick={handleExportAll}
                title={t('data_quality.report.downloadAll')}
              >
                <i className="bi bi-file-earmark-zip me-1"></i>
                {t('data_quality.report.downloadAll')}
              </button>
              <button 
                className="btn btn-sm btn-outline-primary"
                onClick={handleExportIndicators}
                title={t('data_quality.report.exportIndicators')}
              >
                <i className="bi bi-table me-1"></i>
                {t('data_quality.report.exportIndicators')}
              </button>
              <button 
                className="btn btn-sm btn-outline-primary"
                onClick={handleExportSamples}
                title={t('data_quality.report.exportSamples')}
              >
                <i className="bi bi-collection me-1"></i>
                {t('data_quality.report.exportSamples')}
              </button>
              <button 
                className="btn btn-sm btn-outline-primary"
                onClick={handleExportObservations}
                title={t('data_quality.report.exportObservations')}
              >
                <i className="bi bi-chat-left-text me-1"></i>
                {t('data_quality.report.exportObservations')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Overall Score */}
      <div className="card mb-4">
        <div className="card-header">
          <h4 className="mb-0">
            <i className="bi bi-clipboard-data me-2"></i>
            {t('data_quality.report.title')}
          </h4>
        </div>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-auto">
              <div className={`fs-1 fw-bold ${getScoreColor(score)}`}>
                {score.toFixed(1)}%
              </div>
            </div>
            <div className="col">
              <h5>{t('data_quality.report.overallScore')}</h5>
              <div className="progress" style={{ height: '8px' }}>
                <div 
                  className={`progress-bar ${getScoreColor(score)}`}
                  style={{ width: `${score}%` }}
                ></div>
              </div>
              <small className="text-muted">
                {getScoreDescription(score, t)}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Basic Information, Observations & About Tabs */}
      <div className="card mb-4">
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button 
                className="nav-link active" 
                id="basicInfo-tab" 
                data-bs-toggle="tab" 
                data-bs-target="#basicInfo" 
                type="button" 
                role="tab" 
                aria-controls="basicInfo" 
                aria-selected="true"
              >
                <i className="bi bi-info-circle me-2"></i>
                {t('data_quality.report.basicInfo')}
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className="nav-link" 
                id="observations-tab" 
                data-bs-toggle="tab" 
                data-bs-target="#observations" 
                type="button" 
                role="tab" 
                aria-controls="observations" 
                aria-selected="false"
              >
                <i className="bi bi-chat-left-text me-2"></i>
                {t('data_quality.report.observations')}
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className="nav-link" 
                id="about-tab" 
                data-bs-toggle="tab" 
                data-bs-target="#about" 
                type="button" 
                role="tab" 
                aria-controls="about" 
                aria-selected="false"
              >
                <i className="bi bi-book me-2"></i>
                {t('data_quality.about.title')}
              </button>
            </li>
          </ul>
        </div>
        <div className="card-body">
          <div className="tab-content">
            {/* Basic Info Tab */}
            <div className="tab-pane fade show active" id="basicInfo" role="tabpanel" aria-labelledby="basicInfo-tab">
              <div className="row g-3">
                {/* Primera fila: Columnas y Registros */}
                <div className="col-12">
                  <div className="row">
                    <div className="col-auto">
                      <table className="table table-sm table-borderless mb-0">
                        <tbody>
                          <tr>
                            <td className="text-muted pe-1">
                              <strong>{t('data_quality.report.columns')}:</strong>
                            </td>
                            <td><span className="badge bg-primary">{report.basicInfo.columns.length}</span></td>
                            <td className="text-muted pe-1">
                              <strong>{t('data_quality.report.records')}:</strong>
                            </td>
                            <td><span className="badge bg-info">{report.basicInfo.records.toLocaleString()}</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                
                {/* Segunda fila: Nombres de columnas y Valores ausentes */}
                <div className="col-md-6">
                  <div className="border rounded p-2 bg-light" style={{ height: '200px' }}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0 small">
                        <i className="bi bi-list-columns me-1"></i>
                        {t('data_quality.report.columnNames')}
                      </h6>
                      <div>
                        <span className="badge bg-secondary me-2">{report.basicInfo.columns.length}</span>
                        <button 
                          className="btn btn-sm btn-outline-secondary py-0 px-2" 
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(report.basicInfo.columns, null, 2));
                          }}
                          title={t('data_quality.selector.copy')}
                        >
                          <i className="bi bi-clipboard"></i>
                        </button>
                      </div>
                    </div>
                    <pre className="mb-0 small" style={{ fontSize: '0.8rem', maxHeight: '160px', overflowY: 'auto', overflowX: 'hidden', background: 'transparent', border: 'none', padding: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      <code>{JSON.stringify(report.basicInfo.columns, null, 2)}</code>
                    </pre>
                  </div>
                </div>
                
                <div className="col-md-6">
                  <div className="border rounded p-2 bg-light" style={{ height: '200px' }}>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h6 className="mb-0 small">
                        <i className="bi bi-exclamation-circle me-1"></i>
                        Valores ausentes
                      </h6>
                      <div>
                        <span className="badge bg-warning text-dark me-2">
                          {Object.values(
                            report.basicInfo.columns.reduce((acc: Record<string, number>, col: string) => {
                              const completenessRatio = report.completeness.completenessRatioByColumn[col] || 1;
                              acc[col] = Math.round(report.basicInfo.records * (1 - completenessRatio));
                              return acc;
                            }, {})
                          ).reduce((sum: number, val: number) => sum + val, 0)}
                        </span>
                        <button 
                          className="btn btn-sm btn-outline-secondary py-0 px-2" 
                          style={{ fontSize: '0.75rem' }}
                          onClick={() => {
                            const missingValues = report.basicInfo.columns.reduce((acc: Record<string, number>, col: string) => {
                              const completenessRatio = report.completeness.completenessRatioByColumn[col] || 1;
                              acc[col] = Math.round(report.basicInfo.records * (1 - completenessRatio));
                              return acc;
                            }, {});
                            navigator.clipboard.writeText(JSON.stringify(missingValues, null, 2));
                          }}
                          title={t('data_quality.selector.copy')}
                        >
                          <i className="bi bi-clipboard"></i>
                        </button>
                      </div>
                    </div>
                    <pre className="mb-0 small" style={{ fontSize: '0.8rem', maxHeight: '160px', overflowY: 'auto', overflowX: 'hidden', background: 'transparent', border: 'none', padding: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      <code>{JSON.stringify(
                        report.basicInfo.columns.reduce((acc: Record<string, number>, col: string) => {
                          const completenessRatio = report.completeness.completenessRatioByColumn[col] || 1;
                          acc[col] = Math.round(report.basicInfo.records * (1 - completenessRatio));
                          return acc;
                        }, {}),
                        null,
                        2
                      )}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Observations Tab */}
            <div className="tab-pane fade" id="observations" role="tabpanel" aria-labelledby="observations-tab">
              <div style={{ maxHeight: '400px', overflowY: 'auto' }} className="pe-2">
                {observations.map((obs: QualityObservation, index: number) => (
                  <div key={index} className="mb-3 pb-3 border-bottom">
                    <h6 className="text-capitalize mb-2">
                      <i className={`${getCharacteristicIcon(obs.characteristic)} me-2`}></i>
                      {t(`data_quality.characteristics.${obs.characteristic}`, obs.characteristic)}
                    </h6>
                    <div className="row">
                      <div className="col-md-6">
                        <p className="small text-muted mb-1"><strong>{t('data_quality.report.definition')}:</strong></p>
                        <p className="small">{obs.definition}</p>
                      </div>
                      <div className="col-md-6">
                        <p className="small text-muted mb-1"><strong>{t('data_quality.report.observations')}:</strong></p>
                        <p className="small">{obs.observations}</p>
                        {obs.recommendations && obs.recommendations.length > 0 && (
                          <div>
                            <p className="small text-muted mb-1"><strong>{t('data_quality.report.recommendations')}:</strong></p>
                            <ul className="small mb-0">
                              {obs.recommendations.map((rec: string, recIndex: number) => (
                                <li key={recIndex}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* About ISO/IEC 25012 Tab */}
            <div className="tab-pane fade" id="about" role="tabpanel" aria-labelledby="about-tab">
              <p className="mb-3">
                {t('data_quality.about.description')}
              </p>
              
              <div className="row">
                <div className="col-md-6">
                  <h6 className="text-primary">
                    <i className="bi bi-database me-2"></i>
                    {t('data_quality.about.inherent')}
                  </h6>
                  <ul className="small">
                    <li>{t('data_quality.characteristics.accuracy')}</li>
                    <li>{t('data_quality.characteristics.completeness')}</li>
                    <li>{t('data_quality.characteristics.consistency')}</li>
                    <li>{t('data_quality.characteristics.credibility')}</li>
                    <li>{t('data_quality.characteristics.currentness')}</li>
                    <li>{t('data_quality.characteristics.precision')}</li>
                    <li>{t('data_quality.characteristics.relevance')}</li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <h6 className="text-secondary">
                    <i className="bi bi-gear me-2"></i>
                    {t('data_quality.about.systemDependent')}
                  </h6>
                  <ul className="small">
                    <li>{t('data_quality.characteristics.accessibility')}</li>
                    <li>{t('data_quality.characteristics.portability')}</li>
                    <li>{t('data_quality.characteristics.recoverability')}</li>
                    <li>{t('data_quality.characteristics.security')}</li>
                    <li>{t('data_quality.characteristics.traceability')}</li>
                    <li>{t('data_quality.characteristics.understandability')}</li>
                    <li>{t('data_quality.characteristics.compliance')}</li>
                    <li>{t('data_quality.characteristics.availability')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="row">
        <div className="col-lg-8">
          {/* Detailed Metrics */}
          <QualityMetricsTable report={report} />
        </div>
        <div className="col-lg-4">
          {/* Sample Records */}
          <SampleRecordsViewer records={report.basicInfo.sampleRecords} />
        </div>
      </div>

    </div>
  );
};

// Quality Metrics Table Component
const QualityMetricsTable: React.FC<{ report: DataQualityReport }> = ({ report }) => {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="mb-0">
          <i className="bi bi-table me-2"></i>
          {t('data_quality.report.indicators')}
        </h5>
      </div>
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t('data_quality.report.category')}</th>
                <th>{t('data_quality.report.indicator')}</th>
                <th>{t('data_quality.report.result')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Accuracy */}
              <tr>
                <td rowSpan={1} className="fw-bold text-primary">
                  {t('data_quality.characteristics.accuracy')}
                </td>
                <td>{t('data_quality.indicators.outliersByColumn')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.accuracy.outliersByColumn, null, 2)}
                  </pre>
                </td>
              </tr>

              {/* Completeness */}
              <tr>
                <td rowSpan={3} className="fw-bold text-primary">
                  {t('data_quality.characteristics.completeness')}
                </td>
                <td>{t('data_quality.indicators.completenessRatio')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.completeness.completenessRatioByColumn, null, 2)}
                  </pre>
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.overallCompleteness')}</td>
                <td>
                  <span className={`badge ${report.completeness.overallCompletenessRatio >= 0.9 ? 'bg-success' : report.completeness.overallCompletenessRatio >= 0.7 ? 'bg-warning' : 'bg-danger'}`}>
                    {(report.completeness.overallCompletenessRatio * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.temporalCompleteness')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.completeness.temporalCompleteness, null, 2)}
                  </pre>
                </td>
              </tr>

              {/* Consistency */}
              <tr>
                <td className="fw-bold text-primary">
                  {t('data_quality.characteristics.consistency')}
                </td>
                <td>{t('data_quality.indicators.duplicatedRecords')}</td>
                <td>
                  <span className={`badge ${report.consistency.duplicatedRecords === 0 ? 'bg-success' : 'bg-warning'}`}>
                    {report.consistency.duplicatedRecords}
                  </span>
                </td>
              </tr>

              {/* Currentness */}
              <tr>
                <td rowSpan={3} className="fw-bold text-primary">
                  {t('data_quality.characteristics.currentness')}
                </td>
                <td>{t('data_quality.indicators.mostRecentDate')}</td>
                <td>{report.currentness.mostRecentDate || t('data_quality.report.notAvailable')}</td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.oldestDate')}</td>
                <td>{report.currentness.oldestDate || t('data_quality.report.notAvailable')}</td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.temporalCoverage')}</td>
                <td>{report.currentness.temporalCoverage || t('data_quality.report.notAvailable')}</td>
              </tr>

              {/* Accessibility */}
              <tr>
                <td className="fw-bold text-primary">
                  {t('data_quality.characteristics.accessibility')}
                </td>
                <td>{t('data_quality.indicators.accessible')}</td>
                <td>
                  <span className={`badge ${report.accessibility.accessible ? 'bg-success' : 'bg-danger'}`}>
                    {report.accessibility.accessible ? t('data_quality.report.true') : t('data_quality.report.false')}
                  </span>
                </td>
              </tr>

              {/* Traceability */}
              <tr>
                <td rowSpan={4} className="fw-bold text-secondary">
                  {t('data_quality.characteristics.traceability')}
                </td>
                <td>{t('data_quality.indicators.provenance')}</td>
                <td>
                  {report.traceability.provenance.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.traceability.provenance.map((item: string) => (
                        <span key={item} className="badge bg-light text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.temporalInformation')}</td>
                <td>
                  {report.traceability.temporalInformation.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.traceability.temporalInformation.map((item: string) => (
                        <span key={item} className="badge bg-light text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.spatialInformation')}</td>
                <td>
                  {report.traceability.spatialInformation.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.traceability.spatialInformation.map((item: string) => (
                        <span key={item} className="badge bg-light text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.identification')}</td>
                <td>
                  {report.traceability.identification.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.traceability.identification.map((item: string) => (
                        <span key={item} className="badge bg-light text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>

              {/* Understandability */}
              <tr>
                <td rowSpan={2} className="fw-bold text-secondary">
                  {t('data_quality.characteristics.understandability')}
                </td>
                <td>{t('data_quality.indicators.confusingColumns')}</td>
                <td>
                  {report.understandability.confusingColumns.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.understandability.confusingColumns.map((item: string) => (
                        <span key={item} className="badge bg-warning text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.uncommonColumns')}</td>
                <td>
                  {report.understandability.uncommonColumns.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1">
                      {report.understandability.uncommonColumns.map((item: string) => (
                        <span key={item} className="badge bg-warning text-dark">{item}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">[]</span>
                  )}
                </td>
              </tr>

              {/* Portability */}
              <tr>
                <td rowSpan={3} className="fw-bold text-secondary">
                  {t('data_quality.characteristics.portability')}
                </td>
                <td>{t('data_quality.indicators.portable')}</td>
                <td>
                  <span className={`badge ${report.portability.portable ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.portable ? t('data_quality.report.true') : t('data_quality.report.false')}
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.machineReadable')}</td>
                <td>
                  <span className={`badge ${report.portability.machineReadable ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.machineReadable ? t('data_quality.report.true') : t('data_quality.report.false')}
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('data_quality.indicators.openFormat')}</td>
                <td>
                  <span className={`badge ${report.portability.openFormat ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.openFormat ? t('data_quality.report.true') : t('data_quality.report.false')}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Sample Records Viewer Component
const SampleRecordsViewer: React.FC<{ records: any[] }> = ({ records }) => {
  const { t } = useTranslation();

  return (
    <div className="card">
      <div className="card-header">
        <ul className="nav nav-tabs card-header-tabs" role="tablist">
          <li className="nav-item" role="presentation">
            <button 
              className="nav-link active" 
              id="csv-tab" 
              data-bs-toggle="tab" 
              data-bs-target="#csv-view" 
              type="button" 
              role="tab" 
              aria-controls="csv-view" 
              aria-selected="true"
            >
              <i className="bi bi-table me-2"></i>
              {t('data_quality.report.sampleRecords')}
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button 
              className="nav-link" 
              id="json-tab" 
              data-bs-toggle="tab" 
              data-bs-target="#json-view" 
              type="button" 
              role="tab" 
              aria-controls="json-view" 
              aria-selected="false"
            >
              <i className="bi bi-code-square me-2"></i>
              JSON
            </button>
          </li>
        </ul>
      </div>
      <div className="card-body">
        {records.length > 0 ? (
          <div className="tab-content">
            {/* CSV View Tab */}
            <div className="tab-pane fade show active" id="csv-view" role="tabpanel" aria-labelledby="csv-tab">
              <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="table table-sm table-striped">
                  <thead className="sticky-top bg-white">
                    <tr>
                      {Object.keys(records[0]).map((key: string) => (
                        <th key={key} className="small">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 5).map((record: any, index: number) => (
                      <tr key={index}>
                        {Object.values(record).map((value: any, valueIndex: number) => (
                          <td key={valueIndex} className="small text-truncate" style={{ maxWidth: '150px' }}>
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* JSON View Tab */}
            <div className="tab-pane fade" id="json-view" role="tabpanel" aria-labelledby="json-tab">
              <div className="position-relative">
                <button 
                  className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-2" 
                  style={{ zIndex: 10 }}
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(records.slice(0, 5), null, 2));
                  }}
                  title={t('data_quality.selector.copy')}
                >
                  <i className="bi bi-clipboard me-1"></i>
                </button>
                <pre className="bg-light p-3 rounded" style={{ fontSize: '0.85rem', maxHeight: '300px', overflowY: 'auto' }}>
                  <code>{JSON.stringify(records.slice(0, 5), null, 2)}</code>
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted">{t('data_quality.report.noSampleData')}</p>
        )}
      </div>
    </div>
  );
};

// Observation Card Component
const ObservationCard: React.FC<{ observation: QualityObservation; key?: React.Key }> = ({ observation }) => {
  const { t } = useTranslation();
  
  return (
    <div className="card mb-3">
      <div className="card-header">
        <h6 className="mb-0 text-capitalize">
          <i className={`${getCharacteristicIcon(observation.characteristic)} me-2`}></i>
          {t(`data_quality.characteristics.${observation.characteristic}`, observation.characteristic)}
        </h6>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-6">
            <h6 className="text-muted small">{t('data_quality.report.definition')}</h6>
            <p className="small">{observation.definition}</p>
          </div>
          <div className="col-md-6">
            <h6 className="text-muted small">{t('data_quality.report.observations')}</h6>
            <p className="small">{observation.observations}</p>
            {observation.recommendations && observation.recommendations.length > 0 && (
              <div>
                <h6 className="text-muted small">{t('data_quality.report.recommendations')}</h6>
                <ul className="small">
                  {observation.recommendations.map((rec: string, index: number) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper functions
const getScoreColor = (score: number): string => {
  if (score >= 80) return 'text-success';
  if (score >= 60) return 'text-warning';
  return 'text-danger';
};

const getScoreDescription = (score: number, t: any): string => {
  if (score >= 80) return t('data_quality.score.excellent');
  if (score >= 60) return t('data_quality.score.good');
  if (score >= 40) return t('data_quality.score.fair');
  return t('data_quality.score.poor');
};

const getCharacteristicIcon = (characteristic: string): string => {
  const icons: { [key: string]: string } = {
    accuracy: 'bi bi-bullseye',
    completeness: 'bi bi-check-circle',
    consistency: 'bi bi-arrow-repeat',
    currentness: 'bi bi-clock',
    accessibility: 'bi bi-door-open',
    portability: 'bi bi-arrow-left-right',
    traceability: 'bi bi-map',
    understandability: 'bi bi-lightbulb'
  };
  return icons[characteristic] || 'bi bi-info-circle';
};

export default DataQualityReportViewer;