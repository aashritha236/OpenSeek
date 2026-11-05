require("dotenv").config();

const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

const connectDB = require("./database");
const User = require("./models/User");

const userRoutes = require("./routes/userRoutes");
const contributionRoutes = require("./routes/contributionRoutes");
const repositoryRoutes = require("./routes/repositoryRoutes");

// ============================================================
// APP
// ============================================================

const app = express();

const PORT = process.env.PORT || 3000;


// ============================================================
// OPENROUTER
// ============================================================

const OPENROUTER_URL =
    "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL =
    "openrouter/free";


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "openseek-development-secret",

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: false,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);


// ============================================================
// STATIC FILES
// ============================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ============================================================
// USER + CONTRIBUTION ROUTES
// ============================================================

app.use(
    "/api/users",
    userRoutes
);

app.use(
    "/api/contributions",
    contributionRoutes
);

app.use(
    "/api/repositories",
    repositoryRoutes
);

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function requireAuth(req, res, next) {

    if (!req.session.user) {

        return res.status(401).json({
            error: "Authentication required"
        });
    }

    next();
}


// ============================================================
// PAGE ROUTES
// ============================================================


// ------------------------------------------------------------
// LANDING PAGE
// ------------------------------------------------------------

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );
});


// ------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------

app.get("/profile.html", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "profile.html"
        )
    );
});


// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------

app.get("/dashboard.html", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "dashboard.html"
        )
    );
});


// ------------------------------------------------------------
// NEW CONTRIBUTION
// ------------------------------------------------------------

app.get("/newcontribution.html", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "newcontribution.html"
        )
    );
});


// ------------------------------------------------------------
// CONTRIBUTION REPORT
// ------------------------------------------------------------

app.get("/contributions.html", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    const filePath =
        path.join(
            __dirname,
            "public",
            "contributions.html"
        );

    res.sendFile(
        filePath,
        (error) => {

            if (error) {

                console.error(
                    "Could not load contributions page:",
                    error.message
                );

                res.status(404).send(
                    "Contribution Report page is not available yet."
                );
            }
        }
    );
});


// ------------------------------------------------------------
// REPOSITORIES
// ------------------------------------------------------------

app.get("/repositories.html", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/");
    }

    const filePath =
        path.join(
            __dirname,
            "public",
            "repositories.html"
        );

    res.sendFile(
        filePath,
        (error) => {

            if (error) {

                console.error(
                    "Could not load repositories page:",
                    error.message
                );

                res.status(404).send(
                    "Repositories page is not available yet."
                );
            }
        }
    );
});


// ============================================================
// GITHUB OAUTH
// ============================================================


// ------------------------------------------------------------
// START GITHUB LOGIN
// ------------------------------------------------------------

app.get("/auth/github", (req, res) => {

    const state =
        crypto.randomBytes(32).toString("hex");


    req.session.oauthState =
        state;


    req.session.save((err) => {

        if (err) {

            console.error(
                "Could not save OAuth session:",
                err
            );

            return res
                .status(500)
                .send(
                    "Could not start GitHub login."
                );
        }


        const params =
            new URLSearchParams({

                client_id:
                    process.env.GITHUB_CLIENT_ID,

                redirect_uri:
                    process.env.GITHUB_CALLBACK_URL,

                scope:
                    "read:user user:email",

                state:
                    state

            });


        res.redirect(
            `https://github.com/login/oauth/authorize?${params.toString()}`
        );
    });
});


// ============================================================
// GITHUB CALLBACK
// ============================================================

app.get(
    "/auth/github/callback",
    async (req, res) => {

        try {

            const {
                code,
                state
            } = req.query;


            if (!code) {

                return res
                    .status(400)
                    .send(
                        "GitHub authorization code missing."
                    );
            }


            if (
                !state ||
                state !== req.session.oauthState
            ) {

                return res
                    .status(400)
                    .send(
                        "Invalid OAuth state."
                    );
            }


            delete req.session.oauthState;


            // ------------------------------------------------
            // EXCHANGE CODE FOR TOKEN
            // ------------------------------------------------

            const tokenResponse =
                await fetch(
                    "https://github.com/login/oauth/access_token",
                    {
                        method: "POST",

                        headers: {
                            "Accept":
                                "application/json",

                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({

                            client_id:
                                process.env.GITHUB_CLIENT_ID,

                            client_secret:
                                process.env.GITHUB_CLIENT_SECRET,

                            code:
                                code,

                            redirect_uri:
                                process.env.GITHUB_CALLBACK_URL

                        })
                    }
                );


            const tokenData =
                await tokenResponse.json();


            if (!tokenData.access_token) {

                console.error(
                    "GitHub token error:",
                    tokenData
                );

                return res
                    .status(500)
                    .send(
                        "Could not authenticate with GitHub."
                    );
            }


            const githubAccessToken =
                tokenData.access_token;


            // ------------------------------------------------
            // GET GITHUB USER
            // ------------------------------------------------

            const githubResponse =
                await fetch(
                    "https://api.github.com/user",
                    {
                        headers: {

                            "Authorization":
                                `Bearer ${githubAccessToken}`,

                            "Accept":
                                "application/vnd.github+json",

                            "User-Agent":
                                "OpenSeek"
                        }
                    }
                );


            if (!githubResponse.ok) {

                return res
                    .status(500)
                    .send(
                        "Could not retrieve GitHub profile."
                    );
            }


            const githubUser =
                await githubResponse.json();


            const githubUsername =
                githubUser.login;


            // ------------------------------------------------
            // CHECK DATABASE
            // ------------------------------------------------

            const existingUser =
                await User.findOne({
                    githubUsername
                });


            // ------------------------------------------------
            // REGENERATE SESSION
            // ------------------------------------------------

            req.session.regenerate(
                (err) => {

                    if (err) {

                        console.error(
                            "Session regeneration failed:",
                            err
                        );

                        return res
                            .status(500)
                            .send(
                                "Could not create login session."
                            );
                    }


                    req.session.user = {

                        id:
                            githubUser.id,

                        username:
                            githubUser.login,

                        name:
                            githubUser.name ||
                            githubUser.login,

                        avatarUrl:
                            githubUser.avatar_url,

                        profileUrl:
                            githubUser.html_url
                    };


                    req.session.githubAccessToken =
                        githubAccessToken;


                    req.session.save(
                        (saveError) => {

                            if (saveError) {

                                console.error(
                                    "Session save failed:",
                                    saveError
                                );

                                return res
                                    .status(500)
                                    .send(
                                        "Could not save login session."
                                    );
                            }


                            // Existing user

                            if (existingUser) {

                                return res.redirect(
                                    "/dashboard.html"
                                );
                            }


                            // New user

                            return res.redirect(
                                "/profile.html"
                            );
                        }
                    );
                }
            );

        } catch (error) {

            console.error(
                "GitHub OAuth error:",
                error
            );

            res
                .status(500)
                .send(
                    "GitHub authentication failed."
                );
        }
    }
);


// ============================================================
// CURRENT USER
// ============================================================

app.get(
    "/api/me",
    requireAuth,
    (req, res) => {

        res.json(
            req.session.user
        );
    }
);


// ============================================================
// LOGOUT
// ============================================================

app.post(
    "/auth/logout",
    (req, res) => {

        req.session.destroy(
            (err) => {

                if (err) {

                    console.error(
                        "Logout error:",
                        err
                    );

                    return res
                        .status(500)
                        .send(
                            "Could not log out."
                        );
                }


                res.clearCookie(
                    "connect.sid"
                );


                res.redirect("/");
            }
        );
    }
);


// ============================================================
// TEST ROUTE
// ============================================================

app.get(
    "/test",
    (req, res) => {

        res.json({
            message:
                "OpenSeek backend is working."
        });
    }
);


// ============================================================
// MATCHING ENGINE
// ============================================================


// Cache repository information so that we don't repeatedly
// request the same repository from GitHub.

const repositoryCache =
    new Map();


// ------------------------------------------------------------
// NORMALIZE TEXT
// ------------------------------------------------------------

function normalizeText(value) {

    return String(
        value || ""
    )
        .toLowerCase()
        .replace(
            /[^a-z0-9+#./-]+/g,
            " "
        )
        .trim();
}


// ------------------------------------------------------------
// RECENCY
// ------------------------------------------------------------

function calculateRecency(
    updatedAt
) {

    if (!updatedAt) {
        return 0;
    }


    const updated =
        new Date(updatedAt);


    if (
        Number.isNaN(
            updated.getTime()
        )
    ) {

        return 0;
    }


    const now =
        Date.now();


    const ageDays =
        Math.max(
            0,
            (now - updated.getTime()) /
                (1000 * 60 * 60 * 24)
        );


    if (ageDays <= 7) {
        return 10;
    }

    if (ageDays <= 30) {
        return 8;
    }

    if (ageDays <= 90) {
        return 6;
    }

    if (ageDays <= 180) {
        return 4;
    }

    if (ageDays <= 365) {
        return 2;
    }

    return 0;
}


// ------------------------------------------------------------
// ISSUE AGE
// ------------------------------------------------------------

function calculateIssueAge(
    createdAt
) {

    if (!createdAt) {
        return 0;
    }


    const created =
        new Date(createdAt);


    if (
        Number.isNaN(
            created.getTime()
        )
    ) {

        return 0;
    }


    return Math.floor(
        Math.max(
            0,
            Date.now() -
                created.getTime()
        ) /
        (1000 * 60 * 60 * 24)
    );
}


// ------------------------------------------------------------
// ISSUE ACTIVITY
// ------------------------------------------------------------

function calculateIssueActivity(
    comments
) {

    const count =
        Number(
            comments || 0
        );


    if (count >= 20) {
        return 8;
    }

    if (count >= 10) {
        return 7;
    }

    if (count >= 5) {
        return 5;
    }

    if (count >= 2) {
        return 3;
    }

    if (count >= 1) {
        return 2;
    }

    return 0;
}


// ------------------------------------------------------------
// DIFFICULTY ESTIMATION
// ------------------------------------------------------------

function estimateDifficulty(
    issue
) {

    const text =
        normalizeText(
            `${issue.title || ""} ${issue.body || ""} ${(issue.labels || []).join(" ")}`
        );


    const labels =
        Array.isArray(issue.labels)
            ? issue.labels.map(
                label =>
                    normalizeText(label)
            )
            : [];


    if (
        labels.includes(
            "good first issue"
        ) ||
        labels.includes(
            "good-first-issue"
        ) ||
        labels.includes(
            "beginner"
        )
    ) {

        return "Beginner";
    }


    if (
        labels.includes(
            "help wanted"
        )
    ) {

        return "Beginner";
    }


    const beginnerWords = [
        "simple",
        "small fix",
        "minor fix",
        "typo",
        "documentation",
        "docs",
        "rename",
        "update readme",
        "good first"
    ];


    const advancedWords = [
        "architecture",
        "redesign",
        "performance optimization",
        "breaking change",
        "distributed",
        "migration",
        "security vulnerability",
        "complex",
        "major refactor"
    ];


    const beginnerMatch =
        beginnerWords.some(
            word =>
                text.includes(
                    word
                )
        );


    if (beginnerMatch) {
        return "Beginner";
    }


    const advancedMatch =
        advancedWords.some(
            word =>
                text.includes(
                    word
                )
        );


    if (advancedMatch) {
        return "Advanced";
    }


    return "Intermediate";
}


// ------------------------------------------------------------
// DIFFICULTY SCORE
// ------------------------------------------------------------

function calculateDifficultyScore(
    estimatedDifficulty,
    preferredDifficulty,
    proficiency
) {

    if (
        !preferredDifficulty &&
        !proficiency
    ) {

        return 7;
    }


    const preferred =
        normalizeText(
            preferredDifficulty
        );


    const level =
        normalizeText(
            proficiency
        );


    const estimated =
        normalizeText(
            estimatedDifficulty
        );


    if (
        preferred &&
        preferred === estimated
    ) {

        return 15;
    }


    if (
        level &&
        level === estimated
    ) {

        return 13;
    }


    if (
        level === "beginner" &&
        estimated === "intermediate"
    ) {

        return 7;
    }


    if (
        level === "intermediate" &&
        estimated === "advanced"
    ) {

        return 7;
    }


    if (
        level === "advanced"
    ) {

        return 12;
    }


    return 5;
}


// ------------------------------------------------------------
// CONTRIBUTION TYPE
// ------------------------------------------------------------

function calculateContributionTypeScore(
    issue,
    contributionType
) {

    if (!contributionType) {
        return 5;
    }


    const desired =
        normalizeText(
            contributionType
        );


    const text =
        normalizeText(
            `${issue.title || ""} ${issue.body || ""} ${(issue.labels || []).join(" ")}`
        );


    if (
        desired === "bug fix"
    ) {

        if (
            text.includes("bug") ||
            text.includes("fix") ||
            text.includes("error") ||
            text.includes("issue")
        ) {

            return 10;
        }
    }


    if (
        desired === "feature"
    ) {

        if (
            text.includes("feature") ||
            text.includes("enhancement") ||
            text.includes("add")
        ) {

            return 10;
        }
    }


    if (
        desired === "documentation"
    ) {

        if (
            text.includes("documentation") ||
            text.includes("docs") ||
            text.includes("readme")
        ) {

            return 10;
        }
    }


    if (
        desired === "testing"
    ) {

        if (
            text.includes("test") ||
            text.includes("testing")
        ) {

            return 10;
        }
    }


    if (
        desired === "refactoring"
    ) {

        if (
            text.includes("refactor") ||
            text.includes("cleanup")
        ) {

            return 10;
        }
    }


    return 3;
}


// ------------------------------------------------------------
// TECHNOLOGY SCORE
// ------------------------------------------------------------

function calculateTechnologyScore(
    issue,
    technology
) {

    if (!technology) {
        return 12;
    }


    const desired =
        normalizeText(
            technology
        );


    const text =
        normalizeText(
            `${issue.title || ""} ${issue.body || ""} ${(issue.labels || []).join(" ")} ${issue.repository || ""}`
        );


    if (
        text.includes(
            desired
        )
    ) {

        return 25;
    }


    return 3;
}


// ------------------------------------------------------------
// AREA SCORE
// ------------------------------------------------------------

function calculateAreaScore(
    issue,
    areaOfInterest
) {

    if (!areaOfInterest) {
        return 5;
    }


    const desired =
        normalizeText(
            areaOfInterest
        );


    const text =
        normalizeText(
            `${issue.title || ""} ${issue.body || ""} ${issue.repository || ""} ${(issue.labels || []).join(" ")}`
        );


    const mappings = {

        "web development": [
            "web",
            "frontend",
            "backend",
            "javascript",
            "typescript",
            "react",
            "node",
            "html",
            "css",
            "api"
        ],

        "machine learning": [
            "machine learning",
            "ml",
            "model",
            "training",
            "dataset",
            "pytorch",
            "tensorflow"
        ],

        "artificial intelligence": [
            "ai",
            "artificial intelligence",
            "llm",
            "language model",
            "generative ai"
        ],

        "data science": [
            "data",
            "analytics",
            "statistics",
            "pandas",
            "numpy",
            "visualization"
        ],

        "devops cloud": [
            "docker",
            "kubernetes",
            "cloud",
            "aws",
            "azure",
            "gcp",
            "ci",
            "cd",
            "devops"
        ],

        "cybersecurity": [
            "security",
            "authentication",
            "authorization",
            "vulnerability",
            "encryption"
        ],

        "mobile development": [
            "android",
            "ios",
            "mobile",
            "flutter",
            "react native"
        ],

        "open source developer tools": [
            "cli",
            "developer tool",
            "open source",
            "github",
            "build",
            "compiler",
            "library"
        ]
    };


    const keywords =
        mappings[desired] || [];


    if (
        keywords.some(
            keyword =>
                text.includes(
                    keyword
                )
        )
    ) {

        return 10;
    }


    return 2;
}


// ------------------------------------------------------------
// LEARNING GOAL SCORE
// ------------------------------------------------------------

function calculateLearningGoalScore(
    issue,
    learningGoal,
    estimatedDifficulty
) {

    if (!learningGoal) {
        return 5;
    }


    const goal =
        normalizeText(
            learningGoal
        );


    if (
        goal ===
        "make first contribution"
    ) {

        const labels =
            Array.isArray(issue.labels)
                ? issue.labels.map(
                    label =>
                        normalizeText(
                            label
                        )
                    )
                : [];


        if (
            labels.includes(
                "good first issue"
            ) ||
            labels.includes(
                "good-first-issue"
            ) ||
            labels.includes(
                "help wanted"
            ) ||
            estimatedDifficulty ===
                "Beginner"
        ) {

            return 10;
        }


        return 4;
    }


    if (
        goal ===
        "learn new technology"
    ) {

        return 8;
    }


    if (
        goal ===
        "improve existing skills"
    ) {

        return 8;
    }


    if (
        goal ===
        "build experience"
    ) {

        return 8;
    }


    if (
        goal ===
        "work on challenging problems"
    ) {

        if (
            estimatedDifficulty ===
            "Advanced"
        ) {

            return 10;
        }


        return 6;
    }


    return 5;
}


// ------------------------------------------------------------
// PROJECT SIZE
// ------------------------------------------------------------

function estimateProjectSize(
    issue
) {

    const text =
        normalizeText(
            `${issue.title || ""} ${issue.body || ""}`
        );


    const bodyLength =
        String(
            issue.body || ""
        ).length;


    const labels =
        Array.isArray(issue.labels)
            ? issue.labels.map(
                label =>
                    normalizeText(
                        label
                    )
                )
            : [];


    const largeWords = [
        "architecture",
        "migration",
        "redesign",
        "major refactor",
        "rewrite",
        "multiple components",
        "breaking change"
    ];


    const smallWords = [
        "typo",
        "documentation",
        "readme",
        "rename",
        "small fix",
        "minor fix",
        "good first issue"
    ];


    if (
        largeWords.some(
            word =>
                text.includes(
                    word
                )
        )
    ) {

        return "Large";
    }


    if (
        smallWords.some(
            word =>
                text.includes(
                    word
                )
        )
    ) {

        return "Small";
    }


    if (
        labels.includes(
            "good first issue"
        ) ||
        labels.includes(
            "good-first-issue"
        )
    ) {

        return "Small";
    }


    if (
        bodyLength > 5000
    ) {

        return "Large";
    }


    if (
        bodyLength < 1000
    ) {

        return "Small";
    }


    return "Medium";
}


// ------------------------------------------------------------
// PROJECT SIZE SCORE
// ------------------------------------------------------------

function calculateProjectSizeScore(
    estimatedSize,
    preferredSize
) {

    if (!preferredSize) {
        return 2;
    }


    if (
        normalizeText(
            estimatedSize
        ) ===
        normalizeText(
            preferredSize
        )
    ) {

        return 5;
    }


    return 1;
}


// ------------------------------------------------------------
// REPOSITORY ACTIVITY
// ------------------------------------------------------------

async function getRepositoryActivity(
    fullName,
    accessToken
) {

    if (
        repositoryCache.has(
            fullName
        )
    ) {

        return repositoryCache.get(
            fullName
        );
    }


    try {

        const response =
            await fetch(
                `https://api.github.com/repos/${fullName}`,
                {
                    headers: {

                        "Accept":
                            "application/vnd.github+json",

                        "User-Agent":
                            "OpenSeek",

                        ...(accessToken
                            ? {
                                "Authorization":
                                    `Bearer ${accessToken}`
                            }
                            : {})
                    }
                }
            );


        if (!response.ok) {

            return {
                stars: 0,
                forks: 0,
                pushedAt: null,
                activityScore: 0
            };
        }


        const repo =
            await response.json();


        const pushedAt =
            repo.pushed_at;


        let activityScore =
            0;


        if (pushedAt) {

            const days =
                Math.max(
                    0,
                    (
                        Date.now() -
                        new Date(
                            pushedAt
                        ).getTime()
                    ) /
                    (
                        1000 *
                        60 *
                        60 *
                        24
                    )
                );


            if (days <= 7) {
                activityScore = 7;
            } else if (days <= 30) {
                activityScore = 6;
            } else if (days <= 90) {
                activityScore = 5;
            } else if (days <= 180) {
                activityScore = 3;
            } else {
                activityScore = 1;
            }
        }


        const result = {

            stars:
                Number(
                    repo.stargazers_count || 0
                ),

            forks:
                Number(
                    repo.forks_count || 0
                ),

            pushedAt:
                pushedAt || null,

            activityScore
        };


        repositoryCache.set(
            fullName,
            result
        );


        return result;

    } catch (error) {

        console.error(
            `Repository lookup failed for ${fullName}:`,
            error.message
        );


        return {
            stars: 0,
            forks: 0,
            pushedAt: null,
            activityScore: 0
        };
    }
}


// ------------------------------------------------------------
// REASONS
// ------------------------------------------------------------

function generateReasons(
    issue,
    scores,
    preferences
) {

    const reasons = [];


    if (
        scores.technology >= 20
    ) {

        reasons.push(
            `Matches your ${preferences.technology} technology preference`
        );
    }


    if (
        scores.difficulty >= 12
    ) {

        reasons.push(
            "Difficulty appears suitable for your selected level"
        );
    }


    if (
        scores.contributionType >= 8
    ) {

        reasons.push(
            "Matches your preferred contribution type"
        );
    }


    if (
        scores.area >= 8
    ) {

        reasons.push(
            "Fits your selected area of interest"
        );
    }


    if (
        scores.learningGoal >= 8
    ) {

        reasons.push(
            "Supports your learning goal"
        );
    }


    if (
        scores.recency >= 8
    ) {

        reasons.push(
            "Recently updated issue"
        );
    }


    if (
        scores.issueActivity >= 5
    ) {

        reasons.push(
            "Issue has active discussion"
        );
    }


    if (
        scores.repositoryActivity >= 5
    ) {

        reasons.push(
            "Repository is actively maintained"
        );
    }


    const labels =
        Array.isArray(issue.labels)
            ? issue.labels.map(
                label =>
                    normalizeText(
                        label
                    )
                )
            : [];


    if (
        labels.includes(
            "good first issue"
        ) ||
        labels.includes(
            "good-first-issue"
        )
    ) {

        reasons.push(
            "Marked as a good first issue"
        );
    }


    if (
        labels.includes(
            "help wanted"
        )
    ) {

        reasons.push(
            "Maintainers are asking for help"
        );
    }


    if (
        reasons.length === 0
    ) {

        reasons.push(
            "Strong overall compatibility"
        );
    }


    return reasons.slice(
        0,
        6
    );
}


// ============================================================
// FALLBACK AI EXPLANATION
// ============================================================

function createFallbackExplanation(
    issue
) {

    const labels =
        Array.isArray(issue.labels)
            ? issue.labels.map(
                label =>
                    normalizeText(
                        label
                    )
                )
            : [];


    const isGoodFirstIssue =
        labels.includes(
            "good first issue"
        ) ||
        labels.includes(
            "good-first-issue"
        );


    const isHelpWanted =
        labels.includes(
            "help wanted"
        );


    let readiness;


    if (
        isGoodFirstIssue
    ) {

        readiness =
            "This issue is marked as a good first issue, so it may be suitable for an early contribution. Still review the repository guidelines before starting.";

    } else if (
        isHelpWanted
    ) {

        readiness =
            "The repository marks this issue as help wanted. Check the issue discussion and required changes before deciding whether it matches your current skills.";

    } else if (
        issue.difficulty ===
        "Beginner"
    ) {

        readiness =
            "OpenSeek estimates this issue as beginner level, but the actual difficulty should be confirmed by reading the issue and repository code.";

    } else if (
        issue.difficulty ===
        "Intermediate"
    ) {

        readiness =
            "OpenSeek estimates this issue as intermediate. Some familiarity with the repository may be needed.";

    } else {

        readiness =
            "This issue may require more understanding of the repository. Read the issue discussion and contribution guidelines before starting.";
    }


    const whatYouNeed = [];


    if (
        issue.difficulty
    ) {

        whatYouNeed.push(
            `${issue.difficulty} level understanding of the relevant code`
        );
    }


    whatYouNeed.push(
        "Familiarity with the technologies used by the issue"
    );


    whatYouNeed.push(
        "Basic GitHub contribution workflow"
    );


    const beforeYouStart = [

        "Read the complete issue description and discussion.",

        "Check the repository README and contribution guidelines.",

        "Make sure the issue is not already assigned or actively being worked on."

    ];


    return {

        summary:
            `This issue is from ${issue.repository}. Review the issue description and GitHub labels carefully to understand the exact change requested.`,

        whatYouWillDo:
            "You would investigate the requested change, understand the existing implementation, and make the necessary contribution.",

        whatYouNeed:
            whatYouNeed.slice(
                0,
                3
            ),

        learningOpportunity:
            "This contribution can help you learn how a real open-source repository organizes issues, code changes, and collaboration.",

        beforeYouStart,

        readinessExplanation:
            readiness
    };
}


// ============================================================
// OPENROUTER AI EXPLANATION
// ============================================================

async function summarizeIssueWithAI(
    issue,
    preferences
) {

    if (
        !process.env.OPENROUTER_API_KEY
    ) {

        console.log(
            "OPENROUTER_API_KEY is missing."
        );

        return createFallbackExplanation(
            issue
        );
    }


    const issueBody =
        String(
            issue.body || ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .slice(
                0,
                3500
            );


    const labels =
        Array.isArray(issue.labels)
            ? issue.labels.join(", ")
            : "";


    const prompt = `
You are explaining a GitHub issue to a beginner developer.

Return ONLY valid JSON.
Do not use markdown.
Do not use code fences.
Keep every answer short.

GitHub issue:

Title:
${issue.title}

Repository:
${issue.repository}

Labels:
${labels}

Difficulty estimate:
${issue.difficulty}

Project size estimate:
${issue.projectSize}

Comments:
${issue.comments}

Stars:
${issue.repositoryStars}

Issue description:
${issueBody || "No detailed description was provided."}

User preferences:

Technology:
${preferences.technology || "Any"}

Proficiency:
${preferences.proficiency || "Any"}

Contribution type:
${preferences.contributionType || "Any"}

Difficulty preference:
${preferences.difficulty || "Any"}

Project size preference:
${preferences.projectSize || "Any"}

Area:
${preferences.areaOfInterest || "Any"}

Learning goal:
${preferences.learningGoal || "Any"}

Return exactly this JSON structure:

{
  "summary": "1-2 short sentences explaining the issue in simple English.",
  "whatYouWillDo": "One short sentence describing the likely contribution.",
  "whatYouNeed": [
    "Requirement 1",
    "Requirement 2",
    "Requirement 3"
  ],
  "learningOpportunity": "One short sentence describing what the contributor can learn.",
  "beforeYouStart": [
    "Step 1",
    "Step 2",
    "Step 3"
  ],
  "readinessExplanation": "One short sentence explaining whether this looks beginner friendly, moderate, or difficult."
}

Rules:

- Maximum 3 items in whatYouNeed.
- Maximum 3 items in beforeYouStart.
- Keep each item short.
- Do not invent facts that are not supported by the issue.
- If something is uncertain, say that it should be checked in the repository.
- Return complete JSON.
`;


    async function makeRequest() {

        try {

            const response =
                await fetch(
                    OPENROUTER_URL,
                    {
                        method:
                            "POST",

                        headers: {

                            "Authorization":
                                `Bearer ${process.env.OPENROUTER_API_KEY}`,

                            "Content-Type":
                                "application/json",

                            "HTTP-Referer":
                                "http://localhost:3000",

                            "X-Title":
                                "OpenSeek"
                        },

                        body:
                            JSON.stringify({

                                model:
                                    OPENROUTER_MODEL,

                                messages: [

                                    {
                                        role:
                                            "system",

                                        content:
                                            "You are the OpenSeek issue explanation assistant. Return valid JSON only."
                                    },

                                    {
                                        role:
                                            "user",

                                        content:
                                            prompt
                                    }

                                ],

                                temperature:
                                    0.1,

                                max_tokens:
                                    900
                            })
                    }
                );


            if (
                !response.ok
            ) {

                const errorText =
                    await response.text();


                console.error(
                    "OpenRouter HTTP error:",
                    response.status,
                    errorText
                );


                return null;
            }


            const result =
                await response.json();


            const content =
                result
                    ?.choices?.[0]
                    ?.message?.content;


            if (
                !content
            ) {

                console.log(
                    `OpenRouter returned no content for "${issue.title}"`
                );

                return null;
            }


            let cleaned;


            if (
                Array.isArray(
                    content
                )
            ) {

                cleaned =
                    content
                        .map(
                            part => {

                                if (
                                    typeof part ===
                                    "string"
                                ) {

                                    return part;
                                }


                                return (
                                    part?.text ||
                                    ""
                                );
                            }
                        )
                        .join("");

            } else {

                cleaned =
                    String(
                        content
                    );
            }


            cleaned =
                cleaned
                    .trim()
                    .replace(
                        /^```json\s*/i,
                        ""
                    )
                    .replace(
                        /^```\s*/i,
                        ""
                    )
                    .replace(
                        /\s*```$/i,
                        ""
                    )
                    .trim();


            const firstBrace =
                cleaned.indexOf(
                    "{"
                );


            const lastBrace =
                cleaned.lastIndexOf(
                    "}"
                );


            if (
                firstBrace === -1 ||
                lastBrace === -1 ||
                lastBrace <= firstBrace
            ) {

                console.log(
                    `Invalid AI JSON for "${issue.title}":`,
                    cleaned
                );

                return null;
            }


            cleaned =
                cleaned.slice(
                    firstBrace,
                    lastBrace + 1
                );


            try {

                const parsed =
                    JSON.parse(
                        cleaned
                    );


                if (
                    !parsed.summary ||
                    !parsed.whatYouWillDo
                ) {

                    console.log(
                        `AI JSON missing required fields for "${issue.title}"`
                    );

                    return null;
                }


                if (
                    !Array.isArray(
                        parsed.whatYouNeed
                    )
                ) {

                    parsed.whatYouNeed =
                        [];
                }


                if (
                    !Array.isArray(
                        parsed.beforeYouStart
                    )
                ) {

                    parsed.beforeYouStart =
                        [];
                }


                console.log(
                    `✓ OpenRouter explanation received for "${issue.title}"`
                );


                return parsed;

            } catch (error) {

                console.log(
                    `Invalid AI JSON for "${issue.title}":`,
                    cleaned
                );

                return null;
            }

        } catch (error) {

            console.error(
                `OpenRouter request failed for "${issue.title}":`,
                error.message
            );


            return null;
        }
    }


    // --------------------------------------------------------
    // FIRST ATTEMPT
    // --------------------------------------------------------

    let explanation =
        await makeRequest();


    // --------------------------------------------------------
    // RETRY
    // --------------------------------------------------------

    if (
        !explanation
    ) {

        console.log(
            `Retrying AI explanation for "${issue.title}"...`
        );


        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    800
                )
        );


        explanation =
            await makeRequest();
    }


    // --------------------------------------------------------
    // FALLBACK
    // --------------------------------------------------------

    if (
        !explanation
    ) {

        console.log(
            `Using fallback explanation for "${issue.title}"`
        );


        return createFallbackExplanation(
            issue
        );
    }


    return explanation;
}


// ============================================================
// GITHUB ISSUE SEARCH
// ============================================================

app.get(
    "/api/issues/search",
    requireAuth,
    async (req, res) => {

        try {

            const {

                technology = "",

                proficiency = "",

                contributionType = "",

                difficulty = "",

                projectSize = "",

                areaOfInterest = "",

                learningGoal = "",

                keywords = ""

            } = req.query;


            console.log(
                "Issue search preferences:",
                {
                    technology,
                    proficiency,
                    contributionType,
                    difficulty,
                    projectSize,
                    areaOfInterest,
                    learningGoal,
                    keywords
                }
            );


            const accessToken =
                req.session.githubAccessToken;


            // ------------------------------------------------
            // BUILD GITHUB SEARCH QUERY
            // ------------------------------------------------

            const queryParts = [
                "is:issue",
                "is:open"
            ];


            if (
                technology
            ) {

                queryParts.push(
                    technology
                );
            }


            if (
                contributionType
            ) {

                if (
                    contributionType ===
                    "Bug Fix"
                ) {

                    queryParts.push(
                        "bug"
                    );

                } else if (
                    contributionType ===
                    "Feature"
                ) {

                    queryParts.push(
                        "enhancement"
                    );

                } else if (
                    contributionType ===
                    "Documentation"
                ) {

                    queryParts.push(
                        "documentation"
                    );

                } else if (
                    contributionType ===
                    "Testing"
                ) {

                    queryParts.push(
                        "test"
                    );

                } else if (
                    contributionType ===
                    "Refactoring"
                ) {

                    queryParts.push(
                        "refactor"
                    );
                }
            }


            if (
                keywords
            ) {

                const keywordList =
                    String(
                        keywords
                    )
                        .split(",")
                        .map(
                            keyword =>
                                keyword.trim()
                        )
                        .filter(Boolean)
                        .slice(
                            0,
                            5
                        );


                queryParts.push(
                    ...keywordList
                );
            }


            const githubQuery =
                queryParts.join(
                    " "
                );


            console.log(
                "GitHub issue query:",
                githubQuery
            );


            // ------------------------------------------------
            // GITHUB SEARCH
            // ------------------------------------------------

            const githubUrl =
                `https://api.github.com/search/issues?q=${encodeURIComponent(githubQuery)}&per_page=30`;


            const response =
                await fetch(
                    githubUrl,
                    {
                        headers: {

                            "Accept":
                                "application/vnd.github+json",

                            "User-Agent":
                                "OpenSeek",

                            ...(accessToken
                                ? {
                                    "Authorization":
                                        `Bearer ${accessToken}`
                                }
                                : {})
                        }
                    }
                );


            if (
                !response.ok
            ) {

                const errorText =
                    await response.text();


                console.error(
                    "GitHub issue search failed:",
                    response.status,
                    errorText
                );


                return res
                    .status(
                        response.status
                    )
                    .json({

                        error:
                            "GitHub issue search failed",

                        details:
                            errorText

                    });
            }


            const data =
                await response.json();


            const issues =
                Array.isArray(
                    data.items
                )
                    ? data.items
                    : [];


            // ------------------------------------------------
            // REPOSITORY INFORMATION
            // ------------------------------------------------

            const repositoryNames =
                [
                    ...new Set(
                        issues
                            .map(
                                issue =>
                                    issue.repository_url
                                        ? issue.repository_url
                                            .replace(
                                                "https://api.github.com/repos/",
                                                ""
                                            )
                                        : null
                            )
                            .filter(Boolean)
                    )
                ];


            const repositoryMap =
                new Map();


            for (
                const repositoryName
                of repositoryNames
            ) {

                const repository =
                    await getRepositoryActivity(
                        repositoryName,
                        accessToken
                    );


                repositoryMap.set(
                    repositoryName,
                    repository
                );
            }


            // ------------------------------------------------
            // SCORE ISSUES
            // ------------------------------------------------

            const scoredIssues =
                issues.map(
                    issue => {

                        const repositoryName =
                            issue.repository_url
                                ? issue.repository_url
                                    .replace(
                                        "https://api.github.com/repos/",
                                        ""
                                    )
                                : issue.repository?.full_name ||
                                  "Unknown repository";


                        const repository =
                            repositoryMap.get(
                                repositoryName
                            ) || {

                                stars: 0,
                                forks: 0,
                                pushedAt: null,
                                activityScore: 0

                            };


                        const issueAge =
                            calculateIssueAge(
                                issue.created_at
                            );


                        const estimatedDifficulty =
                            estimateDifficulty(
                                issue
                            );


                        const estimatedProjectSize =
                            estimateProjectSize(
                                issue
                            );


                        const recency =
                            calculateRecency(
                                issue.updated_at
                            );


                        const issueActivity =
                            calculateIssueActivity(
                                issue.comments
                            );


                        const repositoryActivity =
                            repository.activityScore;


                        const technologyScore =
                            calculateTechnologyScore(
                                issue,
                                technology
                            );


                        const difficultyScore =
                            calculateDifficultyScore(
                                estimatedDifficulty,
                                difficulty,
                                proficiency
                            );


                        const contributionTypeScore =
                            calculateContributionTypeScore(
                                issue,
                                contributionType
                            );


                        const areaScore =
                            calculateAreaScore(
                                issue,
                                areaOfInterest
                            );


                        const learningGoalScore =
                            calculateLearningGoalScore(
                                issue,
                                learningGoal,
                                estimatedDifficulty
                            );


                        const projectSizeScore =
                            calculateProjectSizeScore(
                                estimatedProjectSize,
                                projectSize
                            );


                        const totalScore =
                            technologyScore +
                            difficultyScore +
                            contributionTypeScore +
                            areaScore +
                            learningGoalScore +
                            recency +
                            issueActivity +
                            repositoryActivity +
                            projectSizeScore;


                        const matchScore =
                            Math.min(
                                100,
                                Math.max(
                                    0,
                                    Math.round(
                                        totalScore
                                    )
                                )
                            );


                        const scoreBreakdown = {

                            technology:
                                technologyScore,

                            difficulty:
                                difficultyScore,

                            contributionType:
                                contributionTypeScore,

                            area:
                                areaScore,

                            learningGoal:
                                learningGoalScore,

                            recency:
                                recency,

                            issueActivity:
                                issueActivity,

                            repositoryActivity:
                                repositoryActivity,

                            projectSize:
                                projectSizeScore
                        };


                        const reasons =
                            generateReasons(
                                issue,
                                scoreBreakdown,
                                {
                                    technology,
                                    proficiency,
                                    contributionType,
                                    difficulty,
                                    projectSize,
                                    areaOfInterest,
                                    learningGoal
                                }
                            );


                        const labels =
                            Array.isArray(
                                issue.labels
                            )
                                ? issue.labels
                                    .map(
                                        label =>
                                            typeof label ===
                                            "string"
                                                ? label
                                                : label.name
                                    )
                                    .filter(Boolean)
                                : [];


                        return {

                            title:
                                issue.title,

                            repository:
                                repositoryName,

                            labels,

                            updatedAt:
                                issue.updated_at,

                            createdAt:
                                issue.created_at,

                            issueAge,

                            url:
                                issue.html_url,

                            author:
                                issue.user?.login ||
                                "Unknown",

                            comments:
                                Number(
                                    issue.comments || 0
                                ),

                            difficulty:
                                estimatedDifficulty,

                            projectSize:
                                estimatedProjectSize,

                            repositoryStars:
                                repository.stars,

                            repositoryForks:
                                repository.forks,

                            repositoryLastPush:
                                repository.pushedAt,

                            matchScore,

                            reasons,

                            scoreBreakdown,

                            // Used internally by AI.
                            body:
                                issue.body || ""
                        };
                    }
                );


            // ------------------------------------------------
            // SORT
            // ------------------------------------------------

            scoredIssues.sort(
                (
                    a,
                    b
                ) =>
                    b.matchScore -
                    a.matchScore
            );


            // ------------------------------------------------
            // TOP 5
            // ------------------------------------------------

            const recommendations =
                scoredIssues.slice(
                    0,
                    5
                );


            console.log(
                `Generating AI explanations for ${recommendations.length} recommendations...`
            );


            // ------------------------------------------------
            // AI EXPLANATIONS
            // ------------------------------------------------

            const recommendationsWithAI =
                [];


            for (
                let i = 0;
                i < recommendations.length;
                i++
            ) {

                const issue =
                    recommendations[i];


                console.log(
                    `AI explanation ${i + 1}/${recommendations.length}: "${issue.title}"`
                );


                const aiExplanation =
                    await summarizeIssueWithAI(
                        issue,
                        {

                            technology,

                            proficiency,

                            contributionType,

                            difficulty,

                            projectSize,

                            areaOfInterest,

                            learningGoal

                        }
                    );


                recommendationsWithAI.push({

                    ...issue,

                    aiExplanation

                });
            }


            console.log(
                `Finished AI explanations for ${recommendationsWithAI.length} recommendations.`
            );


            // ------------------------------------------------
            // REMOVE RAW BODY
            // ------------------------------------------------

            const finalRecommendations =
                recommendationsWithAI.map(
                    issue => {

                        const {
                            body,
                            ...safeIssue
                        } = issue;


                        return safeIssue;
                    }
                );


            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            res.json({

                totalCandidates:
                    data.total_count ||
                    0,

                candidatesEvaluated:
                    scoredIssues.length,

                bestMatch:
                    finalRecommendations[0] ||
                    null,

                otherMatches:
                    finalRecommendations.slice(
                        1
                    ),

                recommendations:
                    finalRecommendations

            });

        } catch (error) {

            console.error(
                "Issue search error:",
                error
            );


            res
                .status(500)
                .json({

                    error:
                        "Failed to search and rank GitHub issues",

                    details:
                        error.message

                });
        }
    }
);


// ============================================================
// START SERVER
// ============================================================

async function startServer() {

    try {

        await connectDB();


        app.listen(
            PORT,
            () => {

                console.log(
                    `OpenSeek running at http://localhost:${PORT}`
                );
            }
        );

    } catch (error) {

        console.error(
            "OpenSeek could not start because the database connection failed."
        );

        process.exit(1);
    }
}


startServer();
