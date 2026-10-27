
require("dotenv").config();

const connectDB = require("./database");
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: false, // Local development only
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    next();
}

// Allow public pages, but serve the profile only after authentication
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/profile.html", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }

    res.sendFile(path.join(__dirname, "public", "profile.html"));
});


// Step 1: Redirect the user to GitHub
app.get("/auth/github", (req, res) => {
    const state = crypto.randomBytes(32).toString("hex");

    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
        scope: "read:user user:email",
        state
    });

    res.redirect(
        `https://github.com/login/oauth/authorize?${params}`
    );
});

// Step 2: GitHub redirects back here
app.get("/auth/github/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        return res.status(400).send("GitHub authorization was cancelled or denied.");
    }

    if (
        !code ||
        !state ||
        !req.session.oauthState ||
        state !== req.session.oauthState
    ) {
        return res.status(400).send("Invalid OAuth state. Please try logging in again.");
    }

    delete req.session.oauthState;

    try {
        // Exchange the authorization code for an access token
        const tokenResponse = await fetch(
            "https://github.com/login/oauth/access_token",
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    client_id: process.env.GITHUB_CLIENT_ID,
                    client_secret: process.env.GITHUB_CLIENT_SECRET,
                    code,
                    redirect_uri: process.env.GITHUB_CALLBACK_URL
                })
            }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
            console.error("GitHub token exchange failed:", tokenData.error);
            return res.status(401).send("Could not complete GitHub login.");
        }

        // Retrieve the authenticated user's GitHub profile
        const userResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });

        if (!userResponse.ok) {
            return res.status(401).send("Could not retrieve your GitHub profile.");
        }

        const githubUser = await userResponse.json();

        // Create a fresh session after successful authentication
        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).send("Could not create your login session.");
            }

            req.session.user = {
                id: githubUser.id,
                username: githubUser.login,
                name: githubUser.name,
                avatarUrl: githubUser.avatar_url,
                profileUrl: githubUser.html_url
            };

            // Keep the token on the server for future GitHub API features
            req.session.githubAccessToken = tokenData.access_token;

            req.session.save((saveError) => {
                if (saveError) {
                    return res.status(500).send("Could not save your login session.");
                }

                res.redirect("/profile.html");
            });
        });
    } catch (err) {
        console.error("GitHub OAuth error:", err.message);
        res.status(500).send("An error occurred during GitHub login.");
    }
});

// Check the current login
app.get("/api/me", requireAuth, (req, res) => {
    res.json(req.session.user);
});

// Log out
app.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Could not log out.");
        }

        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

// Test route
app.get("/test", (req, res) => {
    res.send("OpenSeek server is running!");
});

async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`OpenSeek running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("OpenSeek could not start because the database connection failed.");
        process.exit(1);
    }
}

startServer();