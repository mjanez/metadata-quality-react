# MQA Backend Server

Backend server for Metadata Quality Analysis (MQA) that provides CORS-free access to external resources for data quality analysis.

## Purpose

This backend server solves CORS (Cross-Origin Resource Sharing) issues when the React frontend needs to:

1. **Validate URL accessibility** - Check if data URLs are accessible before analysis
2. **Download data files** - Fetch CSV/JSON files from external sources for quality analysis

## Quick Start

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

3. **Verify it's running:**
   ```bash
   curl http://localhost:3001/api/health
   ```

4. **Enable backend in the React app:**
   - Edit `src/config/mqa-config.json`
   - Set `backend_server.enabled: true`

## API Endpoints

### Health Check
```bash
GET /api/health
```
Returns server status and information.

### URL Validation
```bash
POST /api/validate-url
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

### Data Download
```bash
POST /api/download-data
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
  "size": 25
}
```

## Configuration

The backend server is configured through:

1. **Environment variables:**
   - `PORT` - Server port (default: 3001)
   - `NODE_ENV` - Environment mode (development/production)

2. **React app configuration** (`mqa-config.json`):
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

## Security Features

- **Helmet.js** - Security headers
- **CORS** - Cross-origin resource sharing (all origins allowed in development)
- **Request size limits** - 10MB for JSON, 50MB for downloads
- **Timeouts** - 10s for validation, 30s for downloads
- **Input validation** - URL format validation

## Development vs Production

### Development Mode
- All origins allowed for CORS
- Detailed error messages
- Request logging enabled
- Auto-reload with nodemon

### Production Considerations
- Configure specific CORS origins
- Enable HTTPS
- Add rate limiting
- Configure proper logging
- Add authentication if needed
- Use process managers (PM2, Docker)

## Troubleshooting

### Backend not starting
```bash
# Check if port 3001 is available
lsof -i :3001

# Install dependencies
npm install

# Check Node.js version (requires >=16.0.0)
node --version
```

### CORS errors in React app
1. Verify backend is running: `curl http://localhost:3001/api/health`
2. Check `backend_server.enabled: true` in mqa-config.json
3. Ensure React app is accessing the correct backend URL

### Data download failures
- Check URL accessibility in browser
- Verify file size is under 50MB limit
- Check network connectivity
- Review server logs for specific errors

## Dependencies

- **express** - Web framework
- **cors** - CORS middleware
- **axios** - HTTP client for downloads
- **helmet** - Security headers
- **morgan** - Request logging
- **nodemon** (dev) - Auto-reload during development

## License

MIT - Same as the main MQA project