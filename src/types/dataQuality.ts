// Data Quality Analysis Types based on ISO/IEC 25012
export interface DataQualityReport {
  // Basic Information
  basicInfo: {
    columns: string[];
    records: number;
    missingValues: Record<string, number>;
    sampleRecords: Record<string, any>[];
  };
  
  // Inherent Data Quality Characteristics
  accuracy: {
    outliersByColumn: Record<string, number>;
  };
  
  completeness: {
    completenessRatioByColumn: Record<string, number>;
    overallCompletenessRatio: number;
    temporalCompleteness: {
      gaps_num: number;
      gaps_duration: number;
      gaps_unit: string;
    };
  };
  
  consistency: {
    duplicatedRecords: number;
  };
  
  credibility?: {
    // Future implementation
    reliabilityScore?: number;
  };
  
  currentness: {
    mostRecentDate: string | null;
    oldestDate: string | null;
    temporalCoverage: string | null;
  };
  
  precision?: {
    // Future implementation
    precisionMetrics?: Record<string, number>;
  };
  
  relevance?: {
    // Future implementation
    relevanceScore?: number;
  };
  
  // System-dependent Data Quality Characteristics
  accessibility: {
    accessible: boolean;
  };
  
  portability: {
    portable: boolean;
    machineReadable: boolean;
    openFormat: boolean;
  };
  
  recoverability?: {
    // Future implementation
    backupAvailable?: boolean;
  };
  
  security?: {
    // Future implementation
    accessControl?: boolean;
  };
  
  traceability: {
    provenance: string[];
    temporalInformation: string[];
    spatialInformation: string[];
    identification: string[];
  };
  
  understandability: {
    confusingColumns: string[];
    uncommonColumns: string[];
  };
  
  compliance?: {
    // Future implementation
    standardsCompliance?: boolean;
  };
  
  availability?: {
    // Future implementation
    uptime?: number;
  };
}

// Quality Analysis Input
export interface DataQualityInput {
  url: string;
  format: 'csv' | 'json';
  title?: string;
  description?: string;
  dataset?: string;
}

// Distribution from DCAT-AP catalog
export interface CatalogDistribution {
  id: string;
  title: string;
  description?: string;
  accessURL: string;
  downloadURL?: string;
  format: string;
  mediaType?: string;
  byteSize?: number;
  dataset: {
    id: string;
    title: string;
    description?: string;
  };
}

// Dataset from DCAT-AP catalog  
export interface CatalogDataset {
  id: string;
  title: string;
  description?: string;
  distributions: CatalogDistribution[];
  theme?: string[];
  keywords?: string[];
  publisher?: string;
  issued?: string;
  modified?: string;
}

// Quality analysis results with observations
export interface QualityAnalysisResult {
  report: DataQualityReport;
  observations: QualityObservation[];
  score: number;
  status: 'completed' | 'error' | 'loading';
  error?: string;
}

// Quality observations for each characteristic
export interface QualityObservation {
  characteristic: QualityCharacteristic;
  definition: string;
  observations: string;
  recommendations?: string[];
}

// Quality characteristics enumeration
export type QualityCharacteristic = 
  | 'accuracy'
  | 'completeness'
  | 'consistency'
  | 'credibility'
  | 'currentness'
  | 'precision'
  | 'relevance'
  | 'accessibility'
  | 'portability'
  | 'recoverability'
  | 'security'
  | 'traceability'
  | 'understandability'
  | 'compliance'
  | 'availability';

// Analysis progress
export interface DataQualityAnalysisProgress {
  step: string;
  progress: number;
  message: string;
}