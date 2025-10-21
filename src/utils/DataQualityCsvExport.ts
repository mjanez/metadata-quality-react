/**
 * CSV Export Utilities for Data Quality Reports
 */

import { DataQualityReport, QualityObservation } from '../types/dataQuality';
import i18n from '../i18n';

/**
 * Get translation helper
 */
const t = (key: string): string => {
  return i18n.t(key);
};

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: any[], headers: string[]): string {
  const escapeCSV = (value: any): string => {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    // Escape double quotes and wrap in quotes if contains comma, newline, or quote
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const csvRows: string[] = [];
  
  // Add header
  csvRows.push(headers.map(escapeCSV).join(','));
  
  // Add data rows
  data.forEach(row => {
    const values = headers.map(header => escapeCSV(row[header]));
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
}

/**
 * Export quality indicators table as CSV
 */
export function exportIndicatorsCSV(report: DataQualityReport): string {
  const indicators: any[] = [];
  
  const headers = [
    t('data_quality.report.category'),
    t('data_quality.report.indicator'),
    t('data_quality.report.result')
  ];
  
  // Accuracy
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.accuracy'),
    [headers[1]]: t('data_quality.indicators.outliersByColumn'),
    [headers[2]]: JSON.stringify(report.accuracy.outliersByColumn)
  });
  
  // Completeness
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.completeness'),
    [headers[1]]: t('data_quality.indicators.completenessRatio'),
    [headers[2]]: JSON.stringify(report.completeness.completenessRatioByColumn)
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.completeness'),
    [headers[1]]: t('data_quality.indicators.overallCompleteness'),
    [headers[2]]: `${(report.completeness.overallCompletenessRatio * 100).toFixed(1)}%`
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.completeness'),
    [headers[1]]: t('data_quality.indicators.temporalCompleteness'),
    [headers[2]]: JSON.stringify(report.completeness.temporalCompleteness)
  });
  
  // Consistency
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.consistency'),
    [headers[1]]: t('data_quality.indicators.duplicatedRecords'),
    [headers[2]]: report.consistency.duplicatedRecords
  });
  
  // Currentness
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.currentness'),
    [headers[1]]: t('data_quality.indicators.mostRecentDate'),
    [headers[2]]: report.currentness.mostRecentDate || t('data_quality.report.notAvailable')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.currentness'),
    [headers[1]]: t('data_quality.indicators.oldestDate'),
    [headers[2]]: report.currentness.oldestDate || t('data_quality.report.notAvailable')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.currentness'),
    [headers[1]]: t('data_quality.indicators.temporalCoverage'),
    [headers[2]]: report.currentness.temporalCoverage || t('data_quality.report.notAvailable')
  });
  
  // Accessibility
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.accessibility'),
    [headers[1]]: t('data_quality.indicators.accessible'),
    [headers[2]]: report.accessibility.accessible ? t('data_quality.report.true') : t('data_quality.report.false')
  });
  
  // Traceability
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.traceability'),
    [headers[1]]: t('data_quality.indicators.provenance'),
    [headers[2]]: report.traceability.provenance.join('; ')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.traceability'),
    [headers[1]]: t('data_quality.indicators.temporalInformation'),
    [headers[2]]: report.traceability.temporalInformation.join('; ')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.traceability'),
    [headers[1]]: t('data_quality.indicators.spatialInformation'),
    [headers[2]]: report.traceability.spatialInformation.join('; ')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.traceability'),
    [headers[1]]: t('data_quality.indicators.identification'),
    [headers[2]]: report.traceability.identification.join('; ')
  });
  
  // Understandability
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.understandability'),
    [headers[1]]: t('data_quality.indicators.confusingColumns'),
    [headers[2]]: report.understandability.confusingColumns.join('; ')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.understandability'),
    [headers[1]]: t('data_quality.indicators.uncommonColumns'),
    [headers[2]]: report.understandability.uncommonColumns.join('; ')
  });
  
  // Portability
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.portability'),
    [headers[1]]: t('data_quality.indicators.portable'),
    [headers[2]]: report.portability.portable ? t('data_quality.report.true') : t('data_quality.report.false')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.portability'),
    [headers[1]]: t('data_quality.indicators.machineReadable'),
    [headers[2]]: report.portability.machineReadable ? t('data_quality.report.true') : t('data_quality.report.false')
  });
  
  indicators.push({
    [headers[0]]: t('data_quality.characteristics.portability'),
    [headers[1]]: t('data_quality.indicators.openFormat'),
    [headers[2]]: report.portability.openFormat ? t('data_quality.report.true') : t('data_quality.report.false')
  });
  
  return arrayToCSV(indicators, headers);
}

/**
 * Export sample records as CSV
 */
export function exportSampleRecordsCSV(report: DataQualityReport): string {
  if (report.basicInfo.sampleRecords.length === 0) {
    return t('data_quality.report.noSampleData');
  }
  
  const records = report.basicInfo.sampleRecords;
  const headers = Object.keys(records[0]);
  
  return arrayToCSV(records, headers);
}

/**
 * Export observations and recommendations as CSV
 */
export function exportObservationsCSV(observations: QualityObservation[]): string {
  const headers = [
    t('data_quality.characteristics.accuracy'), // Will be replaced dynamically
    t('data_quality.report.definition'),
    t('data_quality.report.observations'),
    t('data_quality.report.recommendations')
  ];
  
  // Use generic header names that work for all characteristics
  const headerLabels = [
    'Characteristic', // Keep as fallback for characteristic name
    headers[1],
    headers[2],
    headers[3]
  ];
  
  const rows = observations.map(obs => ({
    [headerLabels[0]]: t(`data_quality.characteristics.${obs.characteristic}`),
    [headerLabels[1]]: obs.definition,
    [headerLabels[2]]: obs.observations,
    [headerLabels[3]]: obs.recommendations?.join(' | ') || ''
  }));
  
  return arrayToCSV(rows, headerLabels);
}

/**
 * Download CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Export all CSV files as a ZIP archive using fflate
 */
export async function exportAllCSVs(
  report: DataQualityReport,
  observations: QualityObservation[],
  baseFilename: string = 'data-quality-report'
): Promise<void> {
  try {
    // Dynamic import to reduce bundle size
    const { zip } = await import(/* webpackChunkName: "fflate" */ 'fflate');
    
    // Collect all CSV files
    const files: { [key: string]: Uint8Array } = {};
    
    // Add indicators CSV
    const indicatorsCSV = exportIndicatorsCSV(report);
    files[`${baseFilename}_indicators.csv`] = new TextEncoder().encode('\uFEFF' + indicatorsCSV);
    
    // Add sample records CSV
    const samplesCSV = exportSampleRecordsCSV(report);
    files[`${baseFilename}_sample_records.csv`] = new TextEncoder().encode('\uFEFF' + samplesCSV);
    
    // Add observations CSV
    const observationsCSV = exportObservationsCSV(observations);
    files[`${baseFilename}_observations.csv`] = new TextEncoder().encode('\uFEFF' + observationsCSV);
    
    // Add JSON summary file
    const jsonData = {
      metadata: {
        generated: new Date().toISOString(),
        format: t('data_quality.report.title'),
        standard: 'ISO/IEC 25012'
      },
      basicInfo: {
        columns: report.basicInfo.columns.length,
        records: report.basicInfo.records,
        columnNames: report.basicInfo.columns
      },
      summary: {
        accuracy: {
          outliersByColumn: report.accuracy.outliersByColumn
        },
        completeness: {
          overallRatio: report.completeness.overallCompletenessRatio,
          ratioByColumn: report.completeness.completenessRatioByColumn,
          temporalCompleteness: report.completeness.temporalCompleteness
        },
        consistency: {
          duplicatedRecords: report.consistency.duplicatedRecords
        },
        currentness: {
          mostRecentDate: report.currentness.mostRecentDate,
          oldestDate: report.currentness.oldestDate,
          temporalCoverage: report.currentness.temporalCoverage
        },
        accessibility: {
          accessible: report.accessibility.accessible
        },
        traceability: {
          provenance: report.traceability.provenance,
          temporalInformation: report.traceability.temporalInformation,
          spatialInformation: report.traceability.spatialInformation,
          identification: report.traceability.identification
        },
        understandability: {
          confusingColumns: report.understandability.confusingColumns,
          uncommonColumns: report.understandability.uncommonColumns
        },
        portability: {
          portable: report.portability.portable,
          machineReadable: report.portability.machineReadable,
          openFormat: report.portability.openFormat
        }
      },
      observations: observations.map(obs => ({
        characteristic: t(`data_quality.characteristics.${obs.characteristic}`),
        definition: obs.definition,
        observations: obs.observations,
        recommendations: obs.recommendations
      }))
    };
    
    const jsonString = JSON.stringify(jsonData, null, 2);
    files[`${baseFilename}_summary.json`] = new TextEncoder().encode(jsonString);
    
    // Create ZIP
    zip(files, (err, data) => {
      if (err) {
        console.error('Error creating ZIP:', err);
        alert(t('errors.unknown_error'));
        return;
      }
      
      // Download ZIP
      const arrayBuffer = (data.buffer as ArrayBuffer).slice(
        data.byteOffset, 
        data.byteOffset + data.byteLength
      );
      const blob = new Blob([arrayBuffer], { type: 'application/zip' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.href = url;
      link.download = `${baseFilename}_${new Date().toISOString().split('T')[0]}.zip`;
      link.click();
      
      URL.revokeObjectURL(url);
    });
    
  } catch (error) {
    console.error('Error exporting CSV files as ZIP:', error);
    alert(t('errors.unknown_error'));
  }
}
