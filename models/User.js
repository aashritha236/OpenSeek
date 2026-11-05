const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },

        githubUsername: {
            type: String,
            required: true,
            unique: true
        },

        // About You
        bio: {
            type: String,
            default: ""
        },

        portfolio: {
            type: String,
            default: ""
        },

        linkedin: {
            type: String,
            default: ""
        },

        // Technical Skills
        skills: {
            type: [String],
            default: []
        },

        frameworks: {
            type: [String],
            default: []
        },

        databases: {
            type: [String],
            default: []
        },

        tools: {
            type: [String],
            default: []
        },

        concepts: {
            type: [String],
            default: []
        },

        experience: {
            type: String,
            default: ""
        },

        // Contribution Preferences
        preferredTechnologies: {
            type: [String],
            default: []
        },

        contributionTypes: {
            type: [String],
            default: []
        },

        preferredDifficulty: {
            type: String,
            default: ""
        },

        preferredProjectSize: {
            type: String,
            default: ""
        },

        availableTime: {
            type: String,
            default: ""
        },

        // Learning & Growth
        learningSkills: {
            type: [String],
            default: []
        },

        goal: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);
