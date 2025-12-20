# Build stage
FROM rust:1.70 as builder

WORKDIR /app

# Copy manifest files
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /app/uploads /app/clips

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/video-clipper-backend /usr/local/bin/

# Set environment variables
ENV UPLOAD_DIR=/app/uploads
ENV OUTPUT_DIR=/app/clips
ENV MAX_CONCURRENT_CLIPS=3

# Expose port
EXPOSE 3000

# Run server
CMD ["video-clipper-backend"]

