const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  type: { type: String, required: true },
  path: { type: String, required: true },
  remarks: { type: String, default: "" },
  uploadDate: { type: Date, default: Date.now }
}, { _id: false });

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
  
}, {
  timestamps: true,
});




const User = mongoose.model('User', userSchema);
module.exports = User;
