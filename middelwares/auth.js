const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  try {
    // const authHeader = req.headers.authorization || "";
    // const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

    // if (!token) {
    //   return res.status(401).json({ message: "Authentication failed , Token missing" });
    // }

    // const secret = process.env.JWT_SECRET || "secret_key";
    // const decode = jwt.verify(token, secret);
    // req.user = decode;
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Authentication failed. Invalid token." });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  const role = req.user?.role || req.auth?.role;
  if (!role || !roles.includes(role)) {
    return res.status(403).json({ message: "Forbidden: insufficient role" });
  }
  next();
};

module.exports = auth;
module.exports.requireRole = requireRole;
