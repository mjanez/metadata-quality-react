import React from 'react';
import { useTranslation } from 'react-i18next';
import { QualityAnalysisResult, DataQualityReport, QualityObservation } from '../../types/dataQuality';

interface DataQualityReportViewerProps {
  result: QualityAnalysisResult;
}

const DataQualityReportViewer: React.FC<DataQualityReportViewerProps> = ({ result }) => {
  const { t } = useTranslation();
  
  if (result.status === 'error') {
    return (
      <div className="alert alert-danger">
        <h4>{t('dataQuality.report.error', 'Error en el análisis')}</h4>
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
        <p className="mt-2">{t('dataQuality.report.analyzing', 'Analizando datos...')}</p>
      </div>
    );
  }

  const { report, observations, score } = result;

  return (
    <div className="data-quality-report">
      {/* Overall Score */}
      <div className="card mb-4">
        <div className="card-header">
          <h4 className="mb-0">
            <i className="bi bi-clipboard-data me-2"></i>
            {t('dataQuality.report.title', 'Informe de Calidad de Datos')}
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
              <h5>{t('dataQuality.report.overallScore', 'Puntuación Global de Calidad')}</h5>
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

      {/* Basic Information */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="mb-0">
            <i className="bi bi-info-circle me-2"></i>
            {t('dataQuality.report.basicInfo', 'Información Básica')}
          </h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6">
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td><strong>{t('dataQuality.report.columns', 'Columnas')}:</strong></td>
                    <td>{report.basicInfo.columns.length}</td>
                  </tr>
                  <tr>
                    <td><strong>{t('dataQuality.report.records', 'Registros')}:</strong></td>
                    <td>{report.basicInfo.records.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="col-md-6">
              <h6>{t('dataQuality.report.columnNames', 'Nombres de columnas')}:</h6>
              <div className="d-flex flex-wrap gap-1">
                {report.basicInfo.columns.map((col: string) => (
                  <span key={col} className="badge bg-light text-dark">
                    {col}
                  </span>
                ))}
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

      {/* Quality Observations */}
      <div className="card mt-4">
        <div className="card-header">
          <h5 className="mb-0">
            <i className="bi bi-chat-left-text me-2"></i>
            {t('dataQuality.report.observations', 'Observaciones y Recomendaciones')}
          </h5>
        </div>
        <div className="card-body">
          {observations.map((obs: QualityObservation, index: number) => (
            <ObservationCard key={index} observation={obs} />
          ))}
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
          {t('dataQuality.report.indicators', 'Indicadores de Calidad')}
        </h5>
      </div>
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover">
            <thead>
              <tr>
                <th>{t('dataQuality.report.category', 'Categoría')}</th>
                <th>{t('dataQuality.report.indicator', 'Indicador')}</th>
                <th>{t('dataQuality.report.result', 'Resultado')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Accuracy */}
              <tr>
                <td rowSpan={1} className="fw-bold text-primary">
                  {t('dataQuality.characteristics.accuracy', 'Exactitud')}
                </td>
                <td>{t('dataQuality.indicators.outliersByColumn', 'Valores atípicos por columna')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.accuracy.outliersByColumn, null, 2)}
                  </pre>
                </td>
              </tr>

              {/* Completeness */}
              <tr>
                <td rowSpan={3} className="fw-bold text-success">
                  {t('dataQuality.characteristics.completeness', 'Completitud')}
                </td>
                <td>{t('dataQuality.indicators.completenessRatio', 'Ratio de completitud por columna')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.completeness.completenessRatioByColumn, null, 2)}
                  </pre>
                </td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.overallCompleteness', 'Ratio de completitud general')}</td>
                <td>
                  <span className={`badge ${report.completeness.overallCompletenessRatio >= 0.9 ? 'bg-success' : report.completeness.overallCompletenessRatio >= 0.7 ? 'bg-warning' : 'bg-danger'}`}>
                    {(report.completeness.overallCompletenessRatio * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.temporalCompleteness', 'Completitud temporal')}</td>
                <td>
                  <pre className="mb-0 small">
                    {JSON.stringify(report.completeness.temporalCompleteness, null, 2)}
                  </pre>
                </td>
              </tr>

              {/* Consistency */}
              <tr>
                <td className="fw-bold text-info">
                  {t('dataQuality.characteristics.consistency', 'Consistencia')}
                </td>
                <td>{t('dataQuality.indicators.duplicatedRecords', 'Registros duplicados')}</td>
                <td>
                  <span className={`badge ${report.consistency.duplicatedRecords === 0 ? 'bg-success' : 'bg-warning'}`}>
                    {report.consistency.duplicatedRecords}
                  </span>
                </td>
              </tr>

              {/* Currentness */}
              <tr>
                <td rowSpan={3} className="fw-bold text-warning">
                  {t('dataQuality.characteristics.currentness', 'Actualidad')}
                </td>
                <td>{t('dataQuality.indicators.mostRecentDate', 'Fecha más reciente')}</td>
                <td>{report.currentness.mostRecentDate || t('dataQuality.report.notAvailable', 'N/A')}</td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.oldestDate', 'Fecha más antigua')}</td>
                <td>{report.currentness.oldestDate || t('dataQuality.report.notAvailable', 'N/A')}</td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.temporalCoverage', 'Cobertura temporal')}</td>
                <td>{report.currentness.temporalCoverage || t('dataQuality.report.notAvailable', 'N/A')}</td>
              </tr>

              {/* Accessibility */}
              <tr>
                <td className="fw-bold text-primary">
                  {t('dataQuality.characteristics.accessibility', 'Accesibilidad')}
                </td>
                <td>{t('dataQuality.indicators.accessible', 'Accesibilidad')}</td>
                <td>
                  <span className={`badge ${report.accessibility.accessible ? 'bg-success' : 'bg-danger'}`}>
                    {report.accessibility.accessible ? t('dataQuality.report.true', 'Verdadero') : t('dataQuality.report.false', 'Falso')}
                  </span>
                </td>
              </tr>

              {/* Traceability */}
              <tr>
                <td rowSpan={4} className="fw-bold text-secondary">
                  {t('dataQuality.characteristics.traceability', 'Trazabilidad')}
                </td>
                <td>{t('dataQuality.indicators.provenance', 'Procedencia')}</td>
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
                <td>{t('dataQuality.indicators.temporalInformation', 'Información temporal')}</td>
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
                <td>{t('dataQuality.indicators.spatialInformation', 'Información espacial')}</td>
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
                <td>{t('dataQuality.indicators.identification', 'Identificación')}</td>
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
                <td rowSpan={2} className="fw-bold text-dark">
                  {t('dataQuality.characteristics.understandability', 'Comprensibilidad')}
                </td>
                <td>{t('dataQuality.indicators.confusingColumns', 'Columnas confusas')}</td>
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
                <td>{t('dataQuality.indicators.uncommonColumns', 'Columnas poco comunes')}</td>
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
                <td rowSpan={3} className="fw-bold text-success">
                  {t('dataQuality.characteristics.portability', 'Portabilidad')}
                </td>
                <td>{t('dataQuality.indicators.portable', 'Portabilidad')}</td>
                <td>
                  <span className={`badge ${report.portability.portable ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.portable ? t('dataQuality.report.true', 'Verdadero') : t('dataQuality.report.false', 'Falso')}
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.machineReadable', 'Legible por máquina')}</td>
                <td>
                  <span className={`badge ${report.portability.machineReadable ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.machineReadable ? t('dataQuality.report.true', 'Verdadero') : t('dataQuality.report.false', 'Falso')}
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t('dataQuality.indicators.openFormat', 'Formato abierto')}</td>
                <td>
                  <span className={`badge ${report.portability.openFormat ? 'bg-success' : 'bg-danger'}`}>
                    {report.portability.openFormat ? t('dataQuality.report.true', 'Verdadero') : t('dataQuality.report.false', 'Falso')}
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
        <h6 className="mb-0">
          <i className="bi bi-collection me-2"></i>
          {t('dataQuality.report.sampleRecords')}
        </h6>
      </div>
      <div className="card-body">
        {records.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
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
                      <td key={valueIndex} className="small text-truncate" style={{ maxWidth: '100px' }}>
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">{t('dataQuality.report.noSampleData', 'No hay datos de muestra disponibles')}</p>
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
          {t(`dataQuality.characteristics.${observation.characteristic}`, observation.characteristic)}
        </h6>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-6">
            <h6 className="text-muted small">{t('dataQuality.report.definition', 'Definición')}</h6>
            <p className="small">{observation.definition}</p>
          </div>
          <div className="col-md-6">
            <h6 className="text-muted small">{t('dataQuality.report.observations', 'Observaciones')}</h6>
            <p className="small">{observation.observations}</p>
            {observation.recommendations && observation.recommendations.length > 0 && (
              <div>
                <h6 className="text-muted small">{t('dataQuality.report.recommendations', 'Recomendaciones')}</h6>
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
  if (score >= 80) return t('dataQuality.score.excellent', 'Excelente calidad de datos');
  if (score >= 60) return t('dataQuality.score.good', 'Buena calidad de datos');
  if (score >= 40) return t('dataQuality.score.fair', 'Calidad de datos aceptable');
  return t('dataQuality.score.poor', 'Calidad de datos deficiente');
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