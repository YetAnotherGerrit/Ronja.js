# Use the official Node.js 22-alpine image to build our Docker image.
FROM node:latest

# Set the working directory in the container to /app, which will contain our application files.
WORKDIR /app

# Copy package.json and package-lock.json from the current directory into the container at the specified path.
COPY package*.json ./

# Install dependencies listed in package.json using npm install.
RUN npm install

# Copy the rest of our application code (everything except package.json and package-lock.json) from the current directory into the container at the same path as before.
COPY . .

# Set an environment variable named NODE_ENV with value 'docker' to indicate that this is a Docker build.
ENV NODE_ENV=docker

# Specify the default command to run when the container starts; in this case, we'll run npm start.
CMD ["npm", "start"]