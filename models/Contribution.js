const mongoose = require("mongoose");

const contributionSchema = new mongoose.Schema(
    {
        // GitHub username of the contributor
        githubUsername: {
            type: String,
            required: true,
            index: true
        },

        // Repository name
        repository: {
            type: String,
            required: true
        },

        // Repository URL
        repositoryUrl: {
            type: String,
            default: ""
        },

        // GitHub Pull Request number
        pullRequestNumber: {
            type: Number,
            required: true
        },

        // Pull Request URL
        pullRequestUrl: {
            type: String,
            required: true
        },

        // Pull Request title
        title: {
            type: String,
            required: true
        },

        // Pull Request description
        description: {
            type: String,
            default: ""
        },

        // GitHub PR state
        state: {
            type: String,
            enum: ["open", "closed"],
            default: "open"
        },

        // OpenSeek-friendly status
        status: {
            type: String,
            enum: ["open", "merged", "closed"],
            default: "open"
        },

        // Whether PR is draft
        draft: {
            type: Boolean,
            default: false
        },

        // GitHub dates
        githubCreatedAt: {
            type: Date,
            default: null
        },

        githubUpdatedAt: {
            type: Date,
            default: null
        },

        githubClosedAt: {
            type: Date,
            default: null
        },

        githubMergedAt: {
            type: Date,
            default: null
        },

        // Code changes
        additions: {
            type: Number,
            default: 0
        },

        deletions: {
            type: Number,
            default: 0
        },

        changedFiles: {
            type: Number,
            default: 0
        },

        // GitHub labels
        labels: {
            type: [String],
            default: []
        },

        // How OpenSeek discovered this contribution
        source: {
            type: String,
            enum: [
                "OpenSeek Recommendation",
                "OpenSeek Search",
                "GitHub Activity"
            ],
            default: "GitHub Activity"
        }
    },

    {
        timestamps: true
    }
);


// Prevent duplicate PR records
contributionSchema.index(
    {
        githubUsername: 1,
        repository: 1,
        pullRequestNumber: 1
    },
    {
        unique: true
    }
);


module.exports = mongoose.model(
    "Contribution",
    contributionSchema
);
