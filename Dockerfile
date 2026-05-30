# Use the official Node.js 22-alpine image to build our Docker image.
FROM node:latest

# Set the working directory in the container to /app, which will contain our application files.
WORKDIR /app

# Copy package metadata and lockfile if present.
COPY package*.json ./

# Install only production dependencies with npm.
RUN npm install --omit=dev

# Copy the rest of our application code into the container.
COPY . .

# Set an environment variable named NODE_ENV with value 'docker' to indicate that this is a Docker build.
ENV NODE_ENV=docker

# Specify the default command to run when the container starts.
CMD ["npm", "start"]