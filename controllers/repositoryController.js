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


const getRepositories = async (req, res) => {
    try {

        // Check login
        if (!req.session.user) {
            return res.status(401).json({
                message: "Authentication required"
            });
        }


        // Check GitHub access token
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
         * Get repositories owned by
         * the logged-in GitHub user.
         *
         * We are NOT requesting repository
         * contents here.
         */
        const url =
            `${GITHUB_API}/user/repos` +
            `?sort=updated` +
            `&direction=desc` +
            `&per_page=100` +
            `&affiliation=owner`;


        const repositories =
            await githubRequest(
                url,
                accessToken
            );


        /*
         * Send only the information
         * OpenSeek needs to display
         * repository cards.
         */
        const formattedRepositories =
            repositories.map(repo => ({

                id:
                    repo.id,

                name:
                    repo.name,

                fullName:
                    repo.full_name,

                description:
                    repo.description || "",

                htmlUrl:
                    repo.html_url,

                owner: {
                    login:
                        repo.owner?.login ||
                        username,

                    avatarUrl:
                        repo.owner?.avatar_url ||
                        ""
                },

                private:
                    Boolean(repo.private),

                fork:
                    Boolean(repo.fork),

                defaultBranch:
                    repo.default_branch ||
                    "main",

                language:
                    repo.language ||
                    "Not specified",

                stars:
                    repo.stargazers_count || 0,

                forks:
                    repo.forks_count || 0,

                watchers:
                    repo.watchers_count || 0,

                openIssues:
                    repo.open_issues_count || 0,

                topics:
                    repo.topics || [],

                license:
                    repo.license?.name ||
                    null,

                createdAt:
                    repo.created_at,

                updatedAt:
                    repo.updated_at,

                pushedAt:
                    repo.pushed_at,

                archived:
                    Boolean(repo.archived),

                disabled:
                    Boolean(repo.disabled)

            }));


        res.json({

            username,

            totalRepositories:
                formattedRepositories.length,

            repositories:
                formattedRepositories

        });

    } catch (error) {

        console.error(
            "Failed to load repositories:",
            error
        );

        res.status(500).json({

            message:
                "Failed to load GitHub repositories",

            error:
                error.message

        });
    }
};


module.exports = {
    getRepositories
};
