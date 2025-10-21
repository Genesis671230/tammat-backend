const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const VisaApplication = require('../../model/schema/visaApplication');
const Notification = require('../../model/schema/notification');
const AuditLog = require('../../model/schema/auditLog');
const catchAsync = require('../../utills/catchAsync');
const AppError = require('../../utills/appError');
const { Types } = require('mongoose');
const User = require('../../model/schema/user');
// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = path.join(__dirname, '../../uploads/applications/', req.params.applicationId);
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch(err => cb(err));
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept images and PDFs
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new AppError('Not an image or PDF! Please upload only images and PDFs.', 400), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

exports.uploadApplicationFiles = upload.any();

exports.createApplication = catchAsync(async (req, res, next) => {
  console.log(req.user,"here is req.user");
  // Normalize inputs
  const body = req.body || {};
  const requiredDocuments = Array.isArray(body.requiredDocuments) ? body.requiredDocuments : [];
  let applicationType = body.applicationType;
  let relationship = body?.sponsored?.relationship;
  if (typeof relationship === 'string') relationship = relationship.toLowerCase();
  
  // Handle service data from services.json
  const serviceData = body.serviceData || {};
  const serviceName = serviceData.name || '';
  const serviceId = serviceData.id;
  
  // Derive family_visa sub-type if generic provided
  if (applicationType === 'family_visa' && relationship) {
    if (relationship === 'spouse') applicationType = 'family_visa_spouse';
    if (relationship === 'child') applicationType = 'family_visa_child';
  }
  // Fallback: replace dashes with underscores for safety
  if (typeof applicationType === 'string') applicationType = applicationType.replace(/-/g, '_');

  // Create base application data - include sponsor info from logged-in user
  const applicationData = {
    applicationType,
    sponsor: {
      userId: req.user.userId,
      // Include sponsor info from the request body if provided
      ...(body.sponsor && {
        firstName: body.sponsor.firstName || '',
        lastName: body.sponsor.lastName || '',
        email: body.sponsor.email || '',
        phone: body.sponsor.phone || '',
        emiratesId: body.sponsor.emiratesId || ''
      })
    },
    metadata: {
      requiredDocuments,
      govStage: 'draft',
      serviceId: serviceId ? String(serviceId) : undefined,
      serviceName: serviceName || undefined,
      serviceRequirements: serviceData.requirements || []
    },
    history: [
      { action: 'created', by: req.user._id?.toString?.() || 'user', note: `Application created (${applicationType})` }
    ]
  };

  // Only add sponsored data if provided (for family visas)
  if (body.sponsored && Object.keys(body.sponsored).some(key => body.sponsored[key])) {
    applicationData.sponsored = { ...body.sponsored, relationship };
  }

  const application = await VisaApplication.create(applicationData);

  res.status(201).json({
    status: 'success',
    data: {
      application
    }
  });
  try {
    await AuditLog.createEntry({
      action: 'OTHER',
      actor: { type: req.user.role || 'user', id: String(req.user._id) },
      entity: { type: 'visa_application', id: String(application._id), description: 'Create application' },
      diff: { before: null, after: { applicationType: application.applicationType }, changes: [{ field: 'applicationType', old_value: null, new_value: application.applicationType }] },
      request_id: req.headers['x-request-id'] || (Date.now().toString()),
      result: 'success',
      metadata: { requiredDocuments: requiredDocuments }
    });
  } catch (e) {}
});

// exports.uploadDocuments = catchAsync(async (req, res, next) => {
//   const application = await VisaApplication.findById(req.params.applicationId);

//   if (!application) {
//     return next(new AppError('No application found with that ID', 404));
//   }

//   // Check if user is the sponsor
//   if (application.sponsor.userId.toString() !== req.user._id.toString()) {
//     return next(new AppError('You are not authorized to upload documents for this application', 403));
//   }

//   // Process uploaded files
//   const files = req.files;
//   const attachments = [];

//   for (const [fieldName, fileArray] of Object.entries(files)) {
//     for (const file of fileArray) {
//       // Attempt OCR via document-extraction-service
//       let extractedData = undefined;
//       try {
//         const axios = require('axios');
//         const fsSync = require('fs');
//         const FormData = require('form-data');
//         const buf = fsSync.readFileSync(file.path);
//         const form = new FormData();
//         form.append('file', buf, { filename: file.originalname || 'document' });
//         const ocrUrl = (process.env.DOC_OCR_URL || 'http://localhost:8011') + '/extract-text';
//         const ocrRes = await axios.post(ocrUrl, form, { headers: form.getHeaders(), timeout: 10000 });
//         if (ocrRes?.data?.text) {
//           extractedData = { text: String(ocrRes.data.text).slice(0, 2000) };
//         }
//       } catch (e) {
//         // non-blocking
//       }

//       attachments.push({
//         type: fieldName,
//         path: file.path.replace(/^.*[\\\/]/, ''), // Get filename only
//         originalName: file.originalname,
//         fileSize: file.size,
//         mimeType: file.mimetype,
//         uploadedAt: new Date(),
//         status: 'pending',
//         extractedData
//       });
//     }
//   }

//   // Add attachments to application
//   application.attachments.push(...attachments);
//   await application.save();

//   res.status(200).json({
//     status: 'success',
//     data: {
//       attachments
//     }
//   });
// });

function normalizeDocType(fieldName) {
  const map = {
    "Sponsor ID Copy": "sponsor_emirates_id",
    "Applicant Entry Permit": "sponsor_visa", // or "entry_permit" if you add that
    "Applicant Passport Copy": "sponsored_passport_front",
    "Trade Licence + MOA (Memorandum of Association)": "sponsor_trade_license",
    "Establishment Card (Immigration Card) Copy": "sponsor_establishment_card",
    "Sponsored Passport Front": "sponsored_passport_front",
    "Sponsored Passport Back": "sponsored_passport_back",
    "Sponsored Photo": "sponsored_photo",
    "Marriage Certificate": "marriage_certificate",
    "Birth Certificate": "birth_certificate",
    "Medical Certificate": "medical_certificate",
    "Police Clearance": "police_clearance",
    "Other": "other"
  };
  return map[fieldName] || "other"; // fallback to "other"
}
exports.uploadDocuments = catchAsync(async (req, res, next) => {
  const application = await VisaApplication.findById(req.params.applicationId);
  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }
console.log(req.user,"here is req.user");
  // Check if user is the sponsor
  if (application.sponsor.userId.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to upload documents for this application', 403));
  }

  const attachments = [];

  for (const file of req.files) {
    // Use the fieldname dynamically as type
    const fieldName = file.fieldname;

    let extractedData;
    try {
      const axios = require("axios");
      const fsSync = require("fs");
      const FormData = require("form-data");
      const buf = fsSync.readFileSync(file.path);
      const form = new FormData();
      form.append("file", buf, { filename: file.originalname || "document" });
      const ocrUrl = (process.env.DOC_OCR_URL || "http://localhost:8011") + "/extract-text";
      const ocrRes = await axios.post(ocrUrl, form, {
        headers: form.getHeaders(),
        timeout: 10000,
      });
      if (ocrRes?.data?.text) {
        extractedData = { text: String(ocrRes.data.text).slice(0, 2000) };
      }
    } catch (e) {
      // non-blocking
    }

    attachments.push({
      type: normalizeDocType(file.fieldname), // strict enum
      path: file.path.replace(/^.*[\\\/]/, ""),
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date(),
      status: "pending",
      extractedData,
    });
  }

  application.attachments.push(...attachments);
  await application.save();

  res.status(200).json({
    status: "success",
    data: { attachments },
  });
});


exports.getApplication = catchAsync(async (req, res, next) => {
  const application = await VisaApplication.findById(req.params.applicationId)
    .populate('metadata.assignedOfficer', 'name email');

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  // Check if user is authorized to view this application
  if (
    application.sponsor.userId.toString() !== req.user._id.toString() &&
    req.user.role !== 'amer' &&
    req.user.role !== 'admin'
  ) {
    return next(new AppError('You are not authorized to view this application', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      application
    }
  });
});

exports.getApplicationsByUserId = catchAsync(async (req, res, next) => {
  const applications = await VisaApplication.find({ 'sponsor.email': req.params.email });
  if (!applications) {
    return next(new AppError('No applications found with that user ID', 404));
  }
  res.status(200).json({
    status: 'success',
    data: {
      applications
    }
  });
});

exports.getApplicationsByUserObjectId = catchAsync(async (req, res, next) => {
  console.log("here is appls ", req.params.userId);

  // no need to wrap in ObjectId
  const applications = await VisaApplication.find({
    'sponsor.userId': req.params.userId
  });

  const user = await User.findById(req.params.userId);
  if (!applications || !user) {
    return next(new AppError('No applications found with that user ID', 404));
  }

  const userDetails = user.toJSON();

  res.status(200).json({
    status: 'success',
    data: {
      applications: applications.map(application => ({
        ...application.toObject(), // ensure plain object
        sponsor: {
          ...application.sponsor,
          name: `${userDetails.firstName} ${userDetails.lastName}`,
          email: userDetails.email,
          phone: userDetails.phoneNumber, // note: in your schema it's `phoneNumber`, not `phone`
          emiratesId: userDetails.emiratesId
        }
      })),
      user: userDetails,
      message: 'Applications fetched successfully'
    }
  });
});


exports.updateApplicationStatus = catchAsync(async (req, res, next) => {
  // Only Amer officers can update status
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to update application status', 403));
  }

  const application = await VisaApplication.findById(req.params.applicationId);

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  application.status = req.body.status;
  
  if (req.body.status === 'approved' || req.body.status === 'rejected') {
    application.metadata.completedAt = new Date();
  }

  if (req.body.comment) {
    application.metadata.chatHistory.push({
      type: 'amer',
      content: req.body.comment,
      userId: req.user._id
    });
  }

  await application.save();
  try {
    await AuditLog.createEntry({
      action: 'OTHER',
      actor: { type: req.user.role || 'user', id: String(req.user._id) },
      entity: { type: 'visa_application', id: String(application._id), description: 'Update status' },
      diff: { before: { status: application.status }, after: { status: req.body.status }, changes: [{ field: 'status', old_value: application.status, new_value: req.body.status }] },
      request_id: req.headers['x-request-id'] || (Date.now().toString()),
      result: 'success'
    });
  } catch (e) {}

  // Notify sponsor via WebSocket if available
  try {
    const app = require('../../index');
    const wsServer = app.get('wsServer');
    const sponsorId = application.sponsor.userId?.toString?.() || application.sponsor.userId;
    wsServer?.sendToUser(sponsorId, 'notification', {
      type: 'success',
      message: `Your application status is now ${application.status}.`,
      applicationId: application._id.toString(),
      timestamp: new Date()
    });
  } catch (e) {
    // non-blocking
  }

  res.status(200).json({
    status: 'success',
    data: {
      application
    }
  });
});

exports.addComment = catchAsync(async (req, res, next) => {
  const application = await VisaApplication.findById(req.params.applicationId);

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  // Add comment to chat history
  application.metadata.chatHistory.push({
    type: req.user.role === 'amer' ? 'amer' : 'user',
    content: req.body.comment,
    userId: req.user._id
  });

  await application.save();

  res.status(200).json({
    status: 'success',
    data: {
      comment: application.metadata.chatHistory[application.metadata.chatHistory.length - 1]
    }
  });
});

exports.addFraudAlert = catchAsync(async (req, res, next) => {
  // Only Amer officers can add fraud alerts
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to add fraud alerts', 403));
  }

  const application = await VisaApplication.findById(req.params.applicationId);

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  application.fraudAlerts.push({
    type: req.body.type,
    severity: req.body.severity,
    description: req.body.description
  });

  application.status = 'fraud_detected';
  await application.save();

  res.status(200).json({
    status: 'success',
    data: {
      fraudAlert: application.fraudAlerts[application.fraudAlerts.length - 1]
    }
  });
});

exports.issuePenalty = catchAsync(async (req, res, next) => {
  // Only Amer officers can issue penalties
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to issue penalties', 403));
  }

  const application = await VisaApplication.findById(req.params.applicationId);

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  application.penalties.push({
    type: req.body.type,
    amount: req.body.amount,
    description: req.body.description,
    issuedBy: req.user._id
  });

  application.status = 'penalty_issued';
  await application.save();

  res.status(200).json({
    status: 'success',
    data: {
      penalty: application.penalties[application.penalties.length - 1]
    }
  });
});

exports.getMyApplications = catchAsync(async (req, res, next) => {
  const applications = await VisaApplication.find({ 'sponsor.userId': req.user._id })
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: applications.length,
    data: {
      applications
    }
  });
});

exports.getAllApplications = catchAsync(async (req, res, next) => {
  // Only Amer officers can view all applications
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to view all applications', 403));
  }

  const applications = await VisaApplication.find()
    .populate('metadata.assignedOfficer', 'name email')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: applications.length,
    data: {
      applications
    }
  });
});

// Update core application details (Amer/Admin only)
exports.updateApplicationDetails = catchAsync(async (req, res, next) => {
  // Only Amer officers can update application details
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to update application details', 403));
  }

  const applicationId = req.params.applicationId;
  const body = req.body || {};

  const application = await VisaApplication.findById(applicationId);
  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  // Build a safe update payload (whitelist)
  const updates = {};

  if (body.sponsor && typeof body.sponsor === 'object') {
    const s = body.sponsor;
    if (s.firstName !== undefined) updates['sponsor.firstName'] = s.firstName;
    if (s.lastName !== undefined) updates['sponsor.lastName'] = s.lastName;
    if (s.email !== undefined) updates['sponsor.email'] = s.email;
    if (s.phone !== undefined) updates['sponsor.phone'] = s.phone;
    if (s.emiratesId !== undefined) updates['sponsor.emiratesId'] = s.emiratesId;
    if (s.passportNumber !== undefined) updates['sponsor.passportNumber'] = s.passportNumber;
  }

  if (body.sponsored && typeof body.sponsored === 'object') {
    const sp = body.sponsored;
    if (sp.firstName !== undefined) updates['sponsored.firstName'] = sp.firstName;
    if (sp.lastName !== undefined) updates['sponsored.lastName'] = sp.lastName;
    if (sp.dateOfBirth !== undefined) updates['sponsored.dateOfBirth'] = sp.dateOfBirth;
    if (sp.nationality !== undefined) updates['sponsored.nationality'] = sp.nationality;
    if (sp.passportNumber !== undefined) updates['sponsored.passportNumber'] = sp.passportNumber;
    if (sp.relationship !== undefined) updates['sponsored.relationship'] = sp.relationship;
    if (sp.occupation !== undefined) updates['sponsored.occupation'] = sp.occupation;
    if (sp.income !== undefined) updates['sponsored.income'] = sp.income;
  }

  if (body.metadata && typeof body.metadata === 'object') {
    const m = body.metadata;
    if (m.govStage !== undefined) updates['metadata.govStage'] = m.govStage;
    if (Array.isArray(m.requiredDocuments)) updates['metadata.requiredDocuments'] = m.requiredDocuments;
  }

  // Optionally allow applicationType change if provided (rare)
  if (typeof body.applicationType === 'string' && body.applicationType) {
    updates['applicationType'] = body.applicationType.replace(/-/g, '_');
  }

  // Perform update
  if (Object.keys(updates).length > 0) {
    await VisaApplication.updateOne({ _id: applicationId }, { $set: updates });
  }

  const updated = await VisaApplication.findById(applicationId);

  // Audit (non-blocking)
  try {
    await AuditLog.createEntry({
      action: 'OTHER',
      actor: { type: req.user.role || 'user', id: String(req.user._id) },
      entity: { type: 'visa_application', id: String(applicationId), description: 'Update application details' },
      diff: { before: null, after: updates, changes: Object.keys(updates).map(k => ({ field: k })) },
      request_id: req.headers['x-request-id'] || (Date.now().toString()),
      result: 'success'
    });
  } catch {}

  res.status(200).json({ status: 'success', data: { application: updated } });
});

exports.getStats = catchAsync(async (req, res, next) => {
  const [byStatus, byStage, byFraud, weekly] = await Promise.all([
    VisaApplication.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    VisaApplication.aggregate([{ $group: { _id: '$metadata.govStage', count: { $sum: 1 } } }]),
    VisaApplication.aggregate([{ $unwind: { path: '$fraudAlerts', preserveNullAndEmptyArrays: true } }, { $group: { _id: '$fraudAlerts.severity', count: { $sum: 1 } } }]),
    VisaApplication.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 1000*60*60*24*90) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ])
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats: { byStatus, byStage, byFraud, weekly } }
  });
});

// Amer officers can request additional documents: set status and append a chat entry
exports.requestDocuments = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to request documents', 403));
  }

  const { requested = [], note } = req.body || {};
  const application = await VisaApplication.findById(req.params.applicationId);
  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  application.status = 'docs_required';

  const content = `[Doc Request] ${Array.isArray(requested) ? requested.join(', ') : String(requested)}${note ? ' — ' + note : ''}`;
  application.metadata.chatHistory.push({
    type: 'amer',
    content,
    userId: req.user._id
  });
  application.history.push({
    action: 'docs_required',
    by: req.user.role,
    note: content,
    at: new Date()
  });
  await application.save();
  try {
    await AuditLog.createEntry({
      action: 'OTHER',
      actor: { type: req.user.role || 'user', id: String(req.user._id) },
      entity: { type: 'visa_application', id: String(application._id), description: 'Request documents' },
      diff: { before: null, after: { status: 'docs_required', requested }, changes: [{ field: 'status', old_value: application.status, new_value: 'docs_required' }] },
      request_id: req.headers['x-request-id'] || (Date.now().toString()),
      result: 'success'
    });
  } catch (e) {}

  try {
    const app = require('../../index');
    const wsServer = app.get('wsServer');
    const sponsorId = application.sponsor.userId?.toString?.() || application.sponsor.userId;
    wsServer?.sendToUser(sponsorId, 'notification', {
      type: 'warning',
      message: 'Additional documents requested for your application.',
      applicationId: application._id.toString(),
      timestamp: new Date(),
      requested
    });
    // Persist notification
    await Notification.create({
      userId: sponsorId,
      applicationId: application._id,
      type: 'docs_required',
      title: 'Documents Required',
      message: note ? `${note}` : 'Additional documents requested for your application.',
      metadata: { requested }
    });
  } catch (e) {
    // non-blocking
  }

  res.status(200).json({
    status: 'success',
    data: { application }
  });
});

// Endpoint to approve/reject individual attachment and update status if needed
exports.reviewAttachment = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to review attachments', 403));
  }
  const { applicationId, attachmentId } = req.params;
  const { status = 'approved', comment, rejectionReason } = req.body || {};
  const application = await VisaApplication.findById(applicationId);
  if (!application) return next(new AppError('Application not found', 404));
  const attachment = application.attachments.id(attachmentId) || application.attachments.find(a => String(a._id) === String(attachmentId));
  if (!attachment) return next(new AppError('Attachment not found', 404));
  
  const oldStatus = attachment.status;
  attachment.status = status;
  
  if (status === 'approved') {
    attachment.approvedAt = new Date();
    attachment.approvedBy = req.user._id;
    attachment.rejectionReason = undefined;
    attachment.rejectedAt = undefined;
    attachment.rejectedBy = undefined;
  } else if (status === 'rejected') {
    attachment.rejectedAt = new Date();
    attachment.rejectedBy = req.user._id;
    attachment.rejectionReason = rejectionReason || comment;
    attachment.approvedAt = undefined;
    attachment.approvedBy = undefined;
    
    // Also mark as requested for re-upload
    attachment.isRequested = true;
    attachment.requestedAt = new Date();
    attachment.requestedBy = req.user._id;
  }
  
  if (comment) {
    attachment.comments = attachment.comments || [];
    attachment.comments.push({ userId: req.user._id, comment, timestamp: new Date() });
  }
  
  await application.save();

  // Send notification to user if document was rejected
  if (status === 'rejected') {
    try {
      await Notification.create({
        userId: application.sponsor.userId,
        applicationId: application._id,
        type: 'document_rejected',
        title: 'Document Rejected',
        message: `Your ${attachment.type.replace('_', ' ')} document was rejected. Please re-upload: ${rejectionReason || 'Document does not meet requirements'}`,
        metadata: { 
          attachmentId: attachment._id,
          documentType: attachment.type,
          rejectionReason: rejectionReason || comment 
        }
      });

      // WebSocket notification
      const app = require('../../index');
      const wsServer = app.get('wsServer');
      const sponsorId = application.sponsor.userId?.toString?.() || application.sponsor.userId;
      wsServer?.sendToUser(sponsorId, 'notification', {
        type: 'warning',
        message: `Document rejected: ${attachment.type.replace('_', ' ')}`,
        applicationId: application._id.toString(),
        timestamp: new Date(),
        metadata: { 
          attachmentId: attachment._id,
          documentType: attachment.type,
          rejectionReason: rejectionReason || comment 
        }
      });
    } catch (e) {
      // non-blocking
    }
  }
  
  try {
    await AuditLog.createEntry({
      action: 'OTHER',
      actor: { type: req.user.role || 'user', id: String(req.user._id) },
      entity: { type: 'visa_application', id: String(application._id), description: `Review attachment ${attachmentId}` },
      diff: { before: { status: oldStatus }, after: { status }, changes: [{ field: 'attachment.status', old_value: oldStatus, new_value: status }] },
      request_id: req.headers['x-request-id'] || (Date.now().toString()),
      result: 'success'
    });
  } catch (e) {}
  res.json({ status: 'success', data: { attachment } });
});

// Update high-level status to government stage
exports.setGovStage = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to update stage', 403));
  }
  const application = await VisaApplication.findById(req.params.applicationId);
  if (!application) return next(new AppError('Application not found', 404));
  const { stage } = req.body || {};
  application.metadata.govStage = stage; // e.g., 'mohre_pending', 'gdrfa_pending', 'icp_pending'
  await application.save();
  try {
    const app = require('../../index');
    const wsServer = app.get('wsServer');
    const sponsorId = application.sponsor.userId?.toString?.() || application.sponsor.userId;
    wsServer?.sendToUser(sponsorId, 'notification', { type: 'info', message: `Status updated: ${stage}`, applicationId: application._id.toString(), timestamp: new Date() });
    await Notification.create({ userId: sponsorId, applicationId: application._id, type: 'status_update', title: 'Status Update', message: `Your application stage changed to ${stage}` });
  } catch {}
  res.json({ status: 'success', data: { application } });
});

exports.downloadResultDocument = catchAsync(async (req, res, next) => {
  const { applicationId, attachmentId } = req.params;
  const application = await VisaApplication.findById(applicationId);
  if (!application) {
    return next(new AppError('Application not found', 404));
  }
  const attachment = application.resultDocuments.id(attachmentId) || application.resultDocuments.find(a => String(a._id) === String(attachmentId));
  if (!attachment) {
    return next(new AppError('Attachment not found', 404));
  }
  const filePath = path.join(__dirname, '../../uploads/applications', applicationId, attachment.path);
  await fs.access(filePath);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', attachment.fileSize);
  const fileStream = require('fs').createReadStream(filePath);
  fileStream.pipe(res);
  fileStream.on('error', (error) => {
    console.error('File stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: 'Error streaming file' });
    }
  });
});

exports.downloadAnyDocument = catchAsync(async (req, res, next) => {
  const { attachmentId } = req.params;
  
  const filePath = path.join(__dirname, '../../uploads/applications', attachmentId);
  try {
    await fs.access(filePath);
  } catch (error) {
    return next(new AppError('File not found on server', 404));
  }
  res.setHeader('Content-Disposition', `attachment; filename="document.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', 1000);
  res.sendFile(filePath);
});
// Download document attachment
exports.downloadAttachment = catchAsync(async (req, res, next) => {
  const { applicationId, attachmentId } = req.params;
  
  const application = await VisaApplication.findById(applicationId);
  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  // Check if user is authorized to download this document
  if (
    application.sponsor.userId.toString() !== req.user._id.toString() &&
    req.user.role !== 'amer' &&
    req.user.role !== 'admin'
  ) {
    return next(new AppError('You are not authorized to download this document', 403));
  }
  
  const attachment = application.attachments.id(attachmentId)
  || application.attachments.find(a => String(a._id) === String(attachmentId))
  || application.resultDocuments.id(attachmentId)
  || application.resultDocuments.find(a => String(a._id) === String(attachmentId))
  
  if (!attachment) {
    return next(new AppError('Attachment not found', 404));
  }

  const filePath = path.join(__dirname, '../../uploads/applications', applicationId, attachment.path);
  
  // Check if file exists
  try {
    await fs.access(filePath);
  } catch (error) {
    return next(new AppError('File not found on server', 404));
  }

  // Set appropriate headers
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', attachment.fileSize);

  // Stream the file
  const fileStream = require('fs').createReadStream(filePath);
  fileStream.pipe(res);
  
  fileStream.on('error', (error) => {
    console.error('File stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: 'Error streaming file' });
    }
  });
});

// Upload result documents (ICP receipts, transaction papers, etc.)
exports.uploadResultDocuments = catchAsync(async (req, res, next) => {
  // Only Amer officers can upload result documents
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to upload result documents', 403));
  }

  const application = await VisaApplication.findById(req.params.applicationId);
  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  const resultDocuments = [];

  for (const file of req.files) {
    const { documentName, documentType } = req.body;

    let extractedData;
    try {
      const axios = require("axios");
      const fsSync = require("fs");
      const FormData = require("form-data");
      const buf = fsSync.readFileSync(file.path);
      const form = new FormData();
      form.append("file", buf, { filename: file.originalname || "document" });
      const ocrUrl = (process.env.DOC_OCR_URL || "http://localhost:8011") + "/extract-text";
      const ocrRes = await axios.post(ocrUrl, form, {
        headers: form.getHeaders(),
        timeout: 10000,
      });
      if (ocrRes?.data?.text) {
        extractedData = { text: String(ocrRes.data.text).slice(0, 2000) };
      }
    } catch (e) {
      // non-blocking
    }

    resultDocuments.push({
      type: documentType || 'other_result',
      label: documentName || file.originalname,
      path: file.path.replace(/^.*[\\\/]/, ""),
      originalName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadedAt: new Date(),
      uploadedBy: req.user._id,
      extractedData
    });
  }

  // Initialize resultDocuments array if it doesn't exist
  if (!application.resultDocuments) {
    application.resultDocuments = [];
  }

  application.resultDocuments.push(...resultDocuments);
  
  // Add to history
  application.history.push({
    action: 'result_documents_uploaded',
    by: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email,
    note: `Uploaded ${resultDocuments.length} result document(s)`,
    at: new Date()
  });

  await application.save();

  // Notify sponsor
  try {
    await Notification.create({
      userId: application.sponsor.userId,
      applicationId: application._id,
      type: 'result_available',
      title: 'Application Results Available',
      message: `${resultDocuments.length} result document(s) have been uploaded for your application.`,
      metadata: { 
        documentCount: resultDocuments.length,
        documents: resultDocuments.map(a => ({ name: a.label, type: a.type }))
      }
    });

    // WebSocket notification
    const app = require('../../index');
    const wsServer = app.get('wsServer');
    const sponsorId = application.sponsor.userId?.toString?.() || application.sponsor.userId;
    wsServer?.sendToUser(sponsorId, 'notification', {
      type: 'success',
      message: `Application results are now available!`,
      applicationId: application._id.toString(),
      timestamp: new Date()
    });
  } catch (e) {
    // non-blocking
  }

  res.status(200).json({
    status: "success",
    data: { resultDocuments },
    message: 'Result documents uploaded successfully'
  });
});

// Request OTP for verification
exports.requestOTP = catchAsync(async (req, res, next) => {
  // Only Amer officers can request OTP
  if (req.user.role !== 'amer' && req.user.role !== 'admin') {
    return next(new AppError('You are not authorized to request OTP', 403));
  }

  const { phone, minutes = 5 } = req.body;
  const applicationId = req.params.applicationId;
  
  const application = await VisaApplication.findById(applicationId);
  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  // Generate OTP (in production, use a proper OTP service)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  // Store OTP in application metadata
  application.metadata.otp = {
    code: otp,
    phone: phone,
    expiresAt: expiresAt,
    requestedBy: req.user._id,
    requestedAt: new Date()
  };

  await application.save();

  // In production, send SMS here
  console.log(`OTP for ${phone}: ${otp} (expires in ${minutes} minutes)`);

  // Add to chat history
  application.metadata.chatHistory.push({
    type: 'amer',
    content: `OTP sent to ${phone}. Code: ${otp} (expires in ${minutes} minutes)`,
    userId: req.user._id
  });

  await application.save();

  res.status(200).json({
    status: 'success',
    data: {
      message: 'OTP sent successfully',
      phone: phone,
      expiresIn: minutes
    }
  });
});