# Shared Services

This folder contains shared TypeScript services that can be used by both the frontend (React) and backend (Node.js/Express) applications.

## Architecture

```
shared/
├── config/
│   └── index.ts          # Configuration loader (works in browser & Node.js)
├── types/
│   └── index.ts          # Shared TypeScript types
├── utils/
│   └── index.ts          # Shared utilities
└── index.ts              # Main export file
```

## Purpose

The shared module ensures:

1. **Single source of truth** - Configuration and types defined once
2. **No code duplication** - Same validation logic in frontend and backend
3. **Type safety** - Full TypeScript support across the stack
4. **Configuration-driven** - Uses `mqa-config.json` for all profile settings

## What's Shared

### Types (`types/index.ts`)

All TypeScript interfaces and types used by both applications:

- `ValidationProfile` - Profile identifiers (dcat_ap, dcat_ap_es, etc.)
- `RDFFormat` - RDF format types (turtle, rdfxml, jsonld, ntriples)
- `QualityResult`, `QualityMetric` - Quality assessment results
- `SHACLReport`, `SHACLViolation` - SHACL validation results
- `DQVReport` - Data Quality Vocabulary JSON-LD format
- API request/response types

### Configuration (`config/index.ts`)

Isomorphic configuration loader:

- `loadMQAConfig()` - Load main configuration
- `getProfileConfig(profile)` - Get profile settings
- `getProfileMetrics(profile)` - Get metrics for a profile
- `getSHACLFiles(profile, version)` - Get SHACL file URLs
- `getAppInfo()` - Get application metadata

### Utilities (`utils/index.ts`)

Common utility functions:

- `expandProperty(property)` - Expand prefixed URIs (dct:title → full URI)
- `detectRDFFormat(content)` - Auto-detect RDF format
- `preprocessRdfForInvalidIRIs(content)` - Fix common IRI issues
- `getMetricEntityType(metricId)` - Get entity type for a metric
- `getVocabularyMetricInfo(metricId)` - Get vocabulary info for metrics
- `fetchContent(url)` - Isomorphic URL fetching

## Usage

### Frontend (React)

```typescript
import { 
  loadMQAConfig, 
  QualityResult, 
  ValidationProfile 
} from '../shared';

async function validateMetadata(content: string, profile: ValidationProfile) {
  const config = await loadMQAConfig();
  // Use shared configuration
}
```

### Backend (Node.js)

```typescript
import { 
  loadMQAConfig, 
  QualityResult, 
  ValidationProfile,
  expandProperty 
} from '../../shared';

router.post('/quality', async (req, res) => {
  const config = await loadMQAConfig();
  // Use same configuration as frontend
});
```

## Environment Detection

The services automatically detect the runtime environment:

```typescript
import { isNode, isBrowser } from '../shared';

if (isNode) {
  // Node.js specific code
  const fs = await import('fs/promises');
} else {
  // Browser specific code
  const response = await fetch(url);
}
```

## Building

The shared folder is included in both frontend and backend builds:

### Frontend
```bash
# Included automatically by Create React App
npm run build
```

### Backend
```bash
cd backend

# Build TypeScript
npm run build

# Or run directly with ts-node
npm run dev
```

## Key Exports

```typescript
// Types
export type ValidationProfile = 'dcat_ap' | 'dcat_ap_es' | 'nti_risp' | 'dcat_ap_es_hvd' | 'dcat_ap_es_legacy';
export type RDFFormat = 'turtle' | 'rdfxml' | 'jsonld' | 'ntriples' | 'auto';

// Configuration
export function loadMQAConfig(): Promise<MQAConfig>;
export function getProfileConfig(profile: ValidationProfile): Promise<ProfileConfig>;
export function getSHACLFiles(profile: ValidationProfile, version?: string): Promise<string[]>;

// Utilities
export function expandProperty(property: string): string;
export function detectRDFFormat(content: string): RDFFormat;
export function preprocessRdfForInvalidIRIs(content: string): { processedContent: string; warnings: string[] };

// Constants
export const PREFIXES: { [key: string]: string };
export const RDF_URIS: { RDF_TYPE: string; RDFS_LABEL: string; RDF_VALUE: string };
export const ENTITY_TYPE_URIS: { Dataset: string; Distribution: string; Catalog: string };
```

## Adding New Shared Code

1. Add types to `types/index.ts`
2. Add utilities to `utils/index.ts`
3. Add configuration helpers to `config/index.ts`
4. Export from `index.ts`

Ensure all code is isomorphic (works in both browser and Node.js) or use environment detection for platform-specific implementations.
