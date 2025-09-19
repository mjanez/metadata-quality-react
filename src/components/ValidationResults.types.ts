import { ExtendedValidationResult } from '../types';

export interface ValidationLoadingStates {
  qualityMetrics: boolean;
  shaclValidation: boolean;
  vocabularyChecks: boolean;
  mqaEvaluation?: boolean;
  rdfParsing?: boolean;
}

export interface ValidationProgress {
  isValidating: boolean;
  currentStep?: string;
  estimatedTime?: number;
  startTime?: number;
  datasetsCount?: number;
  distributionsCount?: number;
}

export interface ValidationResultsProps {
  result: ExtendedValidationResult;
  onReset?: () => void;
  loadingStates?: ValidationLoadingStates;
  isProgressive?: boolean;
  validationProgress?: ValidationProgress;
}