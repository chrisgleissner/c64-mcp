FROM node:20-bookworm-slim

# Create non-root user for running the application
RUN useradd -m -d /app bridge

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY --chown=bridge:bridge package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application
COPY --chown=bridge:bridge . .

# Switch to non-root user
USER bridge

# Start the MCP server
CMD ["npm", "start"]
