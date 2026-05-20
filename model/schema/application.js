// models/Application.js
import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: [
      'overstay_fine',
      'travel_ban',
      'inside_outside',
      'absconding',
      'application_status',
      'nawakas',
      'establishment_card_ban',
      'expiry_check',
    ],
    index: true,
  },
  inputData: {
    fullName: String,
    passportNumber: String,
    emiratesId: String,
    nationality: String,
    dob: Date,
    extras: mongoose.Schema.Types.Mixed,
  },
  attachments: [{
    fileName: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  priceAed: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending_payment',
    index: true,
  },
  result: mongoose.Schema.Types.Mixed,
  resultNotes: String,
  stripePaymentIntentId: String,
  stripeChargeId: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isFastTrack: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  paidAt: Date,
  startedAt: Date,
  completedAt: Date,
}, { timestamps: true });

applicationSchema.index({ userId: 1, status: 1, createdAt: -1 });
applicationSchema.index({ status: 1, createdAt: 1 }); // for admin queue

const Application = mongoose.model('Application', applicationSchema);

export default Application;