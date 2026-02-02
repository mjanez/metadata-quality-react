# MQA Backend Server

Backend server for Metadata Quality Analysis (MQA) that provides:

1. **REST API for metadata quality assessment** - Validate RDF metadata quality programmatically
2. **SHACL validation API** - Validate against DCAT-AP, DCAT-AP-ES, NTI-RISP profiles
3. **CORS-free access** - Solve CORS issues when accessing external RDF resources

## Features

- **Quality Assessment API** - Returns JSON, JSON-LD, or W3C DQV format
- **SHACL Validation API** - Returns JSON, Turtle, or CSV reports
- **Combined Validation** - Quality + SHACL in a single request
- **Multiple Profiles** - DCAT-AP, DCAT-AP-ES, NTI-RISP, DCAT-AP-ES HVD
- **Multiple RDF Formats** - Turtle, RDF/XML, JSON-LD, N-Triples
- **Shared Configuration** - Uses same `mqa-config.json` as frontend

## Quick Start

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Start the server:**
   ```bash
   # Production (JavaScript)
   npm start
   
   # Development with auto-reload (JavaScript)
   npm run dev:js
   
   # Development with TypeScript
   npm run dev
   ```

3. **Verify it's running:**
   ```bash
   curl http://localhost:3001/api/health
   ```

## API Documentation

See [API.md](./API.md) for complete API documentation.

### Dashboard Integration

The JSON output from `/api/v1/validate` can be loaded directly into the Dashboard:

1. Call the API and save the response to a JSON file
2. Go to Dashboard > Upload Data
3. Upload the JSON file - metrics and SHACL data load automatically

The frontend auto-detects the API format and converts it to the Dashboard format.

### Quick Examples

**Quality Assessment:**
```bash
curl -X POST http://localhost:3001/api/v1/quality \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.org/catalog.ttl",
    "profile": "dcat_ap_es",
    "outputFormat": "json"
  }'
```

**SHACL Validation:**
```bash
curl -X POST http://localhost:3001/api/v1/shacl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.org/catalog.ttl",
    "profile": "nti_risp",
    "outputFormat": "turtle"
  }'
```

**Get DQV (JSON-LD) Report:**
```bash
curl -X POST http://localhost:3001/api/v1/quality \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.org/catalog.ttl",
    "profile": "dcat_ap",
    "outputFormat": "dqv"
  }' -o report.jsonld
```

## API Endpoints Summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/v1/info` | GET | API information |
| `/api/v1/profiles` | GET | Available validation profiles |
| `/api/v1/quality` | POST | Quality assessment (JSON/JSON-LD/DQV) |
| `/api/v1/shacl` | POST | SHACL validation (JSON/Turtle/CSV) |
| `/api/v1/validate` | POST | Combined quality + SHACL |
| `/api/v1/syntax` | POST | RDF syntax validation only |
| `/api/validate-url` | POST | URL accessibility check |
| `/api/download-data` | POST | Download RDF from URL |

## Configuration

The backend uses `mqa-config.json` for profile configuration, ensuring consistency with the frontend.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment mode |
| `ALLOWED_DOMAINS` | (all) | Comma-separated whitelist for SSRF protection |
| `NODE_TLS_REJECT_UNAUTHORIZED` | 1 | Set to 0 to disable SSL validation (dev only) |

### React App Integration

Edit `src/config/mqa-config.json`:
```json
{
  "backend_server": {
    "enabled": true,
    "url": "http://localhost:3001",
    "endpoints": {
      "validate_url": "/api/validate-url",
      "download_data": "/api/download-data",
      "health": "/api/health"
    }
  }
}
```

## Project Structure

```
backend/
├── server.js           # Main Express server
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript configuration
├── API.md              # API documentation
├── README.md           # This file
└── api/
    ├── routes.js       # API route definitions
    ├── types.js        # Type constants and validation
    ├── quality-service.js  # Quality assessment logic
    ├── shacl-service.js    # SHACL validation logic
    └── rdf-utils.js        # RDF parsing utilities
```

## Shared Services

The backend uses shared utilities from `../shared/`:

```
shared/
├── config/      # Configuration loader
├── types/       # TypeScript type definitions
├── utils/       # Shared utility functions
└── index.ts     # Main exports
```

This ensures the same configuration and logic is used by both frontend and backend.

## Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-origin resource sharing
- **SSRF Protection** - Blocks requests to private/internal IPs
- **Input Validation** - URL and parameter validation
- **Request Limits** - 10MB JSON, 50MB downloads
- **Timeouts** - Prevents hanging requests

## Development

```bash
# Install dependencies
npm install

# Run with auto-reload (JavaScript)
npm run dev:js

# Run with TypeScript
npm run dev

# Build TypeScript
npm run build

# Lint TypeScript
npm run lint
```

## Dependencies

### Production
- **express** - Web framework
- **cors** - CORS middleware
- **axios** - HTTP client
- **helmet** - Security headers
- **morgan** - Request logging
- **n3** - RDF parsing
- **rdfxml-streaming-parser** - RDF/XML parsing
- **shacl-engine** - SHACL validation
- **@rdfjs/data-model** - RDF data model
- **@rdfjs/dataset** - RDF dataset

### Development
- **typescript** - TypeScript compiler
- **ts-node** - TypeScript execution
- **nodemon** - Auto-reload
- **@types/*** - Type definitions

## License

AGPL-3.0 - Same as the main MQA project