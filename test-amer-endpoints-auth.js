const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:5001/api/v1';

// Create a test JWT token for Amer officer
const createTestToken = () => {
  const payload = {
    _id: '507f1f77bcf86cd799439010', // Valid MongoDB ObjectId
    userId: '507f1f77bcf86cd799439010', // Valid MongoDB ObjectId
    role: 'amer',
    email: 'amer@tammat.ae',
    name: 'Test Amer Officer'
  };
  
  // Use the same secret as the auth middleware
  const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

// Test configuration
const TEST_CONFIG = {
  amerToken: createTestToken(),
  applicationId: '507f1f77bcf86cd799439011', // Valid MongoDB ObjectId format
  attachmentId: '507f1f77bcf86cd799439012', // Valid MongoDB ObjectId format
  userId: '507f1f77bcf86cd799439013'
};

// Helper function to make authenticated requests
async function makeRequest(method, endpoint, data = null, token = TEST_CONFIG.amerToken) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status || 500 
    };
  }
}

// Test functions
async function testGetAllApplications() {
  console.log('\n🔍 Testing: Get All Applications');
  const result = await makeRequest('GET', '/visa/applications');
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Applications count:', result.data.results || 0);
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testGetStats() {
  console.log('\n🔍 Testing: Get Statistics');
  const result = await makeRequest('GET', '/visa/stats');
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Statistics retrieved successfully');
    console.log('Stats data:', Object.keys(result.data.stats || {}));
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testCreateApplication() {
  console.log('\n🔍 Testing: Create Application');
  const data = {
    applicationType: 'family_visa_spouse',
    sponsored: {
      firstName: 'Jane',
      lastName: 'Doe',
      relationship: 'spouse'
    },
    serviceData: {
      id: 1,
      name: 'Family Visa - Spouse',
      requirements: ['Passport', 'Marriage Certificate']
    }
  };
  const result = await makeRequest('POST', '/visa', data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Application created successfully');
    console.log('Application ID:', result.data.data?.application?._id);
    // Update TEST_CONFIG with real application ID
    if (result.data.data?.application?._id) {
      TEST_CONFIG.applicationId = result.data.data.application._id;
    }
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testGetApplication() {
  console.log('\n🔍 Testing: Get Single Application');
  const result = await makeRequest('GET', `/visa/applications/${TEST_CONFIG.applicationId}`);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Application found:', !!result.data.application);
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testUpdateApplicationStatus() {
  console.log('\n🔍 Testing: Update Application Status');
  const data = {
    status: 'under_review',
    comment: 'Application is now under review by Amer officer'
  };
  const result = await makeRequest('PUT', `/visa/applications/${TEST_CONFIG.applicationId}/status`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Status updated successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testUpdateApplicationDetails() {
  console.log('\n🔍 Testing: Update Application Details');
  const data = {
    sponsor: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+971501234567',
      emiratesId: '784-1234-5678901-2'
    },
    sponsored: {
      firstName: 'Jane',
      lastName: 'Doe',
      nationality: 'American',
      relationship: 'spouse'
    }
  };
  const result = await makeRequest('PATCH', `/visa/applications/${TEST_CONFIG.applicationId}/details`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Details updated successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testAddFraudAlert() {
  console.log('\n🔍 Testing: Add Fraud Alert');
  const data = {
    type: 'document_verification',
    severity: 'medium',
    description: 'Suspicious document detected during verification process'
  };
  const result = await makeRequest('POST', `/visa/applications/${TEST_CONFIG.applicationId}/fraud-alert`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Fraud alert added successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testIssuePenalty() {
  console.log('\n🔍 Testing: Issue Penalty');
  const data = {
    type: 'late_submission',
    amount: 500,
    description: 'Penalty for late submission of required documents'
  };
  const result = await makeRequest('POST', `/visa/applications/${TEST_CONFIG.applicationId}/penalty`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Penalty issued successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testRequestDocuments() {
  console.log('\n🔍 Testing: Request Documents');
  const data = {
    requested: ['sponsor_emirates_id', 'sponsored_passport_front'],
    note: 'Please provide updated Emirates ID and passport copy'
  };
  const result = await makeRequest('POST', `/visa/applications/${TEST_CONFIG.applicationId}/request-documents`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Document request sent successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testRequestOTP() {
  console.log('\n🔍 Testing: Request OTP');
  const data = {
    phone: '+971501234567',
    minutes: 10
  };
  const result = await makeRequest('POST', `/visa/applications/${TEST_CONFIG.applicationId}/otp`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('OTP requested successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

async function testSetGovStage() {
  console.log('\n🔍 Testing: Set Government Stage');
  const data = {
    stage: 'mohre_pending'
  };
  const result = await makeRequest('POST', `/visa/applications/${TEST_CONFIG.applicationId}/stage`, data);
  console.log('Status:', result.status);
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Government stage updated successfully');
  } else {
    console.log('Error:', result.error);
  }
  return result.success;
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Amer Officer Endpoints Test Suite (with Auth)');
  console.log('=' .repeat(60));
  console.log('Using test token:', TEST_CONFIG.amerToken.substring(0, 50) + '...');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Get Statistics', fn: testGetStats },
    { name: 'Create Application', fn: testCreateApplication },
    { name: 'Get Single Application', fn: testGetApplication },
    { name: 'Update Application Status', fn: testUpdateApplicationStatus },
    { name: 'Update Application Details', fn: testUpdateApplicationDetails },
    { name: 'Add Fraud Alert', fn: testAddFraudAlert },
    { name: 'Issue Penalty', fn: testIssuePenalty },
    { name: 'Request Documents', fn: testRequestDocuments },
    { name: 'Request OTP', fn: testRequestOTP },
    { name: 'Set Government Stage', fn: testSetGovStage },
    { name: 'Get All Applications', fn: testGetAllApplications }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      const success = await test.fn();
      results.push({ name: test.name, success });
    } catch (error) {
      console.log(`❌ ${test.name} failed with error:`, error.message);
      results.push({ name: test.name, success: false, error: error.message });
    }
  }
  
  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 Test Results Summary');
  console.log('=' .repeat(60));
  
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n📈 Overall Results:');
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  console.log(`📊 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! Amer officer endpoints are working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the server logs and configuration.');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  createTestToken,
  TEST_CONFIG
};
