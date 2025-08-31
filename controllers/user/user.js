const User = require("../../model/schema/user");
// const ServiceEntryData = require('../../model/schema/serviceEntryData'); // TODO: Create this schema
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");


// Admin register
const adminRegister = async (req, res) => {
  try {
    const { username, password, firstName, lastName, phoneNumber } = req.body;
    const user = await User.findOne({ username: username });
    if (user) {
      return res
        .status(400)
        .json({ message: "Admin already exist please try another email" });
    } else {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Create a new user
      const user = new User({
        username,
        password: hashedPassword,
        firstName,
        lastName,
        phoneNumber,
        role: "admin",
      });
      // Save the user to the database
      await user.save();
      res.status(200).json({ message: "Admin created successfully" });
    }
  } catch (error) {
    res.status(500).json({ error: error });
  }
};

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = "uploads/User/UserDocuments";
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uploadDir = "uploads/User/UserDocuments";
      const filePath = path.join(uploadDir, file.originalname);

      // Check if the file already exists in the destination directory
      if (fs.existsSync(filePath)) {
        // For example, you can append a timestamp to the filename to make it unique
        const timestamp = Date.now() + Math.floor(Math.random() * 90);
        cb(
          null,
          file.originalname.split(".")[0] +
            "-" +
            timestamp +
            "." +
            file.originalname.split(".")[1]
        );
      } else {
        cb(null, file.originalname);
      }
    },
  }),
});

// User Registration
const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
      role = 'user',
      employeeId
    } = req.body;

    // Check if user exists

    const totalUsers = await User.countDocuments();
    if(employeeId==""){
      employeeId = `EMP-${totalUsers + 1}`;
    }
    const existingUser = await User.findOne({ 
      $or: [{ email }, { employeeId }] 
    });


    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email 
          ? 'Email already in use' 
          : 'Employee ID already exists' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      role,
      employeeId,
    });

    await user.save();

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role 
      },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '24h' }
    );

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      user: userResponse,
      token,
      message: "Registration successful"
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: error.message || "Registration failed" 
    });
  }
};


const index = async (req, res) => {
  try {
    let user = await User.find(); // { deleted: false }
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error });
  }
};

const view = async (req, res) => {
  try {
    let user = await User.findOne({ _id: req.params.id });
    if (!user) return res.status(404).json({ message: "no Data Found." });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error });
  }
};

let deleteData = async (req, res) => {
  try {
    const userId = req.params.id;

    // Assuming you have retrieved the user document using userId
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.role !== "admin") {
      // Update the user's 'deleted' field to true
      await User.deleteOne({ _id: userId });
      res.send({ message: "Record deleted Successfully" });
    } else {
      res.status(404).json({ message: "admin can not delete" });
    }
  } catch (error) {
    res.status(500).json({ error });
  }
};

const deleteMany = async (req, res) => {
  try {
    const updatedUsers = await User.updateMany(
      { _id: { $in: req.body }, role: { $ne: "admin" } },
      { $set: { deleted: true } }
    );
    res.status(200).json({ message: "done", updatedUsers });
  } catch (err) {
    res.status(404).json({ message: "error", err });
  }
};



const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ 
      email, 
      deleted: false 
    })

    if (!user) {
      return res.status(401).json({ 
        error: "Invalid email or password" 
      });
    }

    // Compare the provided password with the hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: "Invalid email or password" 
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role 
      }, 
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '24h' }
    );


    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      user: userResponse,
      token,
      message: "Login successful"
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: "An error occurred during login" 
    });
  }
};

// Get user stats
const getUserStats = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: Re-enable once ServiceEntryData schema is created
    // const stats = await ServiceEntryData.aggregate([
    //   { $match: { customerId: mongoose.Types.ObjectId(id) } },
    //   {
    //     $group: {
    //       _id: null,
    //       totalEntries: { $sum: 1 },
    //       completedEntries: {
    //         $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] }
    //       },
    //       pendingEntries: {
    //         $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
    //       }
    //     }
    //   }
    // ]);
    
    const stats = [{ totalEntries: 0, completedEntries: 0, pendingEntries: 0 }];

    res.json(stats[0] || {
      totalEntries: 0,
      completedEntries: 0,
      pendingEntries: 0
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update user documents
const updateDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files;
    const remarks = req.body;

    const updateData = {};

    // Handle profile picture
    if (files.profilePicture) {
      updateData.profilePicture = {
        path: files.profilePicture[0].path,
        remarks: remarks.profilePictureRemarks || ''
      };
    }

    // Handle documents array
    const documents = [];
    const documentTypes = ['offerLetter', 'passportCopy', 'emiratesId', 'labourCard', 'visaPage'];
    
    documentTypes.forEach(type => {
      if (files[type]) {
        documents.push({
          type,
          path: files[type][0].path,
          remarks: remarks[`${type}Remarks`] || '',
          uploadDate: new Date()
        });
      }
    });

    if (documents.length > 0) {
      updateData.documents = documents;
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update documents error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create new user
const createUser = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phoneNumber, 
      password, 
      role, 
      employeeId 
    } = req.body;

    let employeeIdNew="";
    const totalUsers = await User.countDocuments();
    if(employeeId==""){
      employeeIdNew = `EMP-${totalUsers + 1}`;
    }
    const existingUser = await User.findOne({ 
      $or: [{ email }, { employeeId:employeeIdNew }] 
    });


    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email 
          ? 'Email already in use' 
          : 'Employee ID already exists' 
      });
    }



    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: hashedPassword,
      role,
      employeeId:employeeIdNew,
    });

    await user.save();
    
    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      user: userResponse,
      message: "User created successfully"
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      error: error.message || "Failed to create user" 
    });
  }
};

// Get user with entries
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate({
        path: 'entries',
        select: 'serviceId serviceName data status createdAt',
        options: { sort: { createdAt: -1 } }
      });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all users with entry counts
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      // .select('-password')
      // .lean();
    // TODO: Re-enable once ServiceEntryData schema is created
    // Get entry counts for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      // const entryCount = await ServiceEntryData.countDocuments({ customerId: user._id });
      // const lastEntry = await ServiceEntryData.findOne({ customerId: user._id })
      //   .sort({ createdAt: -1 })
      //   .select('createdAt');

      return {
        ...user._doc,
        entryCount: 0,
        lastEntryDate: null
      };
    }));

    res.json(usersWithStats);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneNumber, password, role } = req.body;
    const updateData = {
      firstName,
      lastName,
      email,
      phoneNumber,
      role,

    };

    // Only hash and update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // TODO: Re-enable once ServiceEntryData schema is created
    // Also update or delete related entries
    // await ServiceEntryData.updateMany(
    //   { customerId: user._id },
    //   { $set: { status: 'archived' } }
    // );

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get user entries
const getUserEntries = async (req, res) => {
  try {
    // TODO: Re-enable once ServiceEntryData schema is created
    // const entries = await ServiceEntryData.find({ customerId: req.params.id })
    //   .sort({ createdAt: -1 })
    //   .populate('serviceId', 'name');
    
    const entries = [];

    res.json(entries);
  } catch (error) {
    console.error('Get user entries error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  adminRegister,
  index,
  deleteMany,
  view,
  deleteData,
  upload,
 
  createUser,
  getUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserEntries,
  getUserStats,
  updateDocuments,
};
