const VisaApplication = require('../../model/schema/visaApplication');
const User = require('../../model/schema/user');
const fs = require('fs');
const path = require('path');

// Response formatter
const formatResponse = (success, message, data = null, errors = null) => ({
  success,
  message,
  data,
  errors,
  meta: {
    timestamp: new Date().toISOString(),
    requestId: Math.random().toString(36).substr(2, 9)
  }
});

// Create new visa application
const createVisaApplication = async (req, res) => {
  try {
    const {
      applicationType,
      sponsoredPerson,
      serviceId,
      documents,
      personalInfo,
      sponsorInfo
    } = req.body;

    const userId = req.user.id; // From auth middleware

    // Validate required fields
    if (!applicationType || !serviceId) {
      return res.status(400).json(formatResponse(false, 'Application type and service ID are required'));
    }

    // Create application
    const application = new VisaApplication({
      applicationType,
      sponsor: userId,
      sponsored: sponsoredPerson,
      status: 'draft',
      attachments: documents || [],
      metadata: {
        serviceId,
        personalInfo,
        sponsorInfo,
        submittedAt: new Date()
      },
      history: [{
        action: 'created',
        by: userId,
        note: 'Application created'
      }]
    });

    await application.save();

    res.status(201).json(formatResponse(true, 'Visa application created successfully', { application }));
  } catch (error) {
    console.error('Error creating visa application:', error);
    res.status(500).json(formatResponse(false, 'Failed to create visa application', null, [error.message]));
  }
};

// Get all applications (for Amer professionals)
const getAllApplications = async (req, res) => {
  try {
    const { status, applicationType, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    if (applicationType) filter.applicationType = applicationType;

    const applications = await VisaApplication.find(filter)
      .populate('sponsor', 'firstName lastName email phoneNumber')
      .populate('sponsored', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await VisaApplication.countDocuments(filter);

    res.json(formatResponse(true, 'Applications retrieved successfully', {
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }));
  } catch (error) {
    console.error('Error getting applications:', error);
    res.status(500).json(formatResponse(false, 'Failed to retrieve applications', null, [error.message]));
  }
};

// Get application by ID
const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const application = await VisaApplication.findById(id)
      .populate('sponsor', 'firstName lastName email phoneNumber documents')
      .populate('sponsored', 'firstName lastName email phoneNumber documents');

    if (!application) {
      return res.status(404).json(formatResponse(false, 'Application not found'));
    }

    res.json(formatResponse(true, 'Application retrieved successfully', { application }));
  } catch (error) {
    console.error('Error getting application:', error);
    res.status(500).json(formatResponse(false, 'Failed to retrieve application', null, [error.message]));
  }
};

// Update application status (Amer professionals)
const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, note, requiredDocuments } = req.body;
    const userId = req.user.id;

    const application = await VisaApplication.findById(id);
    if (!application) {
      return res.status(404).json(formatResponse(false, 'Application not found'));
    }

    // Update status
    application.status = status;
    
    // Add to history
    application.history.push({
      action: `status_updated_to_${status}`,
      by: userId,
      note: note || `Status updated to ${status}`
    });

    // Update metadata if additional documents are required
    if (requiredDocuments && requiredDocuments.length > 0) {
      application.metadata.set('requiredDocuments', requiredDocuments);
    }

    await application.save();

    res.json(formatResponse(true, 'Application status updated successfully', { application }));
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json(formatResponse(false, 'Failed to update application status', null, [error.message]));
  }
};

// Upload documents to application
const uploadDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const { documents } = req.body;
    const userId = req.user.id;

    const application = await VisaApplication.findById(id);
    if (!application) {
      return res.status(404).json(formatResponse(false, 'Application not found'));
    }

    // Check if user is the sponsor
    if (application.sponsor.toString() !== userId) {
      return res.status(403).json(formatResponse(false, 'Only the sponsor can upload documents'));
    }

    // Add new documents
    application.attachments.push(...documents);

    // Update history
    application.history.push({
      action: 'documents_uploaded',
      by: userId,
      note: `${documents.length} document(s) uploaded`
    });

    await application.save();

    res.json(formatResponse(true, 'Documents uploaded successfully', { application }));
  } catch (error) {
    console.error('Error uploading documents:', error);
    res.status(500).json(formatResponse(false, 'Failed to upload documents', null, [error.message]));
  }
};

// Submit application for review
const submitApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const application = await VisaApplication.findById(id);
    if (!application) {
      return res.status(404).json(formatResponse(false, 'Application not found'));
    }

    if (application.sponsor.toString() !== userId) {
      return res.status(403).json(formatResponse(false, 'Only the sponsor can submit the application'));
    }

    if (application.status !== 'draft') {
      return res.status(400).json(formatResponse(false, 'Application can only be submitted from draft status'));
    }

    // Update status
    application.status = 'submitted';
    application.metadata.set('submittedAt', new Date());
    
    // Add to history
    application.history.push({
      action: 'submitted',
      by: userId,
      note: 'Application submitted for review'
    });

    await application.save();

    res.json(formatResponse(true, 'Application submitted successfully', { application }));
  } catch (error) {
    console.error('Error submitting application:', error);
    res.status(500).json(formatResponse(false, 'Failed to submit application', null, [error.message]));
  }
};

// Get user's applications
const getUserApplications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    
    const filter = { sponsor: userId };
    if (status) filter.status = status;

    const applications = await VisaApplication.find(filter)
      .populate('sponsored', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await VisaApplication.countDocuments(filter);

    res.json(formatResponse(true, 'User applications retrieved successfully', {
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    }));
  } catch (error) {
    console.error('Error getting user applications:', error);
    res.status(500).json(formatResponse(false, 'Failed to retrieve user applications', null, [error.message]));
  }
};

// Get application statistics
const getApplicationStats = async (req, res) => {
  try {
    const stats = await VisaApplication.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalApplications = await VisaApplication.countDocuments();
    const recentApplications = await VisaApplication.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('sponsor', 'firstName lastName');

    res.json(formatResponse(true, 'Statistics retrieved successfully', {
      stats: {
        byStatus: stats,
        total: totalApplications,
        recent: recentApplications
      }
    }));
  } catch (error) {
    console.error('Error getting application stats:', error);
    res.status(500).json(formatResponse(false, 'Failed to retrieve statistics', null, [error.message]));
  }
};

module.exports = {
  createVisaApplication,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  uploadDocuments,
  submitApplication,
  getUserApplications,
  getApplicationStats
};
