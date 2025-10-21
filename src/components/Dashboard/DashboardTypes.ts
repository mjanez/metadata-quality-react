// Dashboard specific types for the JSON metrics and SHACL data

export interface Profile {
  id: string;
  name: string;
  version: string;
  url: string;
}

export interface DashboardMetricsData {
  source: string;
  created: string;
  totalScore: number;
  maxScore: number;
  rating: string;
  profile: Profile;
  dimensions: {
    findability: number;
    accessibility: number;
    interoperability: number;
    reusability: number;
    contextuality: number;
  };
  metrics: Array<{
    id: string;
    dimension: string;
    score: number;
    maxScore: number;
    percentage: number;
    weight: number;
    found: boolean;
    description?: string; // Add description field for metric explanations
    // Compliance information
    entityType?: string;
    totalEntities?: number;
    compliantEntities?: number;
    compliancePercentage?: number;
    datasetEntities?: { total: number; compliant: number };
    distributionEntities?: { total: number; compliant: number };
  }>;
}

export interface DashboardSHACLData {
  ttlContent: string;
  fileName: string;
  profile?: Profile;
}

export interface DashboardData {
  metricsData: DashboardMetricsData | null;
  shaclData: DashboardSHACLData | null;
}