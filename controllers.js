const Contribution = require("../models/Contribution");

const GITHUB_API = "https://api.github.com";

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
    Synchronize the logged-in user's GitHub pull requests
    with MongoDB.
*/
const syncContributions = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        if (!req.session.githubAccessToken) {
            return res.status(401).json({
                message: "GitHub access token not available"
            });
        }

        const username = req.session.user.username;
        const accessToken = req.session.githubAccessToken;

        /*
            GitHub Search API:
            Find pull requests authored by this user.
        */
        const searchUrl =
            `${GITHUB_API}/search/issues` +
            `?q=author:${encodeURIComponent(username)}+type:pr` +
            `&sort=updated` +
            `&order=desc` +
            `&per_page=30`;

        const searchData = await githubRequest(
            searchUrl,
            accessToken
        );

        const pullRequests = searchData.items || [];

        let syncedCount = 0;

        for (const item of pullRequests) {
            try {
                const repository =
                    item.repository_url
                        .replace(
                            "https://api.github.com/repos/",
                            ""
                        );

                const pullRequestUrl =
                    item.pull_request?.url;

                if (!pullRequestUrl) {
                    continue;
                }

                /*
                    Search API does not give all PR details.
                    Fetch the complete pull request.
                */
                const pr = await githubRequest(
                    pullRequestUrl,
                    accessToken
                );

                let status = "open";

                if (pr.merged_at) {
                    status = "merged";
                } else if (pr.state === "closed") {
                    status = "closed";
                }

                const contribution = {
                    githubUsername: username,

                    repository: repository,

                    repositoryUrl:
                        `https://github.com/${repository}`,

                    pullRequestNumber:
                        pr.number,

                    pullRequestUrl:
                        pr.html_url,

                    title:
                        pr.title || "Untitled Pull Request",

                    description:
                        pr.body || "",

                    state:
                        pr.state || "open",

                    status,

                    draft:
                        Boolean(pr.draft),

                    createdAt:
                        pr.created_at,

                    updatedAt:
                        pr.updated_at,

                    closedAt:
                        pr.closed_at || null,

                    mergedAt:
                        pr.merged_at || null,

                    additions:
                        pr.additions || 0,

                    deletions:
                        pr.deletions || 0,

                    changedFiles:
                        pr.changed_files || 0,

                    labels:
                        (pr.labels || []).map(
                            label => label.name
                        ),

                    source: "GitHub Activity"
                };

                await Contribution.findOneAndUpdate(
                    {
                        githubUsername: username,
                        repository: repository,
                        pullRequestNumber: pr.number
                    },
                    contribution,
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true
                    }
                );

                syncedCount++;

            } catch (error) {
                console.error(
                    `Could not sync PR: ${item.html_url}`,
                    error.message
                );
            }
        }

        const contributions =
            await Contribution.find({
                githubUsername: username
            }).sort({
                createdAt: -1
            });

        res.json({
            message: "Contribution history synchronized",
            syncedCount,
            totalContributions: contributions.length,
            contributions
        });

    } catch (error) {
        console.error(
            "Contribution sync failed:",
            error
        );

        res.status(500).json({
            message: "Failed to synchronize GitHub contributions",
            error: error.message
        });
    }
};


/*
    Get already stored contribution history.

    This does NOT call GitHub.
*/
const getContributions = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const contributions =
            await Contribution.find({
                githubUsername:
                    req.session.user.username
            }).sort({
                createdAt: -1
            });

        res.json({
            contributions
        });

    } catch (error) {
        console.error(
            "Failed to get contributions:",
            error
        );

        res.status(500).json({
            message: "Failed to load contribution history"
        });
    }
};


/*
    Generate the data required for the report.

    IMPORTANT:
    This does NOT save a report.
    It analyzes the contribution history only
    when the user clicks Generate Report.
*/
const generateContributionReport = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }

        const username =
            req.session.user.username;

        const contributions =
            await Contribution.find({
                githubUsername: username
            }).sort({
                createdAt: -1
            });

        const total =
            contributions.length;

        const prsOpened =
            contributions.length;

        const prsMerged =
            contributions.filter(
                item => item.status === "merged"
            ).length;

        const prsOpen =
            contributions.filter(
                item => item.status === "open"
            ).length;

        const prsClosed =
            contributions.filter(
                item => item.status === "closed"
            ).length;

        const repositories =
            new Set(
                contributions.map(
                    item => item.repository
                )
            );

        const totalAdditions =
            contributions.reduce(
                (sum, item) =>
                    sum + (item.additions || 0),
                0
            );

        const totalDeletions =
            contributions.reduce(
                (sum, item) =>
                    sum + (item.deletions || 0),
                0
            );

        const labels = {};

        contributions.forEach(item => {
            (item.labels || []).forEach(label => {
                labels[label] =
                    (labels[label] || 0) + 1;
            });
        });

        const topLabels =
            Object.entries(labels)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, count]) => ({
                    name,
                    count
                }));

        res.json({
            generatedAt: new Date(),

            user: {
                username,
                name: req.session.user.name,
                avatarUrl: req.session.user.avatarUrl
            },

            summary: {
                totalContributions: total,
                prsOpened,
                prsMerged,
                prsOpen,
                prsClosed,
                repositories: repositories.size,
                totalAdditions,
                totalDeletions
            },

            topLabels,

            contributions
        });

    } catch (error) {
        console.error(
            "Report generation failed:",
            error
        );

        res.status(500).json({
            message: "Failed to generate contribution report"
        });
    }
};


module.exports = {
    syncContributions,
    getContributions,
    generateContributionReport
};
