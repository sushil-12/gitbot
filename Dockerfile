# Use official Node.js 18 image
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose the port (Render sets $PORT)
EXPOSE 3000

# Start the server
CMD [ "npm", "start" ] 