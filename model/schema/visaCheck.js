const mongoose = require('mongoose');

const FREE_SERVICES = ['overstay-fine', 'absconding'];

const attachmentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const resultDocumentSchema = new mongoose.Schema({
  label: { type: String },
  filename: { type: String, required: true },
  path: { type: String, required: true },
  description: { type: String },
  uploadedAt: { type: Date, default: Date.now },
  uploadedByRole: { type: String }
}, { _id: true });

const officerCommentSchema = new mongoose.Schema({
  text: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  authorRole: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const requestedDocumentSchema = new mongoose.Schema({
  label: { type: String, required: true },
  description: { type: String },
  requestedAt: { type: Date, default: Date.now },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fulfilledAt: { type: Date }
}, { _id: true });

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  note: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByRole: { type: String },
  at: { type: Date, default: Date.now }
}, { _id: true });

const visaCheckSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  guestEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  serviceId: {
    type: String,
    required: [true, 'Service ID is required'],
    enum: [
      'overstay-fine',
      'travel-ban',
      'absconding',
      'inside-outside',
      'application-status',
      'nawakas',
      'establishment-card',
      'expiry-checker'
    ],
    index: true
  },
  serviceType: {
    type: String,
    required: [true, 'Service type display name is required']
  },
  identifiers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  speedTier: {
    type: String,
    enum: ['standard', 'fast-track'],
    default: 'standard'
  },
  status: {
    type: String,
    enum: [
      'pending_payment',
      'submitted',
      'processing',
      'reviewing',
      'completed',
      'cancelled',
      'requires_documents'
    ],
    default: 'pending_payment',
    index: true
  },
  isFreeService: {
    type: Boolean,
    default: false
  },
  amount: {
    type: Number,
    default: 0,
    min: 0
  },
  stripePaymentIntentId: {
    type: String
  },
  attachments: [attachmentSchema],
  resultDocuments: [resultDocumentSchema],
  officerComments: [officerCommentSchema],
  requestedDocuments: [requestedDocumentSchema],
  history: [historySchema],
  officerAssignedId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resultSummary: {
    type: String
  },
  resultStatus: {
    type: String,
    enum: ['clear', 'flagged', 'pending'],
    default: undefined
  }
}, {
  timestamps: true
});

// Indexes for common query patterns
visaCheckSchema.index({ userId: 1, createdAt: -1 });
visaCheckSchema.index({ status: 1, createdAt: -1 });
visaCheckSchema.index({ serviceId: 1, status: 1 });
visaCheckSchema.index({ guestEmail: 1 });

// Static method to determine if a service is free
visaCheckSchema.statics.isFreeService = function (serviceId) {
  return FREE_SERVICES.includes(serviceId);
};

const VisaCheck = mongoose.model('VisaCheck', visaCheckSchema);

module.exports = VisaCheck;
