const User = require("../models/User");

const saveUser = async (req, res) => {
    try {
        const user = await User.findOneAndUpdate(
            {
                githubUsername: req.body.githubUsername
            },
            req.body,
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true
            }
        );

        res.status(200).json({
            message: "User profile saved successfully",
            user
        });

    } catch (error) {
        console.error("Failed to save user:", error);

        res.status(500).json({
            message: "Failed to save user profile",
            error: error.message
        });
    }
};

module.exports = {
    saveUser
};
