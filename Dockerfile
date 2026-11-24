# Build on a Node.js LTS line. The tag still moves within it, so every rebuild picks up
# the line's latest patch release (the published image is rebuilt weekly for that).
FROM node:26

# Links the image published on ghcr.io to this repository.
LABEL org.opencontainers.image.source=https://github.com/YetAnotherGerrit/Ronja.js
LABEL org.opencontainers.image.description="Ronja.js, a Discord bot for a circle of friends' gaming community"
LABEL org.opencontainers.image.licenses=GPL-3.0-only

# Set the working directory in the container to /app, which will contain our application files.
WORKDIR /app

# Copy package metadata and lockfile if present.
COPY package*.json ./

# Install only production dependencies with npm.
RUN npm install --omit=dev

# Copy the rest of our application code into the container.
COPY . .

# Explicitly pin the environment, even though "production" is also the app's default when unset.
ENV NODE_ENV=production

# Run node directly rather than npm start: npm can delay or swallow the SIGTERM
# that docker compose stop sends, so Ronja wouldn't get to shut down cleanly.
CMD ["node", "index.js"]