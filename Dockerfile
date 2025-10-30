FROM node:20-bookworm-slim

# Copy dependency list into image
COPY apt-packages.txt /tmp/apt-packages.txt

# Install dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive xargs -a /tmp/apt-packages.txt apt-get install -y && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun (system-wide under /usr/local)
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash

# Create non-root user for running the application
RUN useradd -m -d /app c64bridge

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY --chown=c64bridge:c64bridge package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application
COPY --chown=c64bridge:c64bridge . .

# Switch to non-root user
USER c64bridge

# Start the MCP server
CMD ["npm", "start"]
