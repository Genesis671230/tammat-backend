const axios = require('axios');

export const API_BASE_URL = 'http://localhost:5001/api/v1/auth';

// Test data
const testUser = {
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  password: 'password123',
  phoneNumber: '+971501234567',
  country: 'AE',
  role: 'user'
};

const testAmerUser = {
  firstName: 'Amer',
  lastName: 'Officer',
  email: 'amer@example.com',
  password: 'password123',
  phoneNumber: '+971501234567',
  country: 'AE',
  role: 'amer',
  emiratesId: '123456789',
  company: 'Government Department'
};

async function testAuth() {
  try {
    console.log('🧪 Testing TAMMAT Authentication System...\n');

    // Test 1: User Registration
    console.log('1️⃣ Testing User Registration...');
    try {
      const signupResponse = await axios.post(`${API_BASE_URL}/signup`, testUser);
      console.log('✅ User registration successful:', signupResponse.data.message);
      const userToken = signupResponse.data.data.token;
    } catch (error) {
      if (error.response?.data?.message === 'User with this email already exists') {
        console.log('ℹ️  User already exists, continuing with login...');
      } else {
        console.log('❌ User registration failed:', error.response?.data?.message || error.message);
      }
    }

    // Test 2: Amer Officer Registration
    console.log('\n2️⃣ Testing Amer Officer Registration...');
    try {
      const amerSignupResponse = await axios.post(`${API_BASE_URL}/signup`, testAmerUser);
      console.log('✅ Amer officer registration successful:', amerSignupResponse.data.message);
      const amerToken = amerSignupResponse.data.data.token;
    } catch (error) {
      if (error.response?.data?.message === 'User with this email already exists') {
        console.log('ℹ️  Amer officer already exists, continuing with login...');
      } else {
        console.log('❌ Amer officer registration failed:', error.response?.data?.message || error.message);
      }
    }

    // Test 3: User Login
    console.log('\n3️⃣ Testing User Login...');
    try {
      const loginResponse = await axios.post(`${API_BASE_URL}/signin`, {
        email: testUser.email,
        password: testUser.password
      });
      console.log('✅ User login successful:', loginResponse.data.message);
      const userToken = loginResponse.data.data.token;
      
      // Test 4: Get User Profile (Protected Route)
      console.log('\n4️⃣ Testing Protected Route - Get Profile...');
      try {
        const profileResponse = await axios.get(`${API_BASE_URL}/profile`, {
          headers: {
            'Authorization': `Bearer ${userToken}`
          }
        });
        console.log('✅ Profile retrieval successful:', profileResponse.data.data.user.email);
      } catch (error) {
        console.log('❌ Profile retrieval failed:', error.response?.data?.message || error.message);
      }

    } catch (error) {
      console.log('❌ User login failed:', error.response?.data?.message || error.message);
    }

    // Test 5: Amer Officer Login
    console.log('\n5️⃣ Testing Amer Officer Login...');
    try {
      const amerLoginResponse = await axios.post(`${API_BASE_URL}/signin`, {
        email: testAmerUser.email,
        password: testAmerUser.password
      });
      console.log('✅ Amer officer login successful:', amerLoginResponse.data.message);
      const amerToken = amerLoginResponse.data.data.token;
      
      // Test 6: Get Amer Officer Profile
      console.log('\n6️⃣ Testing Amer Officer Profile...');
      try {
        const amerProfileResponse = await axios.get(`${API_BASE_URL}/profile`, {
          headers: {
            'Authorization': `Bearer ${amerToken}`
          }
        });
        console.log('✅ Amer officer profile retrieval successful:', amerProfileResponse.data.data.user.role);
      } catch (error) {
        console.log('❌ Amer officer profile retrieval failed:', error.response?.data?.message || error.message);
      }

    } catch (error) {
      console.log('❌ Amer officer login failed:', error.response?.data?.message || error.message);
    }

    // Test 7: Forgot Password
    console.log('\n7️⃣ Testing Forgot Password...');
    try {
      const forgotPasswordResponse = await axios.post(`${API_BASE_URL}/forgot-password`, {
        email: testUser.email
      });
      console.log('✅ Forgot password successful:', forgotPasswordResponse.data.message);
    } catch (error) {
      console.log('❌ Forgot password failed:', error.response?.data?.message || error.message);
    }

    console.log('\n🎉 Authentication system test completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Start your frontend application');
    console.log('2. Navigate to /auth to test the UI');
    console.log('3. Try registering and logging in with different roles');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testAuth();
