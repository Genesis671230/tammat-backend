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
  clerkId: { type: String, index: true },

  // Basic Information
  employeeId: {
    type: String,
    // required: true,
    unique: true
  },
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
    required: function() { return !this.clerkId; },
    minlength: [6, 'Password must be at least 6 characters']
  },

  // Role & Department
  role: {
    type: String,
    enum: ['admin', 'user', 'manager', 'sponsor', 'sponsored', 'amer'],
    default: 'user'
  },
  lastLogin: Date,
  deleted: {
    type: Boolean,
    default: false
  },

  // Documents & Profile
  profilePicture: fileRefSchema,
  documents: [documentSchema],

  // Entry Tracking
  entries: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceEntryData'
  }],
  entryCount: {
    type: Number,
    default: 0
  },
  lastEntryDate: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for entry statistics
userSchema.virtual('entryStats').get(function() {
  return {
    total: this.entryCount,
    lastSubmission: this.lastEntryDate
  };
});

// Pre-save middleware to update fullName
userSchema.pre('save', function(next) {
  this.fullName = `${this.firstName} ${this.lastName}`;
  next();
});

const User = mongoose.model('User', userSchema);
module.exports = User;
