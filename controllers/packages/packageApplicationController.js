const path = require('path');
const fs = require('fs');
const PackageApplication = require('../../model/schema/PackageApplication');
const User = require('../../model/schema/user');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const isStaff = (req) => req.user?.role === 'admin' || req.user?.role === 'amer';
const actorName = (req) =>
  [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ') || req.user?.email || 'Officer';

/* ----------------------------- CREATE (lead) ----------------------------- */
exports.createPackageApplication = wrap(async (req, res) => {
  const { packageSlug, packageName, serviceId, totalServiceCount, applicantType, contact, pricing, documents } = req.body || {};

  if (!packageSlug || !packageName)
    return res.status(400).json({ status: 'fail', message: 'packageSlug and packageName are required' });
  if (!contact || !contact.fullName || !contact.phone)
    return res.status(400).json({ status: 'fail', message: 'contact.fullName and contact.phone are required' });
  if (!pricing || typeof pricing.baseAmount !== 'number')
    return res.status(400).json({ status: 'fail', message: 'pricing.baseAmount is required' });

  const application = await PackageApplication.create({
    userId: req.user?._id || req.user?.userId || undefined,
    packageSlug, packageName, serviceId, totalServiceCount,
    applicantType: applicantType || 'outside',
    contact: {
      fullName: contact.fullName, email: contact.email, phone: contact.phone,
      nationality: contact.nationality, preferredLanguage: contact.preferredLanguage || 'en',
    },
    pricing: {
      baseAmount: pricing.baseAmount,
      currency: pricing.currency || 'AED',
      priceType: pricing.priceType || 'Start From',
    },
    documents: Array.isArray(documents) ? documents : [],
    status: 'submitted',
    history: [{ action: 'submitted', by: 'customer', note: `Lead submitted for ${packageName}` }],
  });

  try {
    const app = require('../../index');
    const wsServer = app.get && app.get('wsServer');
    wsServer?.broadcast?.('admin', 'package_lead', {
      referenceId: application.referenceId, packageName: application.packageName, phone: application.contact.phone,
    });
  } catch (_) {}

  // return both _id and id so the client can't pick the wrong one
  res.status(201).json({
    status: 'success',
    data: { application, applicationId: String(application._id) },
    message: 'Application submitted. Our team will contact you shortly.',
  });
});

/* --------------------------- UPLOAD DOCUMENTS ---------------------------- */
exports.uploadPackageDocuments = wrap(async (req, res) => {
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });

  const incoming = [];

  // Path A: multer files written to disk
  if (Array.isArray(req.files) && req.files.length) {
    for (const file of req.files) {
      // store a web path the frontend can open: /uploads/packages/<id>/<filename>
      const rel = `/uploads/packages/${application._id}/${path.basename(file.path)}`;
      incoming.push({
        docKey: file.fieldname || 'other',
        label: req.body[`label_${file.fieldname}`] || file.fieldname,
        url: file.location || rel, // file.location set if using S3/R2 storage engine
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }
  }

  // Path B: client uploaded to R2 itself and posts metadata as JSON
  let bodyDocs = req.body.documents;
  if (typeof bodyDocs === 'string') { try { bodyDocs = JSON.parse(bodyDocs); } catch { bodyDocs = null; } }
  if (Array.isArray(bodyDocs)) {
    for (const d of bodyDocs) {
      if (d && d.url && d.docKey && d.label) {
        incoming.push({
          docKey: d.docKey, label: d.label, url: d.url,
          originalName: d.originalName, fileSize: d.fileSize, mimeType: d.mimeType,
          status: 'pending', uploadedAt: new Date(),
        });
      }
    }
  }

  if (!incoming.length)
    return res.status(400).json({ status: 'fail', message: 'No documents received' });

  application.documents.push(...incoming);

  // mark any matching requested-docs as fulfilled
  const keys = new Set(incoming.map((d) => d.docKey));
  application.requestedDocuments.forEach((rd) => {
    if (rd.status === 'pending' && keys.has(rd.docKey)) { rd.status = 'fulfilled'; rd.fulfilledAt = new Date(); }
  });

  application.history.push({ action: 'documents_uploaded', by: 'customer', note: `${incoming.length} document(s) uploaded` });
  await application.save();

  res.status(200).json({ status: 'success', data: { documents: incoming, application } });
});

/* ------------------------------- READS ---------------------------------- */
exports.getPackageApplication = wrap(async (req, res) => {
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });
  res.status(200).json({ status: 'success', data: { application } });
});

exports.getMyPackageApplications = wrap(async (req, res) => {
  const userId = req.user?._id || req.user?.userId;
  const applications = await PackageApplication.find({ userId }).sort('-createdAt');
  res.status(200).json({ status: 'success', results: applications.length, data: { applications } });
});

exports.listPackageApplications = wrap(async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ status: 'fail', message: 'Not authorized' });
  const { status, q } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (q) {
    filter.$or = [
      { 'contact.fullName': new RegExp(q, 'i') },
      { 'contact.phone': new RegExp(q, 'i') },
      { referenceId: new RegExp(q, 'i') },
    ];
  }
  const applications = await PackageApplication.find(filter).sort('-createdAt');
  res.status(200).json({ status: 'success', results: applications.length, data: { applications } });
});

/* ---------------------------- STATUS UPDATE ----------------------------- */
exports.updatePackageStatus = wrap(async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ status: 'fail', message: 'Not authorized' });
  const { status, note } = req.body || {};
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });

  application.status = status;
  application.history.push({ action: status, by: req.user.role, note: note || `Status -> ${status}` });
  await application.save();
  notifyCustomer(application, `Your ${application.packageName} application is now ${status.replace(/_/g, ' ')}.`);
  res.status(200).json({ status: 'success', data: { application } });
});

/* --------------------------- REQUEST DOCUMENTS -------------------------- */
exports.requestPackageDocuments = wrap(async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ status: 'fail', message: 'Not authorized' });
  const { documents = [], note } = req.body || {}; // [{docKey,label}]
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });

  const list = Array.isArray(documents) ? documents : [documents];
  list.forEach((d) => {
    const label = typeof d === 'string' ? d : d.label;
    if (!label) return;
    application.requestedDocuments.push({
      docKey: typeof d === 'object' ? d.docKey : undefined,
      label, note, status: 'pending', requestedBy: req.user._id, requestedAt: new Date(),
    });
  });

  application.status = 'docs_required';
  application.history.push({ action: 'docs_required', by: req.user.role, note: `Requested: ${list.map((d) => (typeof d === 'string' ? d : d.label)).join(', ')}` });
  await application.save();
  notifyCustomer(application, `Additional documents requested for your ${application.packageName} application.`);
  res.status(200).json({ status: 'success', data: { application } });
});

/* ------------------------------ COMMENTS -------------------------------- */
exports.addPackageComment = wrap(async (req, res) => {
  const { message } = req.body || {};
  const user = await User.findById(req.params.userId);
  if (!message) return res.status(400).json({ status: 'fail', message: 'message is required' });
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });

  const by = isStaff(req) ? req.user.role : 'customer';
  application.comments.push({ by, authorId: req.user?._id, authorName: actorName(req), message, at: new Date() });
  await application.save();

  if (by !== 'customer') notifyCustomer(application, `New message on your ${application.packageName} application.`);
  res.status(200).json({ status: 'success', data: { comments: application.comments } });
});

/* ------------------------------- PAYMENT -------------------------------- */
exports.updatePackagePayment = wrap(async (req, res) => {
  if (!isStaff(req)) return res.status(403).json({ status: 'fail', message: 'Not authorized' });
  const { status, provider, transactionId, paidAmount, paymentLink } = req.body || {};
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });

  application.payment = {
    ...application.payment?.toObject?.() ?? application.payment,
    ...(provider !== undefined && { provider }),
    ...(transactionId !== undefined && { transactionId }),
    ...(paidAmount !== undefined && { paidAmount }),
    ...(paymentLink !== undefined && { paymentLink }),
    ...(status !== undefined && { status }),
    ...(status === 'paid' && { paidAt: new Date() }),
  };
  if (status === 'paid' && application.status === 'pending_payment') application.status = 'paid';
  application.history.push({ action: 'payment_update', by: req.user.role, note: `Payment ${status || 'updated'}` });
  await application.save();
  if (status === 'paid') notifyCustomer(application, `Payment received for your ${application.packageName} application.`);
  res.status(200).json({ status: 'success', data: { application } });
});

/* ------------------------------ DOWNLOAD -------------------------------- */
exports.downloadPackageDocument = wrap(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) return res.status(404).json({ status: 'fail', message: 'User not found' });
  const application = await PackageApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ status: 'fail', message: 'Application not found' });
  // authz: owner or staff
  const owner = application.userId && String(application.userId) === String(user.userId);
  if (!owner && (!user.role === 'admin' || !user.role === 'amer')) return res.status(403).json({ status: 'fail', message: 'Not authorized' });

  const doc = application.documents.id(req.params.docId) ||
    application.documents.find((d) => String(d._id) === String(req.params.docId));
  if (!doc) return res.status(404).json({ status: 'fail', message: 'Document not found' });

  // remote (R2) url -> redirect; local -> stream
  if (/^https?:\/\//.test(doc.url)) return res.redirect(doc.url);

  const filePath = path.join(__dirname, '../../', doc.url.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) return res.status(404).json({ status: 'fail', message: 'File missing on server' });
  res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName || 'document'}"`);
  if (doc.mimeType) res.setHeader('Content-Type', doc.mimeType);
  fs.createReadStream(filePath).pipe(res);
});

/* ------------------------------ helpers --------------------------------- */
function notifyCustomer(application, message) {
  try {
    const app = require('../../index');
    const wsServer = app.get && app.get('wsServer');
    if (application.userId) {
      wsServer?.sendToUser?.(String(application.userId), 'notification', {
        type: 'info', message, applicationId: String(application._id),
      });
    }
  } catch (_) {}
}