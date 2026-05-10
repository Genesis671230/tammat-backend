const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const VisaCheck = require('../../model/schema/visaCheck');
const catchAsync = require('../../utills/catchAsync');
const AppError = require('../../utills/appError');

// ---------------------------------------------------------------------------
// Multer helpers
// ---------------------------------------------------------------------------

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new AppError('Only images and PDF files are allowed.', 400), false);
  }
};

// Temp storage used on creation (checkId not yet known)
const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(__dirname, '../../uploads/checks/temp');
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch(err => cb(err));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Dynamic storage used for /:checkId routes
const checkStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const checkId = req.params.checkId;
    const dir = path.join(__dirname, '../../uploads/checks', checkId);
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch(err => cb(err));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Result documents storage
const resultStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const checkId = req.params.checkId;
    const dir = path.join(__dirname, '../../uploads/checks', checkId, 'results');
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch(err => cb(err));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'result-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadTemp = multer({
  storage: tempStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadToCheck = multer({
  storage: checkStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadResult = multer({
  storage: resultStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ---------------------------------------------------------------------------
// Exported multer middleware (used in routes)
// ---------------------------------------------------------------------------

/**
 * Multer middleware for initial check creation — stores files in temp dir.
 * Field name: "documents", up to 10 files.
 */
exports.uploadCheckFiles = uploadTemp.array('documents', 10);

// ---------------------------------------------------------------------------
// Helper: move a file from temp to a permanent check-specific directory
// ---------------------------------------------------------------------------
async function moveFilesToCheckDir(files, checkId) {
  const destDir = path.join(__dirname, '../../uploads/checks', checkId);
  await fs.mkdir(destDir, { recursive: true });

  const moved = [];
  for (const file of files) {
    const newFilename = path.basename(file.path);
    const newPath = path.join(destDir, newFilename);
    await fs.rename(file.path, newPath);
    moved.push({ ...file, path: newPath });
  }
  return moved;
}

// ---------------------------------------------------------------------------
// 1. createCheck
// ---------------------------------------------------------------------------
exports.createCheck = catchAsync(async (req, res, next) => {
  const { serviceId, serviceType, speedTier, guestEmail } = req.body;

  if (!serviceId) {
    return next(new AppError('serviceId is required.', 400));
  }
  if (!serviceType) {
    return next(new AppError('serviceType is required.', 400));
  }

  // Parse identifiers — can arrive as a JSON string or a plain object
  let identifiers = {};
  if (req.body.identifiers) {
    if (typeof req.body.identifiers === 'string') {
      try {
        identifiers = JSON.parse(req.body.identifiers);
      } catch {
        return next(new AppError('identifiers must be valid JSON.', 400));
      }
    } else {
      identifiers = req.body.identifiers;
    }
  }

  const isFree = VisaCheck.isFreeService(serviceId);

  let amount = 0;
  let status = 'submitted';

  if (!isFree) {
    amount = speedTier === 'fast-track' ? 50 : 20;
    status = 'pending_payment';
  }

  const checkData = {
    serviceId,
    serviceType,
    identifiers,
    speedTier: speedTier || 'standard',
    isFreeService: isFree,
    amount,
    status,
    userId: req.user ? req.user._id : null,
    guestEmail: guestEmail || undefined,
    history: []
  };

  const check = await VisaCheck.create(checkData);

  // Move any temp-uploaded files into the check's permanent directory
  if (req.files && req.files.length > 0) {
    const movedFiles = await moveFilesToCheckDir(req.files, check._id.toString());

    const attachments = movedFiles.map(f => ({
      originalName: f.originalname,
      filename: path.basename(f.path),
      path: f.path,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: new Date(),
      uploadedBy: req.user ? req.user._id : undefined
    }));

    check.attachments.push(...attachments);
  }

  check.history.push({
    action: 'created',
    note: `Check created for service: ${serviceId}`,
    performedBy: req.user ? req.user._id : undefined,
    performedByRole: req.user ? req.user.role : 'guest',
    at: new Date()
  });

  await check.save();

  res.status(201).json({
    status: 'success',
    data: { check }
  });
});

// ---------------------------------------------------------------------------
// 2. getUserChecks — GET /  (auth required)
// ---------------------------------------------------------------------------
exports.getUserChecks = catchAsync(async (req, res, next) => {
  const checks = await VisaCheck.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .select('-officerComments -requestedDocuments -history');

  res.status(200).json({
    status: 'success',
    results: checks.length,
    data: { checks }
  });
});

// ---------------------------------------------------------------------------
// 3. getCheckById — GET /:checkId  (optionalAuth)
// ---------------------------------------------------------------------------
exports.getCheckById = catchAsync(async (req, res, next) => {
  const check = await VisaCheck.findById(req.params.checkId)
    .populate('officerAssignedId', 'firstName lastName email role')
    .populate('officerComments.authorId', 'firstName lastName role');

  if (!check) {
    return next(new AppError('No check found with that ID.', 404));
  }

  // Authorization: owner, amer, or admin
  const isOfficer = req.user && (req.user.role === 'amer' || req.user.role === 'admin');
  const isOwner = req.user && check.userId && check.userId.toString() === req.user._id.toString();
  const isGuest = !req.user;

  if (!isOfficer && !isOwner && !isGuest) {
    return next(new AppError('You are not authorized to view this check.', 403));
  }

  // Guests can view their own check only via guestEmail match (optional extra security)
  // For now we allow any guest to read by ID (as designed — token-less user tracks via URL)

  res.status(200).json({
    status: 'success',
    data: { check }
  });
});

// ---------------------------------------------------------------------------
// 4. uploadCheckDocuments — POST /:checkId/documents  (optionalAuth)
// ---------------------------------------------------------------------------
exports.uploadCheckDocuments = [
  uploadToCheck.array('documents', 10),
  catchAsync(async (req, res, next) => {
    const check = await VisaCheck.findById(req.params.checkId);
    if (!check) {
      return next(new AppError('No check found with that ID.', 404));
    }

    if (!req.files || req.files.length === 0) {
      return next(new AppError('No files uploaded.', 400));
    }

    const newAttachments = req.files.map(f => ({
      originalName: f.originalname,
      filename: f.filename,
      path: f.path,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: new Date(),
      uploadedBy: req.user ? req.user._id : undefined
    }));

    check.attachments.push(...newAttachments);

    check.history.push({
      action: 'documents_uploaded',
      note: `${req.files.length} document(s) uploaded.`,
      performedBy: req.user ? req.user._id : undefined,
      performedByRole: req.user ? req.user.role : 'guest',
      at: new Date()
    });

    // If the check was in requires_documents, move it back to submitted
    if (check.status === 'requires_documents') {
      check.status = 'submitted';
      check.history.push({
        action: 'resubmitted',
        note: 'Requested documents uploaded; check resubmitted.',
        performedBy: req.user ? req.user._id : undefined,
        performedByRole: req.user ? req.user.role : 'guest',
        at: new Date()
      });
    }

    await check.save();

    res.status(200).json({
      status: 'success',
      data: { attachments: newAttachments }
    });
  })
];

// ---------------------------------------------------------------------------
// 5. updateCheckStatus — PUT /:checkId/status  (amer/admin)
// ---------------------------------------------------------------------------
exports.updateCheckStatus = catchAsync(async (req, res, next) => {
  const { status, note } = req.body;

  const validStatuses = [
    'pending_payment',
    'submitted',
    'processing',
    'reviewing',
    'completed',
    'cancelled',
    'requires_documents'
  ];

  if (!status || !validStatuses.includes(status)) {
    return next(new AppError(`status must be one of: ${validStatuses.join(', ')}.`, 400));
  }

  const check = await VisaCheck.findById(req.params.checkId);
  if (!check) {
    return next(new AppError('No check found with that ID.', 404));
  }

  const previousStatus = check.status;
  check.status = status;

  check.history.push({
    action: 'status_updated',
    note: note || `Status changed from ${previousStatus} to ${status}.`,
    performedBy: req.user._id,
    performedByRole: req.user.role,
    at: new Date()
  });

  await check.save();

  res.status(200).json({
    status: 'success',
    data: { check }
  });
});

// ---------------------------------------------------------------------------
// 6. addComment — POST /:checkId/comment  (auth required)
// ---------------------------------------------------------------------------
exports.addComment = catchAsync(async (req, res, next) => {
  const { text } = req.body;

  if (!text || !text.trim()) {
    return next(new AppError('Comment text is required.', 400));
  }

  const check = await VisaCheck.findById(req.params.checkId);
  if (!check) {
    return next(new AppError('No check found with that ID.', 404));
  }

  const comment = {
    text: text.trim(),
    authorId: req.user._id,
    authorRole: req.user.role,
    createdAt: new Date()
  };

  check.officerComments.push(comment);
  await check.save();

  res.status(201).json({
    status: 'success',
    data: {
      comment: check.officerComments[check.officerComments.length - 1]
    }
  });
});

// ---------------------------------------------------------------------------
// 7. requestDocuments — POST /:checkId/request-docs  (amer/admin)
// ---------------------------------------------------------------------------
exports.requestDocuments = catchAsync(async (req, res, next) => {
  const { documents } = req.body;

  if (!Array.isArray(documents) || documents.length === 0) {
    return next(new AppError('documents must be a non-empty array of { label, description } objects.', 400));
  }

  const check = await VisaCheck.findById(req.params.checkId);
  if (!check) {
    return next(new AppError('No check found with that ID.', 404));
  }

  const newRequests = documents.map(doc => ({
    label: doc.label,
    description: doc.description || '',
    requestedAt: new Date(),
    requestedBy: req.user._id,
    fulfilledAt: undefined
  }));

  check.requestedDocuments.push(...newRequests);
  check.status = 'requires_documents';

  check.history.push({
    action: 'documents_requested',
    note: `Requested ${newRequests.length} document(s): ${newRequests.map(d => d.label).join(', ')}.`,
    performedBy: req.user._id,
    performedByRole: req.user.role,
    at: new Date()
  });

  await check.save();

  res.status(200).json({
    status: 'success',
    data: { check, requestedDocuments: newRequests }
  });
});

// ---------------------------------------------------------------------------
// 8. uploadCheckResult — POST /:checkId/result  (amer/admin)
// ---------------------------------------------------------------------------
exports.uploadCheckResult = [
  uploadResult.array('resultFiles', 5),
  catchAsync(async (req, res, next) => {
    const { resultSummary, resultStatus } = req.body;

    const validResultStatuses = ['clear', 'flagged', 'pending'];
    if (!resultStatus || !validResultStatuses.includes(resultStatus)) {
      return next(new AppError(`resultStatus must be one of: ${validResultStatuses.join(', ')}.`, 400));
    }

    const check = await VisaCheck.findById(req.params.checkId);
    if (!check) {
      return next(new AppError('No check found with that ID.', 404));
    }

    // Attach result documents
    if (req.files && req.files.length > 0) {
      const resultDocs = req.files.map(f => ({
        label: f.originalname,
        filename: f.filename,
        path: f.path,
        description: resultSummary || '',
        uploadedAt: new Date(),
        uploadedByRole: req.user.role
      }));
      check.resultDocuments.push(...resultDocs);
    }

    check.resultSummary = resultSummary || '';
    check.resultStatus = resultStatus;
    check.status = 'completed';

    check.history.push({
      action: 'result_uploaded',
      note: `Result uploaded. Status: ${resultStatus}. ${resultSummary || ''}`.trim(),
      performedBy: req.user._id,
      performedByRole: req.user.role,
      at: new Date()
    });

    await check.save();

    res.status(200).json({
      status: 'success',
      data: { check }
    });
  })
];

// ---------------------------------------------------------------------------
// 9. getOfficerChecks — GET /officer/all  (amer/admin)
// ---------------------------------------------------------------------------
exports.getOfficerChecks = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (status) {
    const validStatuses = [
      'pending_payment',
      'submitted',
      'processing',
      'reviewing',
      'completed',
      'cancelled',
      'requires_documents'
    ];
    if (!validStatuses.includes(status)) {
      return next(new AppError(`Invalid status filter. Must be one of: ${validStatuses.join(', ')}.`, 400));
    }
    filter.status = status;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [checks, total] = await Promise.all([
    VisaCheck.find(filter)
      .populate('userId', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    VisaCheck.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    results: checks.length,
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    data: { checks }
  });
});
