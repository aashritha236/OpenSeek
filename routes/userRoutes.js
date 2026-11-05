const express = require("express");
const router = express.Router();

const {
    saveUser
} = require("../controllers/userController");

router.post("/", saveUser);

module.exports = router;
