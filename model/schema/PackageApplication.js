// const mongoose = require('mongoose');

// const packageApplicationSchema = new mongoose.Schema(
//   {
//     // Owner (optional — lead may submit before account exists)
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//       index: true,
//     },

//     // Reference shown to the customer
//     referenceId: {
//       type: String,
//       unique: true,
//       index: true,
//     },

//     // Which package — maps to sub2Slug in the packages JSON (PK1, PK3, PK5...)
//     packageSlug: {
//       type: String,
//       required: [true, 'Package slug is required'],
//       index: true,
//     },
//     packageName: {
//       type: String,
//       required: [true, 'Package name is required'],
//     },
//     serviceId: { type: Number },        // Recordid from JSON
//     totalServiceCount: { type: Number }, // services bundled in the package

//     // Applicant type drives which doc set / price applies
//     applicantType: {
//       type: String,
//       enum: ['inside', 'outside'],
//       default: 'outside',
//     },

//     // Lead contact — the whole point: team contacts the customer
//     contact: {
//       fullName: { type: String, required: [true, 'Full name is required'] },
//       email: { type: String },
//       phone: { type: String, required: [true, 'Phone is required'] },
//       nationality: { type: String },
//       preferredLanguage: { type: String, enum: ['en', 'ar'], default: 'en' },
//     },

//     // Pricing snapshot captured at submission (price can change later in JSON)
//     pricing: {
//       baseAmount: { type: Number, required: true },
//       currency: { type: String, default: 'AED' },
//       priceType: { type: String, default: 'Start From' }, // matches JSON PriceType
//     },

//     // Documents the customer uploaded (R2 / disk URLs)
//     documents: [
//       {
//         docKey: { type: String, required: true }, // stable key from package json e.g. "marriage_certificate"
//         label: { type: String, required: true },  // human label shown in UI
//         url: { type: String, required: true },     // R2 / storage url
//         originalName: { type: String },
//         fileSize: { type: Number },
//         mimeType: { type: String },
//         status: {
//           type: String,
//           enum: ['pending', 'approved', 'rejected'],
//           default: 'pending',
//         },
//         uploadedAt: { type: Date, default: Date.now },
//       },
//     ],

//     // Lifecycle — lead-first, payment comes after team contact
//     status: {
//       type: String,
//       enum: [
//         'submitted',        // lead came in, awaiting team contact
//         'contacted',        // team reached out
//         'docs_required',    // need more documents
//         'pending_payment',  // confirmed, payment link sent
//         'paid',
//         'processing',
//         'completed',
//         'rejected',
//         'cancelled',
//       ],
//       default: 'submitted',
//       index: true,
//     },

//     assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

//     // Lightweight action log
//     history: [
//       {
//         action: { type: String, required: true },
//         by: { type: String },
//         note: { type: String },
//         at: { type: Date, default: Date.now },
//       },
//     ],

//     payment: {
//       provider: { type: String, enum: ['stripe', 'telr', 'manual', null], default: null },
//       transactionId: { type: String },
//       paidAmount: { type: Number },
//       paidAt: { type: Date },
//     },

//     submittedAt: { type: Date, default: Date.now },
//   },
//   { timestamps: true }
// );

// packageApplicationSchema.index({ status: 1, createdAt: -1 }); // admin queue
// packageApplicationSchema.index({ 'contact.phone': 1 });

// // Auto-generate reference id like TMMT-PK5-48213
// packageApplicationSchema.pre('validate', function (next) {
//   if (!this.referenceId) {
//     const rand = Math.floor(10000 + Math.random() * 89999);
//     const slug = (this.packageSlug || 'PKG').toUpperCase();
//     this.referenceId = `TMMT-${slug}-${rand}`;
//   }
//   next();
// });


// module.exports = mongoose.model('PackageApplication', packageApplicationSchema);



const mongoose = require('mongoose');

const packageApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    referenceId: { type: String, unique: true, index: true },

    packageSlug: { type: String, required: [true, 'Package slug is required'], index: true },
    packageName: { type: String, required: [true, 'Package name is required'] },
    serviceId: { type: Number },
    totalServiceCount: { type: Number },

    applicantType: { type: String, enum: ['inside', 'outside'], default: 'outside' },

    contact: {
      fullName: { type: String, required: [true, 'Full name is required'] },
      email: { type: String },
      phone: { type: String, required: [true, 'Phone is required'] },
      nationality: { type: String },
      preferredLanguage: { type: String, enum: ['en', 'ar'], default: 'en' },
    },

    pricing: {
      baseAmount: { type: Number, required: true },
      currency: { type: String, default: 'AED' },
      priceType: { type: String, default: 'Start From' },
    },

    documents: [
      {
        docKey: { type: String, required: true },
        label: { type: String, required: true },
        url: { type: String, required: true },
        originalName: { type: String },
        fileSize: { type: Number },
        mimeType: { type: String },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        rejectionReason: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Amer can ask the customer for specific extra documents
    requestedDocuments: [
      {
        docKey: { type: String },
        label: { type: String, required: true },
        note: { type: String },
        status: { type: String, enum: ['pending', 'fulfilled'], default: 'pending' },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        requestedAt: { type: Date, default: Date.now },
        fulfilledAt: { type: Date },
      },
    ],

    // Two-way thread between customer and officer
    comments: [
      {
        by: { type: String, enum: ['customer', 'amer', 'admin', 'system'], default: 'system' },
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        authorName: { type: String },
        message: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],

    status: {
      type: String,
      enum: [
        'submitted', 'contacted', 'docs_required', 'pending_payment',
        'paid', 'processing', 'completed', 'rejected', 'cancelled',
      ],
      default: 'submitted',
      index: true,
    },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    history: [
      {
        action: { type: String, required: true },
        by: { type: String },
        note: { type: String },
        at: { type: Date, default: Date.now },
      },
    ],

    payment: {
      provider: { type: String, enum: ['stripe', 'telr', 'manual', null], default: null },
      transactionId: { type: String },
      paidAmount: { type: Number },
      status: { type: String, enum: ['unpaid', 'pending', 'paid', 'refunded'], default: 'unpaid' },
      paymentLink: { type: String },
      paidAt: { type: Date },
    },

    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

packageApplicationSchema.index({ status: 1, createdAt: -1 });
packageApplicationSchema.index({ 'contact.phone': 1 });

packageApplicationSchema.pre('validate', function (next) {
  if (!this.referenceId) {
    const rand = Math.floor(10000 + Math.random() * 89999);
    const slug = (this.packageSlug || 'PKG').toUpperCase();
    this.referenceId = `TMMT-${slug}-${rand}`;
  }
  next();
});

const PackageApplication = mongoose.model('PackageApplication', packageApplicationSchema);
module.exports = PackageApplication;