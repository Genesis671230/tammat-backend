const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  path: { type: String, required: true },
  filename: { type: String }
}, { _id: false });

const historySchema = new mongoose.Schema({
  action: { type: String, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const visaApplicationSchema = new mongoose.Schema({
  applicationType: {
    type: String,
    enum: ['family_visa', 'residence_visa', 'entry_permit', 'emirates_id', 'medical'],
    required: true
  },
  sponsor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sponsored: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'docs_required', 'approved', 'rejected', 'closed'],
    default: 'draft'
  },
  attachments: [attachmentSchema],
  metadata: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  history: [historySchema]
}, { timestamps: true });

module.exports = mongoose.model('VisaApplication', visaApplicationSchema); 