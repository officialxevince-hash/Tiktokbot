# Resource Management Guide

This document explains the resource management system that prevents the bot from overloading your computer.

## Overview

The TikTok bot includes a comprehensive resource management system that:
- Monitors CPU, memory, and disk usage in real-time
- Prevents concurrent heavy operations
- Rate limits video processing
- Automatically cleans up temporary files
- Waits for resources to become available before starting operations
- Provides graceful shutdown on system overload

## Features

### 1. Real-Time Resource Monitoring

The system continuously monitors:
- **CPU Usage**: Percentage of CPU being used
- **Memory Usage**: RAM usage percentage and available memory
- **Disk Usage**: Disk space usage and available free space

### 2. Automatic Throttling

When resources are high:
- Operations wait until resources become available
- Maximum wait time: 5 minutes (configurable)
- Operations are queued to prevent overload

### 3. Rate Limiting

Video processing is rate-limited to prevent too many operations:
- Default: Maximum 2 video processing operations per hour
- Configurable via environment variables

### 4. Process Queue

Only one heavy operation runs at a time by default:
- Prevents multiple video processing operations from running simultaneously
- Ensures system remains responsive

### 5. Memory Management

Automatic cleanup:
- Garbage collection before and after heavy operations
- Temporary file cleanup (files older than 24 hours)
- Periodic cleanup every hour

## Configuration

You can configure resource management via environment variables in your `.env` file:

```env
# Resource Thresholds (percentages)
RESOURCE_CPU_THRESHOLD=85.0        # CPU usage threshold (default: 85%)
RESOURCE_MEMORY_THRESHOLD=85.0     # Memory usage threshold (default: 85%)
RESOURCE_DISK_THRESHOLD=90.0       # Disk usage threshold (default: 90%)

# Concurrency Control
RESOURCE_MAX_CONCURRENT=1          # Max concurrent heavy operations (default: 1)

# Rate Limiting
RESOURCE_RATE_LIMIT=2              # Max video operations per window (default: 2)
RESOURCE_RATE_WINDOW=3600.0        # Time window in seconds (default: 3600 = 1 hour)
```

## Recommended Settings

### For Low-End Systems (4GB RAM, 2 CPU cores)
```env
RESOURCE_CPU_THRESHOLD=70.0
RESOURCE_MEMORY_THRESHOLD=75.0
RESOURCE_DISK_THRESHOLD=85.0
RESOURCE_MAX_CONCURRENT=1
RESOURCE_RATE_LIMIT=1
RESOURCE_RATE_WINDOW=7200.0  # 2 hours
```

### For Mid-Range Systems (8GB RAM, 4 CPU cores)
```env
RESOURCE_CPU_THRESHOLD=80.0
RESOURCE_MEMORY_THRESHOLD=80.0
RESOURCE_DISK_THRESHOLD=90.0
RESOURCE_MAX_CONCURRENT=1
RESOURCE_RATE_LIMIT=2
RESOURCE_RATE_WINDOW=3600.0  # 1 hour
```

### For High-End Systems (16GB+ RAM, 8+ CPU cores)
```env
RESOURCE_CPU_THRESHOLD=85.0
RESOURCE_MEMORY_THRESHOLD=85.0
RESOURCE_DISK_THRESHOLD=90.0
RESOURCE_MAX_CONCURRENT=2
RESOURCE_RATE_LIMIT=3
RESOURCE_RATE_WINDOW=3600.0  # 1 hour
```

## How It Works

### Operation Flow

1. **Check Resources**: Before starting video processing, the system checks if resources are available
2. **Wait if Needed**: If resources are high, the system waits (up to 5 minutes) for resources to become available
3. **Rate Limit Check**: Checks if rate limit allows the operation
4. **Queue Management**: Ensures only allowed number of concurrent operations run
5. **Execute**: Runs the video processing operation
6. **Cleanup**: Performs garbage collection and temp file cleanup after operation

### Resource Monitoring

The system runs a background thread that:
- Checks CPU, memory, and disk usage every 2 seconds
- Updates statistics in real-time
- Provides status information on demand

### Automatic Recovery

If resources become unavailable:
- Operations wait automatically (up to 5 minutes)
- System remains responsive
- Operations resume when resources become available
- No manual intervention needed

## Monitoring

The bot prints resource status:
- Before each video generation
- During resource waits
- Periodically during operation

Example output:
```
[Resource Monitor] CPU: 45.2%, Memory: 62.3% (4.8GB used, 2.9GB available), Disk: 34.1% (156.2GB free)
[Resource Manager] Active operations: 1, Rate limit OK: True, Resources available: True
```

## Troubleshooting

### Bot is Waiting Too Long

If the bot frequently waits for resources:
1. Check your system resources: `top` (Linux/Mac) or Task Manager (Windows)
2. Lower the thresholds in `.env` file
3. Reduce `RESOURCE_RATE_LIMIT` to process fewer videos
4. Close other resource-intensive applications

### System Still Overloads

If your system still overloads:
1. Lower all thresholds by 10-15%
2. Set `RESOURCE_MAX_CONCURRENT=1` (only one operation at a time)
3. Increase `RESOURCE_RATE_WINDOW` to allow fewer operations per time period
4. Consider upgrading hardware or using a more powerful machine

### Memory Issues

If you see memory errors:
1. Lower `RESOURCE_MEMORY_THRESHOLD` to 70-75%
2. Ensure temp directory has enough space
3. Check for memory leaks in other applications
4. Restart the bot periodically

## Best Practices

1. **Monitor Regularly**: Check resource status periodically
2. **Adjust Settings**: Tune thresholds based on your system's capabilities
3. **Clean Temp Files**: The system does this automatically, but you can manually clean `./temp` if needed
4. **Don't Override**: Avoid setting thresholds too high - the defaults are safe
5. **Test Settings**: Start with conservative settings and increase gradually

## Emergency Shutdown

The system handles shutdown gracefully:
- Press `Ctrl+C` to stop the bot
- The system will:
  - Stop resource monitoring
  - Clean up temporary files
  - Close all operations cleanly
  - Exit gracefully

## Technical Details

### Components

- **ResourceMonitor**: Monitors CPU, memory, disk usage
- **ProcessQueue**: Manages concurrent operations
- **RateLimiter**: Limits operations per time window
- **MemoryManager**: Handles garbage collection and cleanup
- **ResourceManager**: Coordinates all components

### Thread Safety

All components are thread-safe and can be used from multiple threads safely.

### Performance Impact

Resource monitoring has minimal performance impact:
- CPU: < 0.1% overhead
- Memory: < 10MB overhead
- Disk: No overhead (read-only checks)

## Support

If you encounter issues with resource management:
1. Check the logs for resource status messages
2. Verify your `.env` configuration
3. Test with default settings first
4. Report issues with system specifications



