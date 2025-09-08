const mongoose = require('mongoose');

const visaApplicationSchema = new mongoose.Schema({
  // Application Details
  applicationType: {
    type: String,
    required: [true, 'Application type is required'],
    enum: ['family_visa_spouse', 'family_visa_child', 'residence_visa', 'entry_permit', 'emirates_id', 'visa_renewal', 'medical', 'change_status', 'visa_stamping']
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['draft', 'submitted', 'under_review', 'docs_required', 'approved', 'rejected', 'closed', 'fraud_detected', 'penalty_issued'],
    default: 'draft'
  },
  accessStatus: {
    type: String,
    enum: ['normal', 'frozen', 'blocked'],
    default: 'normal',
    index: true
  },

  // Sponsor Information - Only userId required, Amer officer will collect other data
  sponsor: {
    userId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Sponsor user ID is required']
    },
    firstName: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    lastName: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    email: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    phone: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    emiratesId: {
      type: String
      // Removed required - Amer officer will collect this data
    }
  },

  // Sponsored Person Information - All optional, Amer officer will collect data
  sponsored: {
    firstName: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    lastName: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    dateOfBirth: {
      type: Date
      // Removed required - Amer officer will collect this data
    },
    nationality: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    passportNumber: {
      type: String
      // Removed required - Amer officer will collect this data
    },
    relationship: {
      type: String,
      enum: ['spouse', 'child', 'parent', 'other']
      // Removed required - Amer officer will collect this data
    },
    occupation: String,
    income: Number
  },

  // Document Attachments
  attachments: [{
    type: {
      type: String,
      required: true,
      enum: [
        'sponsor_visa',
        'sponsor_emirates_id',
        'sponsor_passport',
        'sponsor_salary_certificate',
        'sponsor_trade_license',
        'sponsor_establishment_card',
        'sponsored_passport_front',
        'sponsored_passport_back',
        'sponsored_photo',
        'marriage_certificate',
        'birth_certificate',
        'medical_certificate',
        'police_clearance',
        'other'
      ]
    },
    path: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'requested'],
      default: 'pending'
    },
    extractedData: {
      type: mongoose.Schema.Types.Mixed
    },
    isRequested: {
      type: Boolean,
      default: false
    },
    requestedAt: {
      type: Date
    },
    requestedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    rejectionReason: {
      type: String
    },
    rejectedAt: {
      type: Date
    },
    rejectedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    approvedAt: {
      type: Date
    },
    approvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    comments: [{
      userId: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
      },
      comment: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }]
  }],

  // Application Metadata
  metadata: {
    submittedAt: Date,
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    completedAt: Date,
    assignedOfficer: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    govStage: { type: String, enum: ['draft','mohre_pending','gdrfa_pending','icp_pending','printing','completed'], default: 'draft' },
    requiredDocuments: [{ type: String }],
    chatHistory: [{
      type: {
        type: String,
        enum: ['user', 'bot', 'system', 'amer'],
        required: true
      },
      content: {
        type: String,
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      userId: mongoose.Schema.ObjectId
    }]
  },

  // Fraud Detection
  fraudAlerts: [{
    type: {
      type: String,
      enum: ['document_verification', 'identity_mismatch', 'suspicious_activity', 'other'],
      required: true
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true
    },
    description: String,
    detectedAt: {
      type: Date,
      default: Date.now
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  }],

  // Penalties
  penalties: [{
    type: {
      type: String,
      enum: ['late_submission', 'document_forgery', 'false_information', 'other'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: String,
    issuedAt: {
      type: Date,
      default: Date.now
    },
    issuedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    paidAt: Date,
    paymentReference: String
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Application history (actions log)
visaApplicationSchema.add({
  history: [{
    action: { type: String, required: true },
    by: { type: String },
    note: { type: String },
    at: { type: Date, default: Date.now }
  }]
});

// Indexes
visaApplicationSchema.index({ 'sponsor.userId': 1 });
visaApplicationSchema.index({ status: 1 });
visaApplicationSchema.index({ 'metadata.assignedOfficer': 1 });
visaApplicationSchema.index({ createdAt: 1 });

// Virtual populate reviews
visaApplicationSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'application',
  localField: '_id'
});

// Pre-save middleware
visaApplicationSchema.pre('save', function(next) {
  this.metadata.lastUpdated = new Date();
  next();
});

// Instance methods
visaApplicationSchema.methods.isComplete = function() {
  // Simplified completion check - only requires document uploads
  return this.status !== 'draft' && this.attachments.length > 0;
};

visaApplicationSchema.methods.canSubmit = function() {
  // Application can be submitted with just documents - Amer officer will collect other data
  return this.attachments.length > 0;
};

visaApplicationSchema.methods.addComment = function(userId, comment) {
  this.metadata.chatHistory.push({
    type: 'user',
    content: comment,
    userId
  });
  return this.save();
};

visaApplicationSchema.methods.addFraudAlert = function(type, severity, description) {
  this.fraudAlerts.push({
    type,
    severity,
    description
  });
  return this.save();
};

visaApplicationSchema.methods.issuePenalty = function(type, amount, description, issuedBy) {
  this.penalties.push({
    type,
    amount,
    description,
    issuedBy
  });
  return this.save();
};

const VisaApplication = mongoose.model('VisaApplication', visaApplicationSchema);

module.exports = VisaApplication;