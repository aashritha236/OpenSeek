const Contribution = require("../models/Contribution");

const GITHUB_API = "https://api.github.com";


/*
==========================================================
GITHUB API HELPER
==========================================================
*/

async function githubRequest(url, accessToken) {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "OpenSeek"
        }
    });

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `GitHub API ${response.status}: ${errorText}`
        );
    }

    return response.json();
}


/*
==========================================================
SYNC GITHUB CONTRIBUTIONS
==========================================================

Find the logged-in user's GitHub PRs and store them
in MongoDB.

If a PR already exists:
    → update it

If it does not exist:
    → create it

This prevents duplicate contributions.
*/

const syncContributions = async (req, res) => {

    try {

        /*
        ------------------------------------------
        Authentication check
        ------------------------------------------
        */

        if (!req.session.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }


        /*
        ------------------------------------------
        GitHub token check
        ------------------------------------------
        */

        if (!req.session.githubAccessToken) {
            return res.status(401).json({
                message:
                    "GitHub access token not available"
            });
        }


        const username =
            req.session.user.username;

        const accessToken =
            req.session.githubAccessToken;


        /*
        ------------------------------------------
        Search GitHub for user's pull requests
        ------------------------------------------
        */

        const searchUrl =
            `${GITHUB_API}/search/issues` +
            `?q=author:${encodeURIComponent(username)}+type:pr` +
            `&sort=updated` +
            `&order=desc` +
            `&per_page=30`;


        const searchData =
            await githubRequest(
                searchUrl,
                accessToken
            );


        const pullRequests =
            searchData.items || [];


        let syncedCount = 0;


        /*
        ------------------------------------------
        Process each PR
        ------------------------------------------
        */

        for (const item of pullRequests) {

            try {

                /*
                Get repository name.

                Example:

                https://api.github.com/repos/
                facebook/react

                becomes:

                facebook/react
                */

                const repository =
                    item.repository_url
                        .replace(
                            "https://api.github.com/repos/",
                            ""
                        );


                /*
                Search API gives us a PR API URL.
                */

                const pullRequestUrl =
                    item.pull_request?.url;


                if (!pullRequestUrl) {
                    continue;
                }


                /*
                --------------------------------------
                Fetch complete PR information
                --------------------------------------
                */

                const pr =
                    await githubRequest(
                        pullRequestUrl,
                        accessToken
                    );


                /*
                --------------------------------------
                Determine contribution status
                --------------------------------------
                */

                let status = "open";


                if (pr.merged_at) {

                    status = "merged";

                } else if (
                    pr.state === "closed"
                ) {

                    status = "closed";

                }


                /*
                --------------------------------------
                Prepare contribution document
                --------------------------------------
                */

                const contribution = {

                    githubUsername:
                        username,


                    repository:
                        repository,


                    repositoryUrl:
                        `https://github.com/${repository}`,


                    pullRequestNumber:
                        pr.number,


                    pullRequestUrl:
                        pr.html_url,


                    title:
                        pr.title ||
                        "Untitled Pull Request",


                    description:
                        pr.body ||
                        "",


                    state:
                        pr.state ||
                        "open",


                    status:
                        status,


                    draft:
                        Boolean(pr.draft),


                    /*
                    IMPORTANT:

                    These are GitHub dates.

                    They are intentionally different
                    from Mongoose's createdAt /
                    updatedAt timestamps.
                    */

                    githubCreatedAt:
                        pr.created_at ||
                        null,


                    githubUpdatedAt:
                        pr.updated_at ||
                        null,


                    githubClosedAt:
                        pr.closed_at ||
                        null,


                    githubMergedAt:
                        pr.merged_at ||
                        null,


                    /*
                    ----------------------------------
                    Code changes
                    ----------------------------------
                    */

                    additions:
                        pr.additions ||
                        0,


                    deletions:
                        pr.deletions ||
                        0,


                    changedFiles:
                        pr.changed_files ||
                        0,


                    /*
                    ----------------------------------
                    Labels
                    ----------------------------------
                    */

                    labels:
                        (pr.labels || []).map(
                            label =>
                                label.name
                        ),


                    /*
                    ----------------------------------
                    Source
                    ----------------------------------
                    */

                    source:
                        "GitHub Activity"

                };


                /*
                --------------------------------------
                Upsert contribution
                --------------------------------------

                Existing PR:
                    update

                New PR:
                    insert

                Unique index prevents duplicates.
                */

                await Contribution.findOneAndUpdate(

                    {
                        githubUsername:
                            username,

                        repository:
                            repository,

                        pullRequestNumber:
                            pr.number
                    },

                    contribution,

                    {
                        upsert: true,

                        new: true,

                        runValidators: true,

                        setDefaultsOnInsert: true
                    }

                );


                syncedCount++;


            } catch (error) {

                /*
                One failed PR should not stop
                the entire synchronization.
                */

                console.error(
                    `Could not sync PR: ${item.html_url}`,
                    error.message
                );

            }

        }


        /*
        ------------------------------------------
        Load complete stored history
        ------------------------------------------
        */

        const contributions =
            await Contribution.find({
                githubUsername:
                    username
            })
            .sort({
                githubCreatedAt: -1
            });


        /*
        ------------------------------------------
        Return result
        ------------------------------------------
        */

        res.json({

            message:
                "Contribution history synchronized",

            syncedCount:

                syncedCount,

            totalContributions:

                contributions.length,

            contributions:

                contributions

        });


    } catch (error) {

        console.error(
            "Contribution sync failed:",
            error
        );


        res.status(500).json({

            message:
                "Failed to synchronize GitHub contributions",

            error:
                error.message

        });

    }

};


/*
==========================================================
GET STORED CONTRIBUTION HISTORY
==========================================================

IMPORTANT:

This endpoint does NOT contact GitHub.

It simply retrieves the history already stored
in MongoDB.
*/

const getContributions = async (req, res) => {

    try {

        /*
        ------------------------------------------
        Authentication
        ------------------------------------------
        */

        if (!req.session.user) {

            return res.status(401).json({

                message:
                    "Authentication required"

            });

        }


        const username =
            req.session.user.username;


        /*
        ------------------------------------------
        Retrieve history
        ------------------------------------------
        */

        const contributions =
            await Contribution.find({

                githubUsername:
                    username

            })
            .sort({

                githubCreatedAt: -1

            });


        /*
        ------------------------------------------
        Empty history is NOT an error.
        ------------------------------------------
        */

        res.json({

            contributions:

                contributions

        });


    } catch (error) {

        console.error(
            "Failed to get contributions:",
            error
        );


        res.status(500).json({

            message:
                "Failed to load contribution history"

        });

    }

};


/*
==========================================================
GENERATE REPORT FOR ONE CONTRIBUTION
==========================================================

Example:

GET /api/contributions/report/64abc123...

The report is generated only when the user clicks
"Generate Report".

The report is NOT stored in MongoDB.
==========================================================
*/

const generateContributionReport = async (req, res) => {

    try {

        /*
        ------------------------------------------
        Authentication
        ------------------------------------------
        */

        if (!req.session.user) {

            return res.status(401).json({

                message:
                    "Authentication required"

            });

        }


        const username =
            req.session.user.username;


        const contributionId =
            req.params.id;


        /*
        ------------------------------------------
        Validate ID
        ------------------------------------------
        */

        if (!contributionId) {

            return res.status(400).json({

                message:
                    "Contribution ID is required"

            });

        }


        /*
        ------------------------------------------
        Find contribution
        ------------------------------------------
        */

        const contribution =
            await Contribution.findOne({

                _id:
                    contributionId,

                githubUsername:
                    username

            });


        /*
        ------------------------------------------
        Contribution not found
        ------------------------------------------
        */

        if (!contribution) {

            return res.status(404).json({

                message:
                    "Contribution not found"

            });

        }


        /*
        ------------------------------------------
        Calculate useful report information
        ------------------------------------------
        */

        const linesAdded =
            contribution.additions || 0;


        const linesDeleted =
            contribution.deletions || 0;


        const changedFiles =
            contribution.changedFiles || 0;


        const totalChanges =
            linesAdded +
            linesDeleted;


        /*
        ------------------------------------------
        Determine contribution type
        ------------------------------------------
        */

        let contributionType =
            "Code Contribution";


        const title =
            (
                contribution.title ||
                ""
            ).toLowerCase();


        const description =
            (
                contribution.description ||
                ""
            ).toLowerCase();


        const combinedText =
            `${title} ${description}`;


        if (
            combinedText.includes("document") ||
            combinedText.includes("readme")
        ) {

            contributionType =
                "Documentation";

        } else if (
            combinedText.includes("test") ||
            combinedText.includes("testing")
        ) {

            contributionType =
                "Testing";

        } else if (
            combinedText.includes("bug") ||
            combinedText.includes("fix") ||
            combinedText.includes("issue")
        ) {

            contributionType =
                "Bug Fix";

        } else if (
            combinedText.includes("feature") ||
            combinedText.includes("add")
        ) {

            contributionType =
                "Feature";

        }


        /*
        ------------------------------------------
        Determine contribution size
        ------------------------------------------
        */

        let contributionSize =
            "Small";


        if (
            changedFiles > 20 ||
            totalChanges > 1000
        ) {

            contributionSize =
                "Large";

        } else if (
            changedFiles > 5 ||
            totalChanges > 250
        ) {

            contributionSize =
                "Medium";

        }


        /*
        ------------------------------------------
        Generate report
        ------------------------------------------
        */

        const report = {

            generatedAt:
                new Date(),


            contributor: {

                username:
                    username,

                name:
                    req.session.user.name,

                avatarUrl:
                    req.session.user.avatarUrl

            },


            contribution: {

                id:
                    contribution._id,

                repository:
                    contribution.repository,

                repositoryUrl:
                    contribution.repositoryUrl,

                pullRequestNumber:
                    contribution.pullRequestNumber,

                pullRequestUrl:
                    contribution.pullRequestUrl,

                title:
                    contribution.title,

                description:
                    contribution.description,

                status:
                    contribution.status,

                draft:
                    contribution.draft,

                source:
                    contribution.source

            },


            timeline: {

                createdAt:
                    contribution.githubCreatedAt,

                updatedAt:
                    contribution.githubUpdatedAt,

                closedAt:
                    contribution.githubClosedAt,

                mergedAt:
                    contribution.githubMergedAt

            },


            changes: {

                additions:
                    linesAdded,

                deletions:
                    linesDeleted,

                changedFiles:
                    changedFiles,

                totalChanges:
                    totalChanges

            },


            analysis: {

                contributionType:
                    contributionType,

                contributionSize:
                    contributionSize,

                labels:
                    contribution.labels || []

            }

        };


        /*
        ------------------------------------------
        Send report
        ------------------------------------------
        */

        res.json({

            message:
                "Contribution report generated",

            report

        });


    } catch (error) {

        console.error(
            "Contribution report generation failed:",
            error
        );


        res.status(500).json({

            message:
                "Failed to generate contribution report",

            error:
                error.message

        });

    }

};


/*
==========================================================
EXPORT
==========================================================
*/

module.exports = {

    syncContributions,

    getContributions,

    generateContributionReport

};
