# MQA REST API

REST API for metadata quality assessment and SHACL validation based on FAIR+C methodology.

## Base URL

```
http://localhost:3001/api/v1
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/info` | API information |
| GET | `/profiles` | Available validation profiles |
| POST | `/quality` | Quality assessment |
| POST | `/shacl` | SHACL validation |
| POST | `/validate` | Combined quality + SHACL |
| POST | `/syntax` | RDF syntax check |
| DELETE | `/cache` | Clear SHACL cache |

---

### GET /profiles

Returns available validation profiles and supported formats.

**Response:**
```json
{
  "profiles": {
    "dcat_ap_es": {
      "name": "DCAT-AP-ES 1.0.2",
      "defaultVersion": "1.0.2",
      "versions": [...]
    }
  },
  "formats": ["turtle", "rdfxml", "jsonld", "ntriples", "auto"],
  "outputFormats": ["json", "jsonld", "dqv"],
  "shaclOutputFormats": ["json", "turtle", "csv"]
}
```

---

### POST /quality

Assess metadata quality using MQA methodology.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | string | * | - | RDF content as text |
| `url` | string | * | - | URL to fetch RDF from |
| `profile` | string | No | `dcat_ap_es` | Validation profile |
| `version` | string | No | default | Profile version |
| `format` | string | No | `auto` | RDF format |
| `outputFormat` | string | No | `json` | Output: `json`, `jsonld`, `dqv` |

*Either `content` or `url` is required.

**Example:**
```bash
curl -X POST http://localhost:3001/api/v1/quality \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.org/catalog.ttl", "profile": "dcat_ap_es"}'
```

**Response (JSON):**
```json
{
  "success": true,
  "profile": "dcat_ap_es",
  "version": "1.0.2",
  "quality": {
    "totalScore": 285,
    "maxScore": 405,
    "percentage": 70.4,
    "byCategory": {
      "findability": { "score": 85, "maxScore": 100, "percentage": 85 },
      "accessibility": { "score": 80, "maxScore": 100, "percentage": 80 },
      "interoperability": { "score": 55, "maxScore": 110, "percentage": 50 },
      "reusability": { "score": 45, "maxScore": 75, "percentage": 60 },
      "contextuality": { "score": 20, "maxScore": 20, "percentage": 100 }
    }
  },
  "metrics": [
    {
      "id": "dcat_keyword",
      "name": "keyword",
      "property": "dcat:keyword",
      "score": 30,
      "maxScore": 30,
      "weight": 30,
      "category": "findability",
      "entityType": "Dataset",
      "totalEntities": 5,
      "compliantEntities": 5,
      "compliancePercentage": 100,
      "found": true
    }
  ],
  "stats": {
    "triples": 1250,
    "subjects": 45,
    "datasets": 3,
    "distributions": 12
  },
  "timestamp": "2024-12-17T10:30:00.000Z"
}
```

**Response (DQV/JSON-LD):**

Use `outputFormat: "dqv"` or `outputFormat: "jsonld"` to get W3C Data Quality Vocabulary format.

---

### POST /shacl

Validate RDF against SHACL shapes.

**Request:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `content` | string | * | - | RDF content |
| `url` | string | * | - | URL to fetch RDF |
| `profile` | string | No | `dcat_ap_es` | Validation profile |
| `format` | string | No | `auto` | RDF format |
| `outputFormat` | string | No | `json` | Output: `json`, `turtle`, `csv` |
| `language` | string | No | `es` | Messages language |

**Response (JSON):**
```json
{
  "success": true,
  "profile": "dcat_ap_es",
  "conforms": false,
  "totalViolations": 3,
  "summary": {
    "violations": 3,
    "warnings": 5,
    "infos": 2
  },
  "violations": [
    {
      "focusNode": "http://example.org/dataset/1",
      "path": "http://purl.org/dc/terms/publisher",
      "message": ["Dataset must have a dct:publisher"],
      "severity": "Violation",
      "sourceConstraintComponent": "sh:MinCountConstraintComponent"
    }
  ],
  "warnings": [...],
  "timestamp": "2024-12-17T10:30:00.000Z"
}
```

---

### POST /validate

Combined quality assessment and SHACL validation in a single request.

**Request:** Same as `/quality`

**Response:**
```json
{
  "success": true,
  "profile": "dcat_ap_es",
  "version": "1.0.2",
  "quality": {
    "totalScore": 285,
    "maxScore": 405,
    "percentage": 70.4,
    "byCategory": {...}
  },
  "shacl": {
    "conforms": false,
    "totalViolations": 3,
    "violations": 3,
    "warnings": 5
  },
  "metrics": [...],
  "shaclViolations": [...],
  "shaclWarnings": [...],
  "stats": {...},
  "timestamp": "2024-12-17T10:30:00.000Z"
}
```

This response format can be loaded directly into the Dashboard (auto-converted).

---

### POST /syntax

Quick RDF syntax validation without quality assessment.

**Request:**
```json
{
  "content": "@prefix dcat: <http://www.w3.org/ns/dcat#> ...",
  "format": "auto"
}
```

**Response:**
```json
{
  "valid": true,
  "format": "turtle",
  "tripleCount": 1250
}
```

---

## Validation Profiles

| Profile | Description |
|---------|-------------|
| `dcat_ap` | DCAT Application Profile for European data portals |
| `dcat_ap_es` | Spanish extension of DCAT-AP |
| `dcat_ap_es_hvd` | DCAT-AP-ES for High Value Datasets |
| `nti_risp` | Spanish NTI-RISP profile |
| `dcat_ap_es_legacy` | Legacy version of DCAT-AP-ES profile with older formats (`dct:IMT`) |

## RDF Formats

| Format | MIME Type |
|--------|-----------|
| `turtle` | text/turtle |
| `rdfxml` | application/rdf+xml |
| `jsonld` | application/ld+json |
| `ntriples` | application/n-triples |
| `auto` | Auto-detect |

## Error Responses

```json
{
  "error": "Error description",
  "details": "Additional information"
}
```

| Code | Description |
|------|-------------|
| 400 | Bad request (invalid RDF, missing parameters) |
| 500 | Internal server error |

## Usage Examples

### Python

```python
import requests

response = requests.post(
    'http://localhost:3001/api/v1/quality',
    json={
        'url': 'https://example.org/catalog.ttl',
        'profile': 'dcat_ap_es'
    }
)
result = response.json()
print(f"Score: {result['quality']['percentage']}%")
```

### JavaScript

```javascript
const response = await fetch('http://localhost:3001/api/v1/quality', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.org/catalog.ttl',
    profile: 'dcat_ap_es'
  })
});
const result = await response.json();
console.log(`Score: ${result.quality.percentage}%`);
```

### cURL

```bash
# Quality assessment
curl -X POST http://localhost:3001/api/v1/quality \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.org/catalog.ttl","profile":"dcat_ap_es"}' \
  -o quality-report.json

# SHACL validation (Turtle output)
curl -X POST http://localhost:3001/api/v1/shacl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.org/catalog.ttl","outputFormat":"turtle"}' \
  -o shacl-report.ttl

# DQV format
curl -X POST http://localhost:3001/api/v1/quality \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.org/catalog.ttl","outputFormat":"dqv"}' \
  -o quality-dqv.jsonld
```

## Dashboard Integration

The JSON output from `/validate` endpoint can be loaded directly into the Dashboard. The frontend auto-detects the API format and converts it, loading both quality metrics and SHACL results automatically.

1. Save the API response to a JSON file
2. Upload in Dashboard > "Load dashboard data"
3. Both metrics and SHACL data are loaded in one step
