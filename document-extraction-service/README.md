# Tammat Document Extraction Service

A high-performance Python FastAPI microservice for extracting text from documents using OCR (Optical Character Recognition). This service handles both images and PDFs, making it perfect for document processing workflows.

## 🚀 Features

- **Multi-format Support**: Images (PNG, JPG, JPEG, BMP, TIFF, WebP) and PDFs
- **High-accuracy OCR**: Powered by Tesseract OCR engine
- **Fast Processing**: Optimized for speed and accuracy
- **Batch Processing**: Handle multiple files simultaneously
- **Multi-language Support**: English, Arabic, Urdu, Hindi, French, Spanish, Russian, German
- **Docker Ready**: Containerized for easy deployment
- **Health Monitoring**: Built-in health checks and monitoring
- **RESTful API**: Clean, documented API endpoints

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Client App    │───▶│  FastAPI Service    │───▶│  Tesseract OCR  │
│                 │    │                      │    │                 │
│ - Upload Files  │    │ - File Validation   │    │ - Text          │
│ - Get Results   │    │ - Image Processing  │    │   Extraction    │
└─────────────────┘    │ - PDF Conversion    │    │ - Multi-lang    │
                       └──────────────────────┘    └─────────────────┘
```

## 📋 Requirements

### System Requirements
- **Python**: 3.8+
- **Tesseract OCR**: 4.0+
- **Memory**: Minimum 2GB RAM
- **Storage**: 1GB+ free space
- **OS**: Linux, macOS, or Windows

### Python Dependencies
- FastAPI
- Uvicorn
- pytesseract
- Pillow (PIL)
- pdf2image
- python-multipart

## 🚀 Quick Start

### Option 1: Docker (Recommended)

#### Prerequisites
- Docker
- Docker Compose

#### Steps
1. **Clone the repository**
   ```bash
   git clone <your-repo>
   cd document-extraction-service
   ```

2. **Build and run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

3. **Access the service**
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs
   - Health: http://localhost:8000/health

### Option 2: Local Development

#### Prerequisites
- Python 3.8+
- Tesseract OCR installed

#### Install Tesseract

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara
```

**macOS:**
```bash
brew install tesseract
brew install tesseract-lang
```

**Windows:**
Download from: https://github.com/UB-Mannheim/tesseract/wiki

#### Steps
1. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the service**
   ```bash
   python main.py
   ```

## 📚 API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "tesseract": "healthy",
  "supported_formats": {
    "images": [".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"],
    "pdfs": [".pdf"]
  }
}
```

### Extract Text (Single File)
```http
POST /extract-text
Content-Type: multipart/form-data

file: [binary file]
language: eng (optional, default: eng)
dpi: 300 (optional, default: 300)
```

**Response:**
```json
{
  "text": "Extracted text content...",
  "file_type": "image",
  "filename": "document.jpg",
  "text_length": 150,
  "language": "eng"
}
```

### Extract Text (Batch)
```http
POST /extract-text-batch
Content-Type: multipart/form-data

files: [binary files] (max 10 files)
language: eng (optional, default: eng)
```

**Response:**
```json
{
  "results": [
    {
      "filename": "doc1.pdf",
      "file_type": "pdf",
      "text": "Extracted text...",
      "status": "success",
      "text_length": 200
    }
  ],
  "total_files": 1,
  "successful": 1,
  "failed": 0
}
```

## 🔧 Configuration

### Environment Variables
```bash
# Tesseract Configuration
TESSERACT_CMD=/usr/bin/tesseract

# API Configuration
HOST=0.0.0.0
PORT=8000

# CORS Configuration
CORS_ORIGINS=["http://localhost:3000", "https://yourdomain.com"]
```

### Tesseract Configuration
The service automatically detects Tesseract installation paths:
- Linux: `/usr/bin/tesseract`
- macOS: `/usr/local/bin/tesseract`
- Windows: `C:\Program Files\Tesseract-OCR\tesseract.exe`

## 📁 File Structure
```
document-extraction-service/
├── main.py                 # FastAPI application
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose setup
├── README.md              # This file
├── uploads/               # File upload directory
├── logs/                  # Log files
└── tests/                 # Test files (optional)
```

## 🧪 Testing

### Test with cURL

**Single file:**
```bash
curl -X POST "http://localhost:8000/extract-text" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/document.jpg"
```

**Batch processing:**
```bash
curl -X POST "http://localhost:8000/extract-text-batch" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "files=@/path/to/doc1.pdf" \
  -F "files=@/path/to/doc2.jpg"
```

### Test with Python

```python
import requests

# Test single file
with open('document.jpg', 'rb') as f:
    files = {'file': f}
    response = requests.post('http://localhost:8000/extract-text', files=files)
    print(response.json())

# Test batch processing
with open('doc1.pdf', 'rb') as f1, open('doc2.jpg', 'rb') as f2:
    files = [('files', f1), ('files', f2)]
    response = requests.post('http://localhost:8000/extract-text-batch', files=files)
    print(response.json())
```

## 🐳 Docker Commands

### Build Image
```bash
docker build -t tammat-document-extraction .
```

### Run Container
```bash
docker run -p 8000:8000 tammat-document-extraction
```

### View Logs
```bash
docker logs tammat-document-extraction
```

### Stop Container
```bash
docker stop tammat-document-extraction
```

## 🔍 Monitoring & Logs

### Health Monitoring
- **Endpoint**: `/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3

### Logging
The service logs all operations with different levels:
- **INFO**: General operations
- **ERROR**: Error conditions
- **DEBUG**: Detailed debugging information

### Performance Metrics
- File processing time
- OCR accuracy (if configured)
- Memory usage
- CPU utilization

## 🚀 Production Deployment

### Environment Variables
```bash
# Production settings
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=info
CORS_ORIGINS=["https://yourdomain.com"]
```

### Docker Production
```bash
# Build production image
docker build -t tammat-document-extraction:prod .

# Run with production settings
docker run -d \
  --name tammat-document-extraction \
  -p 8000:8000 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  tammat-document-extraction:prod
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔒 Security Considerations

### File Upload Security
- File type validation
- File size limits
- Malware scanning (recommended)
- Secure file handling

### API Security
- Rate limiting
- Authentication (implement as needed)
- CORS configuration
- Input validation

### Container Security
- Non-root user
- Minimal base image
- Regular security updates
- Resource limits

## 🐛 Troubleshooting

### Common Issues

**1. Tesseract not found**
```bash
# Check Tesseract installation
tesseract --version

# Install if missing
sudo apt-get install tesseract-ocr
```

**2. PDF processing errors**
```bash
# Install poppler-utils
sudo apt-get install poppler-utils
```

**3. Memory issues**
```bash
# Increase Docker memory limit
docker run -m 4g tammat-document-extraction
```

**4. Port conflicts**
```bash
# Check port usage
netstat -tulpn | grep :8000

# Use different port
docker run -p 8001:8000 tammat-document-extraction
```

### Debug Mode
```bash
# Run with debug logging
LOG_LEVEL=debug python main.py

# Docker debug
docker run -e LOG_LEVEL=debug tammat-document-extraction
```

## 📈 Performance Optimization

### OCR Accuracy
- Use higher DPI (300+)
- Preprocess images (contrast, noise reduction)
- Use appropriate PSM modes
- Language-specific training data

### Processing Speed
- Multi-threading for PDFs
- Image compression optimization
- Caching mechanisms
- Load balancing for high traffic

## 🔮 Future Enhancements

### Planned Features
- **AI-powered text extraction** (GPT integration)
- **Document classification**
- **Table extraction**
- **Form field detection**
- **Multi-language OCR training**
- **Cloud storage integration**
- **Real-time processing**
- **Webhook notifications**

### Integration Possibilities
- **Supabase Storage** for file management
- **Redis** for caching
- **PostgreSQL** for metadata storage
- **Celery** for background processing
- **Kubernetes** for scaling

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style
- Follow PEP 8
- Use type hints
- Add docstrings
- Write unit tests

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

### Getting Help
- **Issues**: Create GitHub issues
- **Documentation**: Check this README
- **Community**: Join our Discord/Slack
- **Email**: support@tammat.com

### Reporting Bugs
Please include:
- OS and version
- Python version
- Tesseract version
- Error logs
- Steps to reproduce

---

**Built with ❤️ by the Tammat Team**

*For more information, visit: https://tammat.com*
