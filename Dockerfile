# Build on the current Node.js release on purpose: every rebuild picks up the latest one.
FROM node:latest

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