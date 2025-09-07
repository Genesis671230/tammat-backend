const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const VisaApplication = require('../../model/schema/visaApplication');
const Notification = require('../../model/schema/notification');
const AuditLog = require('../../model/schema/auditLog');
const catchAsync = require('../../utills/catchAsync');
const AppError = require('../../utills/appError');

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

exports.uploadApplicationFiles = upload.fields([
  { name: 'sponsor_visa', maxCount: 1 },
  { name: 'sponsor_emirates_id', maxCount: 1 },
  { name: 'sponsor_passport', maxCount: 1 },
  { name: 'sponsor_salary_certificate', maxCount: 1 },
  { name: 'sponsor_trade_license', maxCount: 1 },
  { name: 'sponsor_establishment_card', maxCount: 1 },
  { name: 'sponsored_passport_front', maxCount: 1 },
  { name: 'sponsored_passport_back', maxCount: 1 },
  { name: 'sponsored_photo', maxCount: 1 },
  { name: 'marriage_certificate', maxCount: 1 },
  { name: 'birth_certificate', maxCount: 1 },
  { name: 'other', maxCount: 5 }
]);

exports.createApplication = catchAsync(async (req, res, next) => {
  // Normalize inputs
  const body = req.body || {};
  const requiredDocuments = Array.isArray(body.requiredDocuments) ? body.requiredDocuments : [];
  let applicationType = body.applicationType;
  let relationship = body?.sponsored?.relationship;
  if (typeof relationship === 'string') relationship = relationship.toLowerCase();
  // Derive family_visa sub-type if generic provided
  if (applicationType === 'family_visa' && relationship) {
    if (relationship === 'spouse') applicationType = 'family_visa_spouse';
    if (relationship === 'child') applicationType = 'family_visa_child';
  }
  // Fallback: replace dashes with underscores for safety
  if (typeof applicationType === 'string') applicationType = applicationType.replace(/-/g, '_');

  const application = await VisaApplication.create({
    applicationType,
    sponsor: {
      userId: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      phone: body?.sponsor?.phone || req.user.phoneNumber,
      emiratesId: body?.sponsor?.emiratesId
    },
    sponsored: body.sponsored ? { ...body.sponsored, relationship } : undefined,
    metadata: {
      requiredDocuments,
      govStage: 'draft'
    },
    history: [
      { action: 'created', by: req.user._id?.toString?.() || 'user', note: `Application created (${applicationType})` }
    ]
  });

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

exports.uploadDocuments = catchAsync(async (req, res, next) => {
  const application = await VisaApplication.findById(req.params.applicationId);

  if (!application) {
    return next(new AppError('No application found with that ID', 404));
  }

  // Check if user is the sponsor
  if (application.sponsor.userId.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to upload documents for this application', 403));
  }

  // Process uploaded files
  const files = req.files;
  const attachments = [];

  for (const [fieldName, fileArray] of Object.entries(files)) {
    for (const file of fileArray) {
      // Attempt OCR via document-extraction-service
      let extractedData = undefined;
      try {
        const axios = require('axios');
        const fsSync = require('fs');
        const FormData = require('form-data');
        const buf = fsSync.readFileSync(file.path);
        const form = new FormData();
        form.append('file', buf, { filename: file.originalname || 'document' });
        const ocrUrl = (process.env.DOC_OCR_URL || 'http://localhost:8011') + '/extract-text';
        const ocrRes = await axios.post(ocrUrl, form, { headers: form.getHeaders(), timeout: 10000 });
        if (ocrRes?.data?.text) {
          extractedData = { text: String(ocrRes.data.text).slice(0, 2000) };
        }
      } catch (e) {
        // non-blocking
      }

      attachments.push({
        type: fieldName,
        path: file.path.replace(/^.*[\\\/]/, ''), // Get filename only
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
        status: 'pending',
        extractedData
      });
    }
  }

  // Add attachments to application
  application.attachments.push(...attachments);
  await application.save();

  res.status(200).json({
    status: 'success',
    data: {
      attachments
    }
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