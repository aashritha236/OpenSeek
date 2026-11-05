const express = require("express");

const router = express.Router();

const {
    syncContributions,
    getContributions,
    generateContributionReport
} = require("../controllers/contributionController");


/*
==========================================================
SYNC GITHUB CONTRIBUTIONS
==========================================================
*/

router.post(
    "/sync",
    syncContributions
);


/*
==========================================================
GET STORED CONTRIBUTION HISTORY
==========================================================
*/

router.get(
    "/",
    getContributions
);


/*
==========================================================
GENERATE REPORT FOR ONE CONTRIBUTION
==========================================================

Example:

/api/contributions/report/CONTRIBUTION_ID
*/

router.get(
    "/report/:id",
    generateContributionReport
);


module.exports = router;
