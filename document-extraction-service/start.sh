#!/bin/bash

# Tammat Document Extraction Service Startup Script

echo "🚀 Starting Tammat Document Extraction Service..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📚 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Check if Tesseract is installed
if ! command -v tesseract &> /dev/null; then
    echo "⚠️  Warning: Tesseract OCR is not installed."
    echo "   The service may not work properly."
    echo "   Please install Tesseract OCR:"
    echo "   Ubuntu/Debian: sudo apt-get install tesseract-ocr"
    echo "   macOS: brew install tesseract"
    echo "   Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads logs

# Start the service
echo "🌟 Starting FastAPI service..."
echo "   API: http://localhost:8000"
echo "   Docs: http://localhost:8000/docs"
echo "   Health: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop the service"
echo ""

# Run the service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
