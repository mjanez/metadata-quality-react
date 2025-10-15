import { 
  DataQualityReport, 
  DataQualityInput, 
  QualityAnalysisResult, 
  QualityObservation,
  QualityCharacteristic,
  DataQualityAnalysisProgress
} from '../types/dataQuality';
import { backendService } from './BackendService';
import i18n from '../i18n';
import { t } from 'i18next';

/**
 * Data Quality Analysis Service based on ISO/IEC 25012
 * Analyzes CSV and JSON data distributions for quality characteristics
 */
export class DataQualityService {
  private static instance: DataQualityService;
  
  private constructor() {}
  
  public static getInstance(): DataQualityService {
    if (!DataQualityService.instance) {
      DataQualityService.instance = new DataQualityService();
    }
    return DataQualityService.instance;
  }

  /**
   * Analyze data quality for a given distribution
   */
  async analyzeDataQuality(
    input: DataQualityInput,
    onProgress?: (progress: DataQualityAnalysisProgress) => void
  ): Promise<QualityAnalysisResult> {
    try {
      // Download the data - use downloadURL if available, otherwise accessURL
      const downloadUrl = input.downloadURL || input.url;
      
      onProgress?.({ step: 'downloading', progress: 10, message: t('data_quality.progress.downloading') });  
      const data = await this.downloadData(downloadUrl);
      
      // Validate the downloaded content instead of the URL
      if (!this.isValidDataContent(data, input.format)) {
        throw new Error(t('data_quality.progress.url_invalid', { format: input.format.toUpperCase() }) + t('data_quality.progress.url_unknown_source'));
      }
      
      onProgress?.({ step: 'parsing', progress: 30, message: t('data_quality.progress.parsing') });
      
      // Parse based on format
      const parsedData = input.format === 'csv' 
        ? await this.parseCSV(data)
        : await this.parseJSON(data);
        
      onProgress?.({ step: 'analyzing', progress: 60, message: t('data_quality.progress.analyzing') });
      
      // Analyze quality
      const report = await this.performQualityAnalysis(parsedData, input);
      
      onProgress?.({ step: 'generating', progress: 90, message: t('data_quality.progress.generating') });
      
      // Generate observations
      const observations = this.generateObservations(report, input.format);
      
      onProgress?.({ step: 'completed', progress: 100, message: t('data_quality.progress.completed') });
      
      return {
        report,
        observations,
        score: this.calculateOverallScore(report),
        status: 'completed',
        sourceUrl: input.url,
        downloadUrl: input.downloadURL,
        title: input.title
      };
      
    } catch (error) {
      console.error('Data quality analysis error:', error);
      return {
        report: {} as DataQualityReport,
        observations: [],
        score: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

    /**
   * Download data from URL using BackendService with fallback strategies
   */
  private async downloadData(url: string): Promise<string> {
    try {
      return await backendService.downloadData(url);
    } catch (backendError) {
      console.warn('Backend data download failed, trying direct fetch with CORS proxy fallback:', backendError);
      
      // Fallback 1: Try direct fetch first
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.text();
      } catch (directError) {
        console.warn('Direct fetch failed, trying CORS proxies:', directError);
        
        // Fallback 2: Try CORS proxy services from configuration
        const proxies = backendService.getBackendConfig().cors_proxy.fallback_proxies;
        
        for (const proxy of proxies) {
          try {
            let proxyUrl: string;
            
            if (proxy.includes('allorigins')) {
              proxyUrl = `${proxy}${encodeURIComponent(url)}`;
            } else {
              proxyUrl = `${proxy}${url}`;
            }

            const response = await fetch(proxyUrl);
            
            if (response.ok) {
              let data = await response.text();
              
              // Handle allorigins response format
              if (proxy.includes('allorigins')) {
                try {
                  const jsonResponse = JSON.parse(data);
                  data = jsonResponse.contents;
                } catch (e) {
                  // If not JSON, use as is
                }
              }
              
              console.info(`Successfully downloaded data via proxy: ${proxy}`);
              return data;
            }
          } catch (proxyError) {
            console.warn(`Proxy ${proxy} failed:`, proxyError);
            continue;
          }
        }
        
        throw new Error(`No se pudo descargar los datos: Backend falló (${backendError}), fetch directo falló (${directError}), y todos los proxies CORS fallaron`);
      }
    }
  }

  /**
   * Validate that the downloaded content is valid data (not HTML)
   */
  private isValidDataContent(content: string, expectedFormat: string): boolean {
    if (!content || content.trim().length === 0) {
      return false;
    }

    const trimmedContent = content.trim();
    
    // Check if content looks like HTML
    const htmlIndicators = [
      '<!DOCTYPE',
      '<html',
      '<HTML',
      '<?xml version',
      '<head>',
      '<body>',
      '<title>'
    ];
    
    const looksLikeHTML = htmlIndicators.some(indicator => 
      trimmedContent.toLowerCase().startsWith(indicator.toLowerCase())
    );
    
    if (looksLikeHTML) {
      console.warn('Content appears to be HTML, not data');
      return false;
    }

    // For CSV, check if it has CSV-like structure
    if (expectedFormat === 'csv') {
      const lines = trimmedContent.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length === 0) {
        return false;
      }
      
      // Check if first line looks like a header (has separators)
      const firstLine = lines[0];
      const hasDelimiters = [',', ';', '\t', '|'].some(delimiter => 
        firstLine.includes(delimiter)
      );
      
      // If it has delimiters, consider it valid CSV
      if (hasDelimiters) {
        return true;
      }
      
      // Even without delimiters, if it's not HTML and has multiple lines, might be valid CSV
      return lines.length > 1;
    }

    // For JSON, check if it's valid JSON structure
    if (expectedFormat === 'json') {
      try {
        JSON.parse(trimmedContent);
        return true;
      } catch (e) {
        console.warn('Content is not valid JSON:', e);
        return false;
      }
    }

    // For unknown formats, accept if not HTML
    return !looksLikeHTML;
  }

  /**
   * Detect CSV delimiter by analyzing the first few lines
   */
  private detectCSVDelimiter(csvText: string): string {
    const delimiters = [',', ';', '\t', '|'];
    const lines = csvText.trim().split('\n').slice(0, 10); // Check first 10 lines
    
    const delimiterCounts = delimiters.map(delimiter => {
      const counts = lines.map(line => {
        // Ignore delimiters inside quoted strings
        let count = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') {
            if (inQuotes && line[i + 1] === '"') {
              i++; // Skip escaped quote
            } else {
              inQuotes = !inQuotes;
            }
          } else if (line[i] === delimiter && !inQuotes) {
            count++;
          }
        }
        return count;
      });
      const avgCount = counts.reduce((sum, count) => sum + count, 0) / counts.length;
      const consistency = counts.every(count => Math.abs(count - avgCount) <= 1);
      return { delimiter, avgCount, consistency };
    });
    
    // Prefer delimiter with highest consistent count
    const bestDelimiter = delimiterCounts
      .filter(d => d.consistency && d.avgCount > 0)
      .sort((a, b) => b.avgCount - a.avgCount)[0];
    
    return bestDelimiter?.delimiter || ',';
  }

  /**
   * Parse CSV data with automatic delimiter detection
   */
  private async parseCSV(csvText: string): Promise<any[]> {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('El archivo CSV debe tener al menos una fila de cabecera y una fila de datos');
    }
    
    // Detect delimiter
    const delimiter = this.detectCSVDelimiter(csvText);
    console.debug(`CSV delimiter detected: '${delimiter === '\t' ? '\\t' : delimiter}'`);
    
    const headers = this.parseCSVLine(lines[0], delimiter);
    const data: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = this.parseCSVLine(lines[i], delimiter);
        const row: any = {};
        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim() || null;
        });
        data.push(row);
      }
    }
    
    return data;
  }

  /**
   * Parse a single CSV line considering quoted values
   */
  private parseCSVLine(line: string, delimiter: string = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    return result;
  }

  /**
   * Parse JSON data
   */
  private async parseJSON(jsonText: string): Promise<any[]> {
    try {
      // Check if it's a ZIP file (starts with PK magic number)
      if (jsonText.startsWith('PK')) {
        throw new Error(t('data_quality.errors.zipNotSupported'));
      }
      
      const parsed = JSON.parse(jsonText);
      
      // Handle GeoJSON format
      if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        // Extract properties from GeoJSON features
        return parsed.features.map((feature: any) => ({
          ...feature.properties,
          geometry_type: feature.geometry?.type,
          coordinates: JSON.stringify(feature.geometry?.coordinates)
        }));
      }
      
      // Handle regular JSON arrays
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        return parsed.data;
      } else if (parsed.results && Array.isArray(parsed.results)) {
        return parsed.results;
      } else if (parsed.features && Array.isArray(parsed.features)) {
        // Alternative GeoJSON structure
        return parsed.features.map((feature: any) => feature.properties || feature);
      } else {
        throw new Error(t('data_quality.errors.invalidJsonStructure'));
      }
    } catch (error) {
      // More informative error messages
      if (error instanceof Error) {
        if (error.message.includes('PK')) {
          throw new Error(t('data_quality.errors.zipNotSupported'));
        }
        throw new Error(t('data_quality.errors.jsonParseError', { message: error.message }));
      }
      throw new Error(t('data_quality.errors.invalidFormat'));
    }
  }

  /**
   * Perform comprehensive quality analysis based on ISO/IEC 25012
   */
  private async performQualityAnalysis(data: any[], input: DataQualityInput): Promise<DataQualityReport> {
    if (data.length === 0) {
      throw new Error('No se encontraron datos para analizar');
    }
    
    const columns = Object.keys(data[0]);
    const numericColumns = this.identifyNumericColumns(data, columns);
    const dateColumns = this.identifyDateColumns(data, columns);
    
    return {
      // Basic Information
      basicInfo: {
        columns,
        records: data.length,
        missingValues: this.calculateMissingValues(data, columns),
        sampleRecords: this.getSampleRecords(data, 5)
      },
      
      // Accuracy
      accuracy: {
        outliersByColumn: this.calculateOutliers(data, numericColumns)
      },
      
      // Completeness  
      completeness: {
        completenessRatioByColumn: this.calculateCompletenessRatio(data, columns),
        overallCompletenessRatio: this.calculateOverallCompleteness(data, columns),
        temporalCompleteness: this.calculateTemporalCompleteness(data, dateColumns)
      },
      
      // Consistency
      consistency: {
        duplicatedRecords: this.calculateDuplicates(data)
      },
      
      // Currentness
      currentness: {
        mostRecentDate: this.findMostRecentDate(data, dateColumns),
        oldestDate: this.findOldestDate(data, dateColumns),
        temporalCoverage: this.calculateTemporalCoverage(data, dateColumns)
      },
      
      // Accessibility
      accessibility: {
        accessible: true // If we got this far, it was accessible
      },
      
      // Portability
      portability: {
        portable: this.isPortable(input.format),
        machineReadable: this.isMachineReadable(input.format),
        openFormat: this.isOpenFormat(input.format)
      },
      
      // Traceability
      traceability: {
        provenance: this.identifyProvenanceColumns(columns),
        temporalInformation: this.identifyTemporalColumns(columns),
        spatialInformation: this.identifySpatialColumns(columns),
        identification: this.identifyIdColumns(columns)
      },
      
      // Understandability
      understandability: {
        confusingColumns: this.identifyConfusingColumns(columns),
        uncommonColumns: this.identifyUncommonColumns(columns)
      }
    };
  }

  // Analysis helper methods
  private identifyNumericColumns(data: any[], columns: string[]): string[] {
    return columns.filter(col => {
      const sample = data.slice(0, 100).map(row => row[col]).filter(val => val !== null && val !== undefined && val !== '');
      return sample.length > 0 && sample.every(val => !isNaN(Number(val)));
    });
  }

  private identifyDateColumns(data: any[], columns: string[]): string[] {
    const datePatterns = [
      /\b\d{4}-\d{2}-\d{2}\b/, // YYYY-MM-DD
      /\b\d{2}\/\d{2}\/\d{4}\b/, // DD/MM/YYYY
      /\b\d{4}\b/ // Just year
    ];
    
    return columns.filter(col => {
      const colLower = col.toLowerCase();
      const hasDateKeyword = ['fecha', 'date', 'año', 'year', 'anio', 'time', 'tiempo'].some(keyword => 
        colLower.includes(keyword)
      );
      
      if (hasDateKeyword) return true;
      
      // Check data patterns
      const sample = data.slice(0, 50).map(row => String(row[col] || '')).filter(val => val.length > 0);
      return sample.some(val => datePatterns.some(pattern => pattern.test(val)));
    });
  }

  private calculateMissingValues(data: any[], columns: string[]): Record<string, number> {
    const missing: Record<string, number> = {};
    
    columns.forEach(col => {
      missing[col] = data.filter(row => 
        row[col] === null ||
        row[col] === undefined || 
        row[col] === '' || 
        String(row[col]).trim() === ''
      ).length;
    });
    
    return missing;
  }

  private getSampleRecords(data: any[], count: number): any[] {
    const shuffled = [...data].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, data.length));
  }

  private calculateOutliers(data: any[], numericColumns: string[]): Record<string, number> {
    const outliers: Record<string, number> = {};
    
    numericColumns.forEach(col => {
      const values = data.map(row => Number(row[col])).filter(val => !isNaN(val));
      if (values.length === 0) {
        outliers[col] = 0;
        return;
      }
      
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      outliers[col] = values.filter(val => Math.abs(val - mean) > 3 * stdDev).length;
    });
    
    return outliers;
  }

  private calculateCompletenessRatio(data: any[], allColumns: string[]): Record<string, number> {
    const ratios: Record<string, number> = {};
    
    allColumns.forEach(col => {
      const nonNullCount = data.filter(row => {
        const value = row[col];
        // Considerar null, undefined, cadena vacía, o string "null" como valores ausentes
        return value !== null && 
               value !== undefined && 
               value !== '' && 
               String(value).trim() !== '' &&
               String(value).toLowerCase() !== 'null';
      }).length;
      const ratio = data.length > 0 ? nonNullCount / data.length : 0;
      ratios[col] = Number(ratio.toFixed(2));
    });
    
    return ratios;
  }

  private calculateOverallCompleteness(data: any[], columns: string[]): number {
    const totalCells = data.length * columns.length;
    if (totalCells === 0) return 1;
    
    let nonNullCells = 0;
    data.forEach(row => {
      columns.forEach(col => {
        if (row[col] !== null && row[col] !== undefined && row[col] !== '' && String(row[col]).trim() !== '') {
          nonNullCells++;
        }
      });
    });
    
    return nonNullCells / totalCells;
  }

  private calculateTemporalCompleteness(data: any[], dateColumns: string[]): { gaps_num: number; gaps_duration: number; gaps_unit: string } {
    if (dateColumns.length === 0) {
      return { gaps_num: 0, gaps_duration: 0, gaps_unit: 'year' };
    }
    
    // Simple implementation - count missing temporal data
    const temporalData = data.map(row => dateColumns.map(col => row[col]).filter(val => val)).flat();
    const missingCount = data.length * dateColumns.length - temporalData.length;
    
    return {
      gaps_num: missingCount,
      gaps_duration: 0,
      gaps_unit: 'year'
    };
  }

  private calculateDuplicates(data: any[]): number {
    const seen = new Set();
    let duplicates = 0;
    
    data.forEach(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        duplicates++;
      } else {
        seen.add(key);
      }
    });
    
    return duplicates;
  }

  private findMostRecentDate(data: any[], dateColumns: string[]): string | null {
    if (dateColumns.length === 0) return null;
    
    let mostRecent: Date | null = null;
    
    data.forEach(row => {
      dateColumns.forEach(col => {
        const dateStr = String(row[col] || '').trim();
        if (dateStr) {
          const date = this.parseDate(dateStr);
          if (date && (!mostRecent || date > mostRecent)) {
            mostRecent = date;
          }
        }
      });
    });
    
    if (mostRecent) {
      return (mostRecent as Date).toISOString().split('T')[0];
    }
    return null;
  }

  private findOldestDate(data: any[], dateColumns: string[]): string | null {
    if (dateColumns.length === 0) return null;
    
    let oldest: Date | null = null;
    
    data.forEach(row => {
      dateColumns.forEach(col => {
        const dateStr = String(row[col] || '').trim();
        if (dateStr) {
          const date = this.parseDate(dateStr);
          if (date && (!oldest || date < oldest)) {
            oldest = date;
          }
        }
      });
    });
    
    if (oldest) {
      return (oldest as Date).toISOString().split('T')[0];
    }
    return null;
  }

  private calculateTemporalCoverage(data: any[], dateColumns: string[]): string | null {
    const oldest = this.findOldestDate(data, dateColumns);
    const newest = this.findMostRecentDate(data, dateColumns);
    
    if (oldest && newest) {
      return `${oldest} - ${newest}`;
    }
    
    return null;
  }

  private parseDate(dateStr: string): Date | null {
    // Try different date formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
      /^(\d{4})$/ // YYYY
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        if (match.length === 2) { // Year only
          return new Date(parseInt(match[1]), 0, 1);
        } else if (match.length === 4) {
          if (format === formats[0]) { // YYYY-MM-DD
            return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
          } else { // DD/MM/YYYY
            return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
          }
        }
      }
    }
    
    return null;
  }

  private isPortable(format: string): boolean {
    return this.isMachineReadable(format) && this.isOpenFormat(format);
  }

  private isMachineReadable(format: string): boolean {
    const machineReadableFormats = ['csv', 'json'];
    return machineReadableFormats.includes(format.toLowerCase());
  }

  private isOpenFormat(format: string): boolean {
    const openFormats = ['csv', 'json'];
    return openFormats.includes(format.toLowerCase());
  }

  private identifyProvenanceColumns(columns: string[]): string[] {
    const provenanceKeywords = ['source', 'fuente', 'origin', 'origen', 'provider', 'proveedor', 'referencia', 'reference', 'creator', 'creador', 'author', 'autor', 'publisher', 'editor', 'rights', 'licence', 'license', 'license', 'licencia', 'provenance'];
    return columns.filter(col => 
      provenanceKeywords.some(keyword => col.toLowerCase().includes(keyword))
    );
  }

  private identifyTemporalColumns(columns: string[]): string[] {
    const temporalKeywords = ['fecha', 'date', 'año', 'year', 'anio', 'time', 'tiempo', 'created', 'updated', 'temporal', 'period', 'interval', 'month', 'day', 'día', 'dia', 'year', 'año', 'anio', 'timestamp'];
    return columns.filter(col => 
      temporalKeywords.some(keyword => col.toLowerCase().includes(keyword))
    );
  }

  private identifySpatialColumns(columns: string[]): string[] {
    const spatialKeywords = ['lat', 'lng', 'lon', 'coordenada', 'coord', 'ubicacion', 'location', 'direccion', 'address', 'provincia', 'municipio', 'comunidad', 'country', 'pais', 'region', 'state', 'geo', 'geometry', 'longitud', 'long', 'latitude', 'longitud', 'longitude', 'latitud', 'localidad', 'ciudad', 'city', 'spatial', 'map', 'postal', 'zip', 'código postal', 'cp', 'geom', 'point', 'polygon', 'area', 'surface'];
    return columns.filter(col => 
      spatialKeywords.some(keyword => col.toLowerCase().includes(keyword))
    );
  }

  private identifyIdColumns(columns: string[]): string[] {
    const idKeywords = ['id', '_id', 'identifier', 'code', 'cod', 'codigo', 'uri', 'identificador', 'identificador', 'key', 'clave', 'ref', 'reference', 'referencia'];
    return columns.filter(col => 
      idKeywords.some(keyword => col.toLowerCase().includes(keyword)) ||
      col.toLowerCase().endsWith('_id') ||
      col.toLowerCase().startsWith('id_')
    );
  }

  private identifyConfusingColumns(columns: string[]): string[] {
    return columns.filter(col => {
      // Short names (less than 3 characters)
      if (col.length < 3) return true;
      
      // Names with numbers/codes that might be confusing
      if (/\d{2,}/.test(col)) return true;
      
      return false;
    });
  }

  private identifyUncommonColumns(columns: string[]): string[] {
    const commonWords = [
      'id', 'name', 'nombre', 'title', 'titulo', 'description', 'descripcion',
      'date', 'fecha', 'time', 'tiempo', 'year', 'año', 'anio',
      'value', 'valor', 'amount', 'cantidad', 'number', 'numero',
      'type', 'tipo', 'category', 'categoria', 'status', 'estado'
    ];
    
    return columns.filter(col => {
      const colLower = col.toLowerCase();
      return !commonWords.some(word => colLower.includes(word));
    });
  }

  private calculateOverallScore(report: DataQualityReport): number {
    let score = 0;
    let totalMetrics = 0;
    
    // Completeness (25%)
    score += report.completeness.overallCompletenessRatio * 25;
    totalMetrics += 25;
    
    // Consistency (20%)
    const consistencyScore = report.consistency.duplicatedRecords === 0 ? 20 : 
      Math.max(0, 20 - (report.consistency.duplicatedRecords / report.basicInfo.records) * 20);
    score += consistencyScore;
    totalMetrics += 20;
    
    // Accessibility (15%)
    score += report.accessibility.accessible ? 15 : 0;
    totalMetrics += 15;
    
    // Portability (15%)
    score += report.portability.portable ? 15 : 0;
    totalMetrics += 15;
    
    // Accuracy (10%) - based on outliers
    const accuracyScore = Object.values(report.accuracy.outliersByColumn).reduce((sum, outliers) => sum + outliers, 0);
    const accuracyRatio = Math.max(0, 1 - (accuracyScore / report.basicInfo.records));
    score += accuracyRatio * 10;
    totalMetrics += 10;
    
    // Understandability (10%)
    const confusingRatio = report.understandability.confusingColumns.length / report.basicInfo.columns.length;
    score += Math.max(0, (1 - confusingRatio) * 10);
    totalMetrics += 10;
    
    // Currentness (5%) - if temporal data exists
    if (report.currentness.mostRecentDate) {
      const recentDate = new Date(report.currentness.mostRecentDate);
      const now = new Date();
      const monthsOld = (now.getTime() - recentDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const currentnessScore = Math.max(0, Math.min(5, 5 - (monthsOld / 12) * 5));
      score += currentnessScore;
    }
    totalMetrics += 5;
    
    return Math.min(100, Math.max(0, (score / totalMetrics) * 100));
  }

  private generateObservations(report: DataQualityReport, format: string = 'CSV'): QualityObservation[] {
    const observations: QualityObservation[] = [];
    
    // Accuracy observations
    const totalOutliers = Object.values(report.accuracy.outliersByColumn).reduce((sum, count) => sum + count, 0);
    observations.push({
      characteristic: 'accuracy',
      definition: i18n.t('data_quality.observations.accuracy.definition'),
      observations: totalOutliers > 0 
        ? i18n.t('data_quality.observations.accuracy.withOutliers', { count: totalOutliers })
        : i18n.t('data_quality.observations.accuracy.noOutliers'),
      recommendations: totalOutliers > 0 
        ? [
            i18n.t('data_quality.observations.accuracy.recommendations.reviewOutliers'),
            i18n.t('data_quality.observations.accuracy.recommendations.implementValidation')
          ]
        : []
    });
    
    // Completeness observations
    const completenessPercentage = (report.completeness.overallCompletenessRatio * 100).toFixed(1);
    observations.push({
      characteristic: 'completeness',
      definition: i18n.t('data_quality.observations.completeness.definition'),
      observations: i18n.t('data_quality.observations.completeness.general', { percentage: completenessPercentage }) +
        (report.completeness.overallCompletenessRatio === 1 
          ? i18n.t('data_quality.observations.completeness.perfect')
          : i18n.t('data_quality.observations.completeness.missing')),
      recommendations: report.completeness.overallCompletenessRatio < 1 
        ? [
            i18n.t('data_quality.observations.completeness.recommendations.reviewMissing'),
            i18n.t('data_quality.observations.completeness.recommendations.implementImputation')
          ]
        : []
    });
    
    // Consistency observations
    observations.push({
      characteristic: 'consistency',
      definition: i18n.t('data_quality.observations.consistency.definition'),
      observations: report.consistency.duplicatedRecords === 0 
        ? i18n.t('data_quality.observations.consistency.noDuplicates')
        : i18n.t('data_quality.observations.consistency.withDuplicates', { count: report.consistency.duplicatedRecords }),
      recommendations: report.consistency.duplicatedRecords > 0 
        ? [
            i18n.t('data_quality.observations.consistency.recommendations.removeDuplicates'),
            i18n.t('data_quality.observations.consistency.recommendations.implementUniqueKeys')
          ]
        : []
    });
    
    // Accessibility observations
    observations.push({
      characteristic: 'accessibility',
      definition: i18n.t('data_quality.observations.accessibility.definition'),
      observations: i18n.t('data_quality.observations.accessibility.observation', { format: format.toUpperCase() }),
      recommendations: [
        i18n.t('data_quality.observations.accessibility.recommendations.documentStructure'),
        i18n.t('data_quality.observations.accessibility.recommendations.provideMetadata')
      ]
    });
    
    // Portability observations
    const meetsPortability = report.portability.portable 
      ? i18n.t('data_quality.observations.portability.meets')
      : i18n.t('data_quality.observations.portability.doesNotMeet');
    const machineReadableText = report.portability.machineReadable 
      ? i18n.t('data_quality.observations.portability.machineReadableYes')
      : i18n.t('data_quality.observations.portability.machineReadableNo');
    const openFormatText = report.portability.openFormat 
      ? i18n.t('data_quality.observations.portability.openFormatYes')
      : i18n.t('data_quality.observations.portability.openFormatNo');
    
    observations.push({
      characteristic: 'portability',
      definition: i18n.t('data_quality.observations.portability.definition'),
      observations: i18n.t('data_quality.observations.portability.compliant', {
        meets: meetsPortability,
        machineReadable: machineReadableText,
        openFormat: openFormatText
      }),
      recommendations: !report.portability.portable 
        ? [
            i18n.t('data_quality.observations.portability.recommendations.convertToStandard'),
            i18n.t('data_quality.observations.portability.recommendations.ensureOpenFormat')
          ]
        : []
    });
    
    return observations;
  }
}

export default DataQualityService;