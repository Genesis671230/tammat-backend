#!/usr/bin/env python3
"""
Test script for Tammat Document Extraction Service
"""

import requests
import json
import time
import os
from pathlib import Path

# Service configuration
BASE_URL = "http://localhost:8000"
TEST_FILES_DIR = "test_files"

def test_health_check():
    """Test the health check endpoint"""
    print("🔍 Testing health check...")
    
    try:
        response = requests.get(f"{BASE_URL}/health")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Health check passed: {data['status']}")
            print(f"   Tesseract: {data['tesseract']}")
            print(f"   Supported formats: {data['supported_formats']}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to service. Is it running?")
        return False
    except Exception as e:
        print(f"❌ Health check error: {str(e)}")
        return False

def test_root_endpoint():
    """Test the root endpoint"""
    print("\n🔍 Testing root endpoint...")
    
    try:
        response = requests.get(f"{BASE_URL}/")
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Root endpoint: {data['message']}")
            print(f"   Version: {data['version']}")
            print(f"   Status: {data['status']}")
            return True
        else:
            print(f"❌ Root endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Root endpoint error: {str(e)}")
        return False

def test_single_file_extraction(file_path):
    """Test single file text extraction"""
    print(f"\n🔍 Testing single file extraction: {file_path}")
    
    if not os.path.exists(file_path):
        print(f"❌ Test file not found: {file_path}")
        return False
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = requests.post(f"{BASE_URL}/extract-text", files=files)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Text extraction successful")
            print(f"   File type: {data['file_type']}")
            print(f"   Text length: {data['text_length']}")
            print(f"   Language: {data['language']}")
            
            # Show first 100 characters of extracted text
            text_preview = data['text'][:100] + "..." if len(data['text']) > 100 else data['text']
            print(f"   Text preview: {text_preview}")
            return True
        else:
            print(f"❌ Text extraction failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Text extraction error: {str(e)}")
        return False

def test_batch_extraction(file_paths):
    """Test batch file text extraction"""
    print(f"\n🔍 Testing batch extraction: {len(file_paths)} files")
    
    # Check if all files exist
    existing_files = [f for f in file_paths if os.path.exists(f)]
    if not existing_files:
        print("❌ No test files found")
        return False
    
    try:
        files = []
        for file_path in existing_files:
            with open(file_path, 'rb') as f:
                files.append(('files', f))
        
        response = requests.post(f"{BASE_URL}/extract-text-batch", files=files)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Batch extraction successful")
            print(f"   Total files: {data['total_files']}")
            print(f"   Successful: {data['successful']}")
            print(f"   Failed: {data['failed']}")
            
            # Show results for each file
            for result in data['results']:
                status_icon = "✅" if result['status'] == 'success' else "❌"
                print(f"   {status_icon} {result['filename']}: {result['status']}")
                if result['status'] == 'success':
                    print(f"      Text length: {result['text_length']}")
            
            return True
        else:
            print(f"❌ Batch extraction failed: {response.status_code}")
            print(f"   Error: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Batch extraction error: {str(e)}")
        return False

def create_test_files():
    """Create test files for testing"""
    print("\n📁 Creating test files...")
    
    # Create test directory
    os.makedirs(TEST_FILES_DIR, exist_ok=True)
    
    # Create a simple text file for testing
    test_text_file = os.path.join(TEST_FILES_DIR, "test.txt")
    with open(test_text_file, 'w') as f:
        f.write("This is a test document for OCR testing.\n")
        f.write("It contains multiple lines of text.\n")
        f.write("Testing Arabic: مرحبا بالعالم\n")
        f.write("Testing numbers: 1234567890\n")
    
    print(f"✅ Created test text file: {test_text_file}")
    
    # Note: For real testing, you would need actual image/PDF files
    print("⚠️  Note: For full testing, add actual image/PDF files to the test_files directory")
    
    return [test_text_file]

def run_performance_test(file_path, iterations=3):
    """Run performance test with multiple iterations"""
    print(f"\n⚡ Running performance test: {iterations} iterations")
    
    if not os.path.exists(file_path):
        print(f"❌ Test file not found: {file_path}")
        return False
    
    times = []
    
    for i in range(iterations):
        print(f"   Iteration {i + 1}/{iterations}...")
        
        start_time = time.time()
        
        try:
            with open(file_path, 'rb') as f:
                files = {'file': f}
                response = requests.post(f"{BASE_URL}/extract-text", files=files)
            
            if response.status_code == 200:
                end_time = time.time()
                processing_time = end_time - start_time
                times.append(processing_time)
                print(f"      ✅ Completed in {processing_time:.2f}s")
            else:
                print(f"      ❌ Failed: {response.status_code}")
                return False
                
        except Exception as e:
            print(f"      ❌ Error: {str(e)}")
            return False
    
    if times:
        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        
        print(f"\n📊 Performance Results:")
        print(f"   Average time: {avg_time:.2f}s")
        print(f"   Min time: {min_time:.2f}s")
        print(f"   Max time: {max_time:.2f}s")
        
        return True
    
    return False

def main():
    """Main test function"""
    print("🚀 Tammat Document Extraction Service - Test Suite")
    print("=" * 60)
    
    # Test basic endpoints
    if not test_health_check():
        print("\n❌ Service is not healthy. Please check if it's running.")
        return
    
    test_root_endpoint()
    
    # Create test files
    test_files = create_test_files()
    
    # Test single file extraction
    if test_files:
        test_single_file_extraction(test_files[0])
        
        # Performance test
        run_performance_test(test_files[0])
    
    # Test batch extraction
    test_batch_extraction(test_files)
    
    print("\n" + "=" * 60)
    print("🎉 Test suite completed!")
    print("\n💡 Tips:")
    print("   - Add real image/PDF files to test_files/ for comprehensive testing")
    print("   - Check the service logs for detailed information")
    print("   - Use the /docs endpoint for interactive API testing")
    print("   - Monitor performance and adjust DPI settings as needed")

if __name__ == "__main__":
    main()
