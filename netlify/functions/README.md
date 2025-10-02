# Netlify Serverless Functions

This directory contains serverless functions that run on Netlify's edge network.

## Overview

These functions provide backend API endpoints for:
- **URL Validation**: Check if data URLs are accessible
- **Data Download**: Proxy data downloads to bypass CORS restrictions
- **Health Checks**: Monitor function availability

## Architecture

```
netlify/functions/
├── api.js           # Main API handler (Express + Serverless)
├── package.json     # Function dependencies
└── README.md        # This file
```

## Endpoints

### Health Check
```bash
GET /.netlify/functions/api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-10-02T10:30:00.000Z",
  "service": "MQA Netlify Functions",
  "version": "1.0.0"
}
```

### Validate URL
```bash
POST /.netlify/functions/api/validate-url
Content-Type: application/json

{
  "url": "https://example.com/data.csv"
}
```

Response:
```json
{
  "accessible": true,
  "status": 200,
  "headers": {
    "content-type": "text/csv",
    "content-length": "12345"
  }
}
```

### Download Data
```bash
POST /.netlify/functions/api/download-data
Content-Type: application/json

{
  "url": "https://example.com/data.csv"
}
```

Response:
```json
{
  "data": "column1,column2\nvalue1,value2",
  "contentType": "text/csv",
  "size": 12345
}
```

## Local Development

### Install Dependencies
```bash
cd netlify/functions
npm install
```

### Test Locally with Netlify CLI
```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Run dev server
netlify dev

# Functions will be available at:
# http://localhost:8888/.netlify/functions/api/health
```

### Test Locally with Netlify Dev
```bash
# From project root
npm install -g netlify-cli
netlify dev

# Or use package.json script
npm run netlify:dev
```

## Deployment

### Automatic Deployment
Functions are automatically deployed when you push to:
- `develop` branch → Netlify staging
- `main` branch → Netlify production (if configured)

### Manual Deployment
```bash
# Deploy to draft URL
netlify deploy

# Deploy to production
netlify deploy --prod
```

## Configuration

### Environment Variables
Set in Netlify UI: Site Settings → Environment Variables

```bash
NODE_VERSION=18
NODE_ENV=production
```

### Function Settings
Configured in `netlify.toml`:

```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
```

## Dependencies

```json
{
  "express": "^4.18.2",        // Web framework
  "serverless-http": "^3.2.0", // Express to Lambda adapter
  "cors": "^2.8.5",            // CORS middleware
  "axios": "^1.6.2"            // HTTP client
}
```

## Features

### SSL Certificate Handling
Functions handle expired/self-signed certificates gracefully:
```javascript
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});
```

### Error Handling
All endpoints return consistent error responses:
```json
{
  "error": "Error message",
  "status": 500,
  "code": "ERROR_CODE"
}
```

### Timeouts
- URL validation: 10 seconds
- Data download: 30 seconds
- Max content length: 50MB

### Security
- CORS enabled for all origins
- Request size limit: 10MB JSON payload
- User-Agent spoofing for compatibility
- Rate limiting (via Netlify)

## Monitoring

### View Logs
```bash
# Real-time logs
netlify functions:log api

# Or in Netlify UI
# Site → Functions → api → Recent invocations
```

### Function Analytics
- Invocation count
- Execution duration
- Error rate
- Bandwidth usage

Available in Netlify UI: Site → Functions → api

## Troubleshooting

### Function Not Found
```bash
# Check function is deployed
netlify functions:list

# Verify function name matches redirect
# Should be: api.js or api/index.js
```

### Cold Start Issues
First invocation may be slow (cold start). Subsequent calls are faster.

Solution: Implement function warming or use paid tier.

### Size Limits
- Function size: 50MB (including dependencies)
- Timeout: 10 seconds (free tier) / 26 seconds (paid)
- Concurrent executions: Limited by plan

### CORS Errors
Ensure CORS is enabled in function:
```javascript
app.use(cors());
```

### SSL Certificate Errors
Functions handle SSL issues automatically. Check logs for warnings.

## Best Practices

1. **Keep functions small**: Minimize dependencies
2. **Use caching**: Leverage Netlify's edge caching
3. **Handle errors gracefully**: Return meaningful error messages
4. **Log appropriately**: Use console.log for debugging
5. **Set timeouts**: Prevent hanging requests
6. **Validate input**: Always validate request payloads
7. **Use environment variables**: Never hardcode secrets

## Performance Tips

- Use async/await for better readability
- Stream large responses when possible
- Implement request caching
- Optimize bundle size (tree shaking)
- Use connection pooling for databases

## Cost Optimization

Free tier limits (per month):
- 125,000 function invocations
- 100 hours of execution time

Tips to stay within limits:
- Cache responses when possible
- Optimize function execution time
- Use client-side logic when appropriate
- Monitor usage in Netlify dashboard

## Testing

### Unit Tests
```bash
# Install testing dependencies
npm install --save-dev jest supertest

# Run tests
npm test
```

### Integration Tests
```bash
# Test against deployed function
curl https://your-site.netlify.app/.netlify/functions/api/health

# Should return: {"status":"ok"}
```

## Support

For issues with Netlify Functions:
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Netlify Support](https://www.netlify.com/support/)
- [GitHub Issues](https://github.com/mjanez/metadata-quality-react/issues)

## License

MIT License - See project root LICENSE file
