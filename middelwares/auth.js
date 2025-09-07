const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: "Authentication failed, Token missing" 
      });
    }

    const secret = process.env.JWT_SECRET || "your-secret-key-change-in-production";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false,
      message: "Authentication failed. Invalid token." 
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  const role = req.user?.role || req.auth?.role;
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ 
      success: false,
      message: "Forbidden: insufficient role" 
    });
  }
  next();
};

module.exports = auth;
module.exports.requireRole = requireRole;
