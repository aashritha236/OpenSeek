const express = require("express");

const router = express.Router();

const {
    getRepositories
} = require("../controllers/repositoryController");


/*
 * Get repositories belonging to
 * the currently logged-in GitHub user.
 */
router.get(
    "/",
    getRepositories
);


module.exports = router;
