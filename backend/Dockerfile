# Dockerfile for Backend
FROM node:20-slim

# Create app directory
WORKDIRapp

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# /usr/src/ Install production dependencies only
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
