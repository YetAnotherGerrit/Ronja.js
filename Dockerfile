# Use the official Node.js 22-alpine image to build our Docker image.
FROM node:latest

# Set the working directory in the container to /app, which will contain our application files.
WORKDIR /app

# Copy package metadata, lockfile if present, and .npmrc (which omits devDependencies
# by default).
COPY package*.json .npmrc ./

# Install only production dependencies with npm.
RUN npm install

# Copy the rest of our application code into the container.
COPY . .

# Explicitly pin the environment, even though "production" is also the app's default when unset.
ENV NODE_ENV=production

# Specify the default command to run when the container starts.
CMD ["npm", "start"]