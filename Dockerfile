FROM ubuntu:24.04

# Copy dependency list into image
COPY apt-packages.txt /tmp/apt-packages.txt

# Install dependencies
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive xargs -a /tmp/apt-packages.txt apt-get install -y && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Bun (system-wide under /usr/local)
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash    

WORKDIR /app
