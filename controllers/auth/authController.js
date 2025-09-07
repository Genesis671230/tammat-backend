const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../../model/schema/user');
const { createClient } = require('@supabase/supabase-js');
const { sendSMS } = require('../../utills/smsJs');
require("dotenv").config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

class AuthController {
  // User Registration
  async signup(req, res) {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        role,
        emiratesId,
        passportNumber,
        company
      } = req.body;

      // Validation
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email, deleted: { $ne: true } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user object
      const userData = {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        phoneNumber,
        role: role || 'user',
        deleted: false,
      };


      // Add role-specific fields
      if (role === 'amer') {
        userData.emiratesId = emiratesId;
        userData.passportNumber = passportNumber;
        userData.company = company;
      }
      console.log(req.body);

      // Create user in MongoDB
      const user = new User(userData);
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Return success response
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            phoneNumber: user.phoneNumber,
            country: user.country
          },
          token
        }
      });

     return;
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // User Login
  async signin(req, res) {
    try {
      const { email, password } = req.body;

      // Validation
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      // Find user
      const user = await User.findOne({ email, deleted: { $ne: true } });
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            phoneNumber: user.phoneNumber,
            country: user.country,
            lastLogin: user.lastLogin
          },
          token
        }
      });

    } catch (error) {
      console.error('Signin error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Forgot Password
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Check if user exists
      const user = await User.findOne({ email, deleted: { $ne: true } });
      if (!user) {
        // Don't reveal if user exists or not for security
        return res.status(200).json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent'
        });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { userId: user._id, type: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Store reset token in user document (you might want to add a resetToken field to your schema)
      user.resetToken = resetToken;
      user.resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour
      await user.save();

      // TODO: Send email with reset link
      // For now, just return success
      // In production, you would integrate with an email service like SendGrid, Nodemailer, etc.

      res.status(200).json({
        success: true,
        message: 'Password reset link sent to your email'
      });

    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Reset Password
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      // Verify reset token
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'password_reset') {
        return res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
      }

      // Find user
      const user = await User.findById(decoded.userId);
      if (!user || user.deleted) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if reset token is valid and not expired
      if (user.resetToken !== token || user.resetTokenExpires < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Reset token is invalid or expired'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      console.error('Reset password error:', error);
      if (error.name === 'JsonWebTokenError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
      }
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Request OTP (via SMS)
  async requestOtp(req, res) {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber) {
        return res.status(400).json({ success: false, message: 'Phone number is required' });
      }

      const user = await User.findOne({ phoneNumber, deleted: { $ne: true } });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      // Allow custom expiry (1-10 minutes)
      const minsReq = parseInt(req.body?.expiresInMinutes, 10);
      const safeMins = isNaN(minsReq) ? 5 : Math.min(10, Math.max(1, minsReq));
      const expires = new Date(Date.now() + safeMins * 60 * 1000);
      user.otpCode = otp;
      user.otpExpires = expires;
      await user.save();

      // Send SMS
      try {
        await sendSMS({
          to: phoneNumber,
          template: 'otp',
          data: { code: otp }
        });
      } catch (e) {
        // continue even if SMS provider not configured
        console.warn('SMS provider error:', e.message);
      }

      // Notify via WebSocket if connected
      try {
        const app = require('../../index');
        const wsServer = app.get('wsServer');
        wsServer?.sendToUser(user._id.toString(), 'notification', {
          type: 'otp',
          message: `Your OTP has been sent. It expires in ${safeMins} minute(s).`,
          userId: user._id.toString(),
          timestamp: new Date()
        });
      } catch {}

      return res.status(200).json({ success: true, message: 'OTP sent' });
    } catch (error) {
      console.error('Request OTP error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Verify OTP
  async verifyOtp(req, res) {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ success: false, message: 'Phone and code are required' });
      }

      const user = await User.findOne({ phoneNumber, deleted: { $ne: true } });
      if (!user || !user.otpCode || !user.otpExpires) {
        return res.status(400).json({ success: false, message: 'OTP not requested' });
      }

      if (user.otpExpires < new Date()) {
        return res.status(400).json({ success: false, message: 'OTP expired' });
      }

      if (user.otpCode !== code) {
        return res.status(400).json({ success: false, message: 'Invalid OTP' });
      }

      // Clear OTP and issue short-lived token for verification-step
      user.otpCode = undefined;
      user.otpExpires = undefined;
      await user.save();

      const token = jwt.sign({ userId: user._id, phoneVerified: true }, JWT_SECRET, { expiresIn: '15m' });

      // WS notify
      try {
        const app = require('../../index');
        const wsServer = app.get('wsServer');
        wsServer?.sendToUser(user._id.toString(), 'notification', {
          type: 'success',
          message: 'OTP verified successfully.',
          userId: user._id.toString(),
          timestamp: new Date()
        });
      } catch {}

      return res.status(200).json({ success: true, message: 'OTP verified', data: { token } });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Get current user profile
  async getProfile(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select('-password');
      if (!user || user.deleted) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            phoneNumber: user.phoneNumber,
            country: user.country,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Update user profile
  async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const updateData = req.body;

      // Remove sensitive fields from update
      delete updateData.password;
      delete updateData.role;
      delete updateData.deleted;

      const user = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: { user }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const userId = req.user.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedNewPassword;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Upload file to Supabase and save reference to MongoDB
  async uploadFile(req, res) {
    try {
      const userId = req.user.userId;
      const { file, fileType, remarks } = req.body;

      if (!file || !fileType) {
        return res.status(400).json({
          success: false,
          message: 'File and file type are required'
        });
      }

      // Upload file to Supabase Storage
      const fileName = `${userId}_${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('user-documents')
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600'
        });

      if (error) {
        console.error('Supabase upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'File upload failed'
        });
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user-documents')
        .getPublicUrl(fileName);

      // Save file reference to MongoDB
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const documentData = {
        type: fileType,
        path: urlData.publicUrl,
        remarks: remarks || '',
        uploadDate: new Date()
      };

      user.documents.push(documentData);
      await user.save();

      res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          document: documentData,
          url: urlData.publicUrl
        }
      });

    } catch (error) {
      console.error('File upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Get user documents
  async getUserDocuments(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId).select('documents');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          documents: user.documents || []
        }
      });

    } catch (error) {
      console.error('Get documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
      }
    }

  // Logout (client-side token removal)
  async logout(req, res) {
    try {
      // In a stateless JWT system, logout is handled client-side
      // The server can maintain a blacklist if needed
      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Verify token (middleware helper)
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return { valid: true, decoded };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

module.exports = new AuthController();
