const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  type: { type: String, required: true },
  path: { type: String, required: true },
  remarks: { type: String, default: "" },
  uploadDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },
  documentNumber: { type: String },
  issuedBy: { type: String },
  issuedDate: { type: Date },
  status: { 
    type: String, 
    enum: ['valid', 'expiring_soon', 'expired', 'pending'], 
    default: 'valid' 
  },
  notificationSent: { type: Boolean, default: false },
  lastNotificationDate: { type: Date }
}, { _id: true });

const fileRefSchema = new mongoose.Schema({
  path: { type: String, required: true },
  remarks: { type: String, default: "" }
}, { _id: false });

const userSchema = new mongoose.Schema({
  // Clerk linkage
  // clerkId: { type: String, index: true },


  firstName: {
    type: String,
    required: [true, 'First name is required']
  },
  lastName: {
    type: String,
    // required: [true, 'Last name is required']
  },
  fullName: {
    type: String,
    default: function() {
      return `${this.firstName} ${this.lastName}`;
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  phoneNumber: {
    type: String,
  },
  password: {
    type: String,
    // required: function() { return !this.clerkId; },
    minlength: [6, 'Password must be at least 6 characters']
  },

  // Role & Department
  role: {
    type: String,
    default: 'user'
  },
  status: {
    type: String,
    enum: ['active', 'frozen', 'blocked'],
    default: 'active',
    index: true
  },
  
    // Password Reset Fields
    resetToken: String,
    resetTokenExpires: Date,
    
    // One-Time Password (OTP) fields
    otpCode: String,
    otpExpires: Date,
  
    // Additional Fields for Amer Officers
    passportNumber: String,
    company: String,
    country: String,
    // Documents & Profile
    profilePicture: fileRefSchema,
    documents: [documentSchema],
    dependents: [new mongoose.Schema({
      firstName: String,
      lastName: String,
      relationship: { type: String, enum: ['spouse','child','parent','other'] },
      passportNumber: String,
      nationality: String,
      dateOfBirth: Date,
      email: String,
      phoneNumber: String,
    }, { _id: true, timestamps: true })],
  lastLogin: Date,
  deleted: {
    type: Boolean,
    default: false
  },
  
  // Business Information
  business: {
    hasCompany: { type: Boolean, default: false },
    companyName: String,
    tradeLicense: {
      number: String,
      path: String,
      issueDate: Date,
      expiryDate: Date,
      authority: String,
      type: { type: String, enum: ['mainland', 'freezone', 'offshore'] }
    },
    establishmentType: { type: String, enum: ['mainland', 'freezone', 'offshore'] },
    businessActivity: String,
    establishmentCard: {
      number: String,
      path: String,
      expiryDate: Date
    }
  },

  // Compliance & Notifications
  compliance: {
    score: { type: Number, default: 100, min: 0, max: 100 },
    lastChecked: Date,
    expiringDocuments: [{ 
      documentId: mongoose.Schema.Types.ObjectId,
      documentType: String,
      expiryDate: Date,
      daysRemaining: Number
    }],
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      expiryReminder30Days: { type: Boolean, default: true },
      expiryReminder15Days: { type: Boolean, default: true },
      expiryReminder7Days: { type: Boolean, default: true }
    }
  },
  
}, {
  timestamps: true,
});




const User = mongoose.model('User', userSchema);
module.exports = User;
