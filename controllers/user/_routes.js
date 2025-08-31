const express = require("express");
const user = require("./user");
const auth = require("../../middelwares/auth");

const router = express.Router();

router.get("/", auth, user.getUsers);
router.get("/:id", auth, user.getUser);
router.post("/", user.createUser);
router.put("/:id", auth, user.updateUser);
router.delete("/:id", auth, user.deleteUser);
router.delete("/deleteMany", auth, user.deleteMany);

router.get("/:id/entries", auth, user.getUserEntries);
router.get("/:id/stats", auth, user.getUserStats);

router.post("/login", user.login);
router.post("/admin-register", user.adminRegister);

router.post(
  "/register",
  auth,
  user.upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "offerLetter", maxCount: 1 },
    { name: "passportCopy", maxCount: 1 },
    { name: "emiratesId", maxCount: 1 },
    { name: "labourCard", maxCount: 1 },
    { name: "visaPage", maxCount: 1 },
  ]),
  user.register
);

router.put(
  "/:id/documents",
  auth,
  user.upload.fields([
    { name: "profilePicture", maxCount: 1 },
    { name: "offerLetter", maxCount: 1 },
    { name: "passportCopy", maxCount: 1 },
    { name: "emiratesId", maxCount: 1 },
    { name: "labourCard", maxCount: 1 },
    { name: "visaPage", maxCount: 1 },
  ]),
  user.updateDocuments
);

router.use("/user-documents", express.static("uploads/User/UserDocuments"));

module.exports = router;
