# TikTokAI

An automated system for generating and publishing AI-powered TikTok videos with beat-synced music videos.

## Overview

TikTokAI is a Python-based tool that automates the creation and publication of TikTok videos using AI technologies. The system includes:

- **Music Video Bot**: Creates beat-synced music videos from local clips and music files
- **AI-powered content generation** using GPT/Gemini
- **Automatic video creation and editing** with visual effects
- **Music addition and audio processing** with beat detection
- **TikTok upload automation** with session management

## Features

### Music Video Bot
- 🎵 Beat-synced video editing using librosa for beat detection
- 🎬 Automatic video segment selection and synchronization
- ✨ Visual effects (zoom, flash, RGB shift, prism, jump cuts, etc.)
- 🎞️ Support for multiple video clips and music files
- 📤 Automatic TikTok upload with metadata generation
- 🛡️ **Resource Management**: Prevents system overload with automatic throttling and monitoring

### General Features
- AI-powered content generation using GPT/Gemini
- Automatic video assembly and editing
- Custom transitions and effects
- Music addition and synchronization
- TikTok upload automation
- Image and video search capabilities

## Prerequisites

- **Python 3.8+** (Python 3.12 recommended)
- **FFmpeg** - Required for video processing
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **Node.js 14+** - Required for TikTok signature generation
- **bun** - JavaScript runtime (will be auto-installed by run.sh)
- **TikTok account** - For uploading videos

## Quick Start

### Easy Setup (Recommended)

1. **Clone the repository:**
```bash
git clone https://github.com/jongan69/tiktokai.git
cd tiktokai
```

2. **Run the setup script:**
```bash
./run.sh
```

The `run.sh` script will:
- ✅ Create a Python virtual environment
- ✅ Install all Python dependencies
- ✅ Install Node.js dependencies (using bun)
- ✅ Check for TikTok login and prompt if needed
- ✅ Run the music video bot

### Manual Setup

1. **Create virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

3. **Install Node.js dependencies:**
```bash
cd tiktok_uploader/tiktok-signature
bun install  # or npm install
cd ../..
```

4. **Set up environment variables:**
   - Create a `.env` file in the project root
   - Add your TikTok username:
   ```
   TIKTOK_USERNAME=your_username_here
   ```
   - Optional: Add API keys for GPT metadata generation:
   ```
   OPENAI_API_KEY=your_openai_key_here
   GOOGLE_API_KEY=your_google_key_here
   ```

5. **Login to TikTok:**
```bash
python3 login.py
```

6. **Prepare your media:**
   - Add video clips to the `./clips` directory
   - Add music files to the `./music` directory

7. **Run the bot:**
```bash
python3 music_video_bot.py
```

## Configuration

### Environment Variables (.env)

Create a `.env` file in the project root:

```env
# Required
TIKTOK_USERNAME=your_username_here

# Optional - for AI metadata generation
OPENAI_API_KEY=your_openai_key_here
GOOGLE_API_KEY=your_google_key_here

# Optional - Viral optimization features
USE_VIRAL_OPTIMIZATION=true
OPTIMAL_POSTING_TIME=true

# Optional - Resource Management (prevents system overload)
# See RESOURCE_MANAGEMENT.md for detailed configuration
RESOURCE_CPU_THRESHOLD=85.0        # CPU usage threshold (%)
RESOURCE_MEMORY_THRESHOLD=85.0      # Memory usage threshold (%)
RESOURCE_DISK_THRESHOLD=90.0       # Disk usage threshold (%)
RESOURCE_MAX_CONCURRENT=1          # Max concurrent operations
RESOURCE_RATE_LIMIT=2              # Max video operations per hour
RESOURCE_RATE_WINDOW=3600.0        # Rate limit window (seconds)
```

### Directory Structure

```
tiktokai/
├── clips/              # Place your video clips here (.mp4, .mov, etc.)
├── music/              # Place your music files here (.mp3, .wav, etc.)
├── output/             # Generated videos are saved here
├── temp/               # Temporary files (auto-cleaned)
├── CookiesDir/         # TikTok session cookies
├── videogen/           # Video generation modules
│   ├── music_video.py  # Beat-synced music video creation
│   ├── beat_detection.py  # Audio beat detection
│   ├── video_effects.py   # Visual effects
│   ├── video.py        # General video generation
│   ├── gpt.py          # GPT integration
│   └── addMusic.py     # Music processing
├── tiktok_uploader/    # TikTok upload automation
├── music_video_bot.py  # Main music video bot
├── login.py            # TikTok authentication
├── run.sh              # Automated setup and run script
└── requirements.txt    # Python dependencies
```

## Usage

### Music Video Bot

The music video bot creates beat-synced videos from your local clips and music:

1. **Add media files:**
   - Place video clips in `./clips/` (supports .mp4, .mov, .avi, .mkv)
   - Place music files in `./music/` (supports .mp3, .wav, .m4a, .ogg, .flac)

2. **Run the bot:**
```bash
./run.sh
# or
python3 music_video_bot.py
```

3. **The bot will:**
   - Detect beats in the selected music file
   - Create video segments synced to beats
   - Apply visual effects randomly
   - Generate TikTok metadata
   - Upload to TikTok automatically

### Manual Login

If you need to login manually or update your session:

```bash
python3 login.py
# or with specific username
python3 login.py -n your_username
```

## Features in Detail

### Beat Detection
- Uses librosa for accurate beat detection
- Automatically syncs video cuts to music beats
- Supports BPM detection and beat interval calculation

### Visual Effects
- **Zoom**: Smooth zoom-in effects
- **Flash**: White flash transitions
- **RGB Shift**: Chromatic aberration effect
- **Prism**: Glitch/prism distortion
- **Jump Cuts**: Rapid cuts with time skips
- **Fast Cuts**: Very short clip segments

### Video Processing
- Automatic aspect ratio correction (9:16 for TikTok)
- Resize to 1080x1920 (TikTok standard)
- Frame rate normalization (30fps)
- Audio synchronization

## Project Structure

```
tiktokai/
├── videogen/
│   ├── music_video.py      # Beat-synced music video creation
│   ├── beat_detection.py   # Audio beat detection (librosa)
│   ├── video_effects.py    # Visual effects library
│   ├── video.py            # General video generation
│   ├── gpt.py              # GPT/Gemini integration
│   ├── search.py           # Image/video search
│   └── addMusic.py         # Music processing
├── tiktok_uploader/
│   ├── tiktok.py           # TikTok upload API
│   ├── Browser.py           # Browser automation
│   ├── cookies.py           # Session management
│   └── tiktok-signature/   # Signature generation (Node.js)
├── music_video_bot.py      # Main music video bot
├── lock_facts_bot.py       # Alternative bot (fact videos)
├── login.py                # TikTok authentication
├── run.sh                  # Automated setup script
└── requirements.txt        # Python dependencies
```

## Troubleshooting

### Common Issues

**"No module named 'distutils'"**
- Install setuptools: `pip install setuptools>=65.0.0`
- This is required for Python 3.12+

**"FFmpeg not found"**
- Install FFmpeg for your platform (see Prerequisites)

**"No cookie with TikTok session id found"**
- Run `python3 login.py` to authenticate
- Or let `run.sh` handle it automatically

**"Video has no audio"**
- Ensure music files are in `./music/` directory
- Check that audio codec is supported (MP3, WAV, M4A)

**"bun not found"**
- The script will auto-install bun, or install manually: `curl -fsSL https://bun.sh/install | bash`

**"System overloads or crashes"**
- The bot includes automatic resource management to prevent overload
- See "Resource Management" section below for configuration options
- Lower resource thresholds in `.env` if your system is struggling
- The bot will automatically wait for resources to become available
- See "Critical System Crash Fixes" section for details on memory optimizations

## Viral Optimization Guide

This section explains all the optimization strategies implemented to maximize your videos' viral potential on TikTok.

### Quick Start

Enable viral optimization by setting these environment variables in your `.env` file:

```env
USE_VIRAL_OPTIMIZATION=true
OPTIMAL_POSTING_TIME=true
```

### Optimization Strategies

#### 1. Metadata Optimization

**Titles**
- **Hook Patterns**: Uses proven TikTok hook patterns like "POV:", "Wait for it...", "This hits different"
- **Emoji Usage**: Strategically places 1-2 emojis for visual appeal
- **Length**: Optimized to 5-10 words for maximum impact
- **Examples**:
  - "POV: This [song] edit hits different 🔥"
  - "Wait for the beat drop in [song] 🎵"
  - "This sync is so satisfying ✨"

**Descriptions**
- **Call-to-Actions**: Includes engagement CTAs like:
  - "Drop a 🔥 if this hits!"
  - "Comment your favorite part!"
  - "Save this for later!"
  - "Tag someone who needs to see this!"
- **Structure**: Hook → CTA → Context
- **Length**: Under 150 characters for optimal engagement

**Hashtags Strategy**
The system uses a strategic hashtag mix:
- **30% Engagement Hashtags**: `#fyp`, `#foryou`, `#viral`, `#trending`, `#fypシ`
- **30% Niche Hashtags**: Music-specific tags like `#music`, `#edit`, `#beatsync`
- **20% Quality/Emotion**: `#satisfying`, `#aesthetic`, `#hd`, `#cinematic`
- **20% Trending**: Currently trending hashtags (when available)

**Total**: 15-20 hashtags (TikTok allows up to 100 characters)

#### 2. Video Content Optimization

**Hook Phase (First 3 Seconds)**
The first 3 seconds are critical for retention. The system optimizes:
- **Maximum Effect Intensity**: 1.5x normal intensity
- **Preferred Effects**: Flash and zoom (most attention-grabbing)
- **Fast Pacing**: High cut frequency
- **Visual Impact**: Bright colors, strong transitions

**Build Phase (Middle Section)**
- **Varied Pacing**: Mixes fast and slow moments
- **Normal Intensity**: Standard effect application
- **Tension Building**: Gradual intensity increase

**Finish Phase (Last 10%)**
- **Strong Ending**: High intensity effects
- **Memorable Close**: Zoom or flash effects
- **Call-to-Action Visual**: Prepares for engagement

#### 3. Timing Optimization

**Optimal Posting Times**
Based on TikTok engagement research, optimal posting times are:

**Weekdays (Monday-Friday)**:
- Morning: 6-10 AM (user's local time)
- Evening: 7-9 PM (user's local time)

**Weekends (Saturday-Sunday)**:
- Morning: 7-10 AM
- Evening: 7-10 PM

The system automatically calculates the next optimal posting time and schedules your video accordingly.

**Time Zone Considerations**
- Currently uses UTC - adjust in `viral_optimizer.py` for your timezone
- Adds random 0-30 minute offset to avoid pattern detection

#### 4. Engagement Settings

For maximum viral potential, the system enables:
- ✅ **Comments**: Enabled (allows discussion)
- ✅ **Duets**: Enabled (allows remixes - increases reach)
- ✅ **Stitches**: Enabled (allows responses - increases reach)

These settings maximize the chance of your video being remixed or responded to, which significantly increases reach.

#### 5. Visual Effects Strategy

**Effect Selection by Phase**

**Hook Phase**:
- Flash (0.08s duration - longer for impact)
- Zoom (1.3x factor - more dramatic)
- Prism (0.5 intensity - stronger effect)

**Build Phase**:
- Balanced mix of all effects
- Standard intensities
- Varied pacing

**Finish Phase**:
- Zoom and flash prioritized
- High intensity for memorable close

#### 6. Thumbnail Optimization

- Selects frames from moments with effects (flash, zoom, prism)
- Prefers frames from first 30% of video
- Avoids first frame (often less interesting)
- Creates visually striking thumbnails that stand out in feeds

### AI-Powered Optimization

When API keys are available, the system uses AI to generate:
1. **Viral-Optimized Titles**: AI generates titles using proven hook patterns
2. **Engaging Descriptions**: AI creates descriptions with CTAs
3. **Strategic Hashtags**: AI selects hashtags based on trending patterns

**Supported AI Models**:
- **OpenAI GPT** (via `OPENAI_API_KEY`)
- **Google Gemini** (via `GOOGLE_API_KEY`)
- **g4f** (free GPT alternative)

### Performance Tracking

**Metrics to Monitor**:
1. **Watch Time**: First 3 seconds are critical
2. **Completion Rate**: Full video views
3. **Engagement Rate**: Likes, comments, shares
4. **Duet/Stitch Count**: Remix engagement
5. **Hashtag Performance**: Which hashtags drive views

**A/B Testing Recommendations**:
Test different strategies:
- **Title Variations**: Test different hook patterns
- **Hashtag Mixes**: Test different hashtag combinations
- **Posting Times**: Test different time slots
- **Effect Intensities**: Test different visual styles

### Customization

You can customize optimization strategies in `videogen/viral_optimizer.py`:
- **Hashtag Categories**: Modify `VIRAL_HASHTAG_CATEGORIES`
- **Posting Times**: Adjust `OPTIMAL_POSTING_HOURS`
- **Hook Patterns**: Update `HOOK_PATTERNS`
- **Effect Intensities**: Modify phase-based intensity multipliers

### Best Practices

1. **Consistency**: Post regularly at optimal times
2. **Quality**: Use high-quality clips and music
3. **Trending Music**: Use currently trending songs when possible
4. **Engagement**: Respond to comments quickly
5. **Experimentation**: Test different strategies and analyze results
6. **Patience**: Viral growth takes time - focus on consistent improvement

### Advanced Tips

**Music Selection**:
- Use trending songs from TikTok's music library
- Match music genre to your clip style
- Consider BPM - faster songs often perform better

**Clip Selection**:
- Use visually interesting clips
- Ensure good lighting and composition
- Avoid clips with text overlays (unless intentional)

**Hashtag Research**:
- Monitor trending hashtags in your niche
- Use a mix of large and niche hashtags
- Update hashtag lists regularly

**Timing Refinement**:
- Track when your audience is most active
- Adjust posting times based on your analytics
- Consider timezone of your target audience

### Important Notes

1. **TikTok's Algorithm**: The algorithm changes frequently - stay updated
2. **Authenticity**: While optimization helps, authentic content performs best
3. **Copyright**: Ensure you have rights to all music and clips used
4. **Terms of Service**: Always comply with TikTok's ToS
5. **Rate Limiting**: Don't post too frequently (risk of shadowban)

**Remember**: Going viral is a combination of optimization, quality content, timing, and luck. Focus on consistent improvement and engagement with your audience!

## Scheduling Notes

### Current Status

**Scheduling is currently unreliable** - TikTok's API returns "Invalid parameters" error when `schedule_time` is included in the upload payload.

### Behavior

When scheduling fails:
1. System detects "Invalid parameters" error (status_code: 5)
2. Automatically removes `schedule_time` from payload
3. Retries upload without scheduling
4. Video uploads successfully as immediate post

### Implementation Details

**Schedule Time Format**:
- **Input**: Relative seconds from now (e.g., 18063 = ~5 hours)
- **Validation**: Must be between 900 (15 min) and 864000 (10 days)
- **Conversion**: `scheduled_timestamp = schedule_time + int(time.time())`
- **Storage**: Added to `data["feature_common_info_list"][0]["schedule_time"]`

**Code Flow**:
```python
# 1. Validate schedule_time (900-864000 seconds)
if schedule_time and (schedule_time > 864000 or schedule_time < 900):
    return False

# 2. Convert to absolute timestamp
scheduled_timestamp = int(schedule_time) + int(time.time())

# 3. Add to data payload
data["feature_common_info_list"][0]["schedule_time"] = scheduled_timestamp

# 4. Upload attempt
# If "Invalid parameters" error:
#   - Remove schedule_time
#   - Retry without scheduling
```

### Possible Causes

1. **API Changes**: TikTok may have changed their scheduling API requirements
2. **Missing Parameters**: Scheduling might require additional fields not in reference code
3. **Signature Issues**: Signature generation might need to account for schedule_time
4. **Account Limitations**: Some accounts may not have scheduling enabled
5. **API Endpoint**: The endpoint `/tiktok/web/project/post/v1/` might not support scheduling

### Workarounds

**Option 1: Disable Scheduling (Current)**
- Set `OPTIMAL_POSTING_TIME=false` in `.env`
- Videos post immediately
- Reliable but loses timing optimization

**Option 2: Manual Scheduling**
- Generate videos with optimal timing
- Upload manually via TikTok app/web interface
- Schedule through TikTok's native interface

**Option 3: External Scheduler (Recommended)**
- Use cron/scheduled tasks to run bot at optimal times
- Bot posts immediately when run
- More reliable than API scheduling

Example cron setup:
```bash
# Post at 6 AM and 7 PM daily
0 6,19 * * * cd /path/to/tiktokai && ./run.sh
```

### Current Recommendation

**Use Option 3 (External Scheduler)**:
- Disable `OPTIMAL_POSTING_TIME` in `.env`
- Set up cron job to run bot at optimal posting times
- More reliable than relying on TikTok's scheduling API

## Resource Management

The bot includes a comprehensive resource management system that prevents system overload and crashes.

### Overview

The resource management system:
- Monitors CPU, memory, and disk usage in real-time
- Prevents concurrent heavy operations
- Rate limits video processing
- Automatically cleans up temporary files
- Waits for resources to become available before starting operations
- Provides graceful shutdown on system overload

### Features

**Real-Time Resource Monitoring**
- Continuously monitors CPU, memory, and disk usage
- Updates every 2 seconds
- Provides status information on demand

**Automatic Throttling**
- Operations wait until resources become available
- Maximum wait time: 5 minutes (configurable)
- Operations are queued to prevent overload

**Rate Limiting**
- Default: Maximum 2 video processing operations per hour
- Configurable via environment variables

**Process Queue**
- Only one heavy operation runs at a time by default
- Prevents multiple video processing operations from running simultaneously
- Ensures system remains responsive

**Memory Management**
- Automatic cleanup of temporary files (files older than 24 hours)
- Garbage collection before and after heavy operations
- Periodic cleanup every hour

### Configuration

Configure resource management via environment variables in your `.env` file:

```env
# Resource Thresholds (percentages)
RESOURCE_CPU_THRESHOLD=75.0        # CPU usage threshold (default: 75%)
RESOURCE_MEMORY_THRESHOLD=80.0      # Memory usage threshold (default: 80%)
RESOURCE_DISK_THRESHOLD=85.0       # Disk usage threshold (default: 85%)

# Concurrency Control
RESOURCE_MAX_CONCURRENT=1          # Max concurrent heavy operations (default: 1)

# Rate Limiting
RESOURCE_RATE_LIMIT=1              # Max video operations per window (default: 1)
RESOURCE_RATE_WINDOW=3600.0        # Time window in seconds (default: 3600 = 1 hour)
```

### Recommended Settings

**For Low-End Systems (4GB RAM, 2 CPU cores)**
```env
RESOURCE_CPU_THRESHOLD=70.0
RESOURCE_MEMORY_THRESHOLD=75.0
RESOURCE_DISK_THRESHOLD=85.0
RESOURCE_MAX_CONCURRENT=1
RESOURCE_RATE_LIMIT=1
RESOURCE_RATE_WINDOW=7200.0  # 2 hours
```

**For Mid-Range Systems (8GB RAM, 4 CPU cores)**
```env
RESOURCE_CPU_THRESHOLD=75.0
RESOURCE_MEMORY_THRESHOLD=80.0
RESOURCE_DISK_THRESHOLD=85.0
RESOURCE_MAX_CONCURRENT=1
RESOURCE_RATE_LIMIT=1
RESOURCE_RATE_WINDOW=3600.0  # 1 hour
```

**For High-End Systems (16GB+ RAM, 8+ CPU cores)**
```env
RESOURCE_CPU_THRESHOLD=85.0
RESOURCE_MEMORY_THRESHOLD=85.0
RESOURCE_DISK_THRESHOLD=90.0
RESOURCE_MAX_CONCURRENT=2
RESOURCE_RATE_LIMIT=3
RESOURCE_RATE_WINDOW=3600.0  # 1 hour
```

### Monitoring

The bot prints resource status:
- Before each video generation
- During resource waits
- Periodically during operation

Example output:
```
[Resource Monitor] CPU: 45.2%, Memory: 62.3% (4.8GB used, 2.9GB available), Disk: 34.1% (156.2GB free)
[Resource Manager] Active operations: 1, Rate limit OK: True, Resources available: True
```

### Troubleshooting

**Bot is Waiting Too Long**
1. Check your system resources: `top` (Linux/Mac) or Task Manager (Windows)
2. Lower the thresholds in `.env` file
3. Reduce `RESOURCE_RATE_LIMIT` to process fewer videos
4. Close other resource-intensive applications

**System Still Overloads**
1. Lower all thresholds by 10-15%
2. Set `RESOURCE_MAX_CONCURRENT=1` (only one operation at a time)
3. Increase `RESOURCE_RATE_WINDOW` to allow fewer operations per time period
4. Consider upgrading hardware or using a more powerful machine

**Memory Issues**
1. Lower `RESOURCE_MEMORY_THRESHOLD` to 70-75%
2. Ensure temp directory has enough space
3. Check for memory leaks in other applications
4. Restart the bot periodically

## Critical System Crash Fixes

This section details critical memory optimizations implemented to prevent system crashes when processing large clips (4K videos, many clips).

### Key Fixes

**1. 4K Video Processing at Full Resolution** ⚠️ CRITICAL
- **Problem**: Code was processing 3840x2160 videos at full resolution before downscaling
- **Memory Impact**: ~9 GB per clip
- **Fix**: Downscale to 1920x1080 FIRST before any operations
- **Result**: 95% memory reduction (from ~9GB to ~450MB per clip)

**2. Rotation Before Downscaling** ⚠️ CRITICAL
- **Problem**: Rotation happened on full 4K frames
- **Memory Impact**: 3-4 GB memory spike per rotated clip
- **Fix**: Rotation now happens AFTER downscaling
- **Result**: Eliminates 3-4 GB memory spike

**3. Preprocessing Loading Entire Videos** ⚠️ CRITICAL
- **Problem**: Entire large videos (4GB+) loaded into memory
- **Memory Impact**: 4GB+ sustained RAM usage
- **Fix**: Use `ffprobe` for metadata, load only when extracting segments
- **Result**: Memory reduced from 4GB to ~100MB per segment

**4. Segment Accumulation** ⚠️ HIGH
- **Problem**: All segments kept in memory until concatenation
- **Memory Impact**: 7-14 GB for 144 segments
- **Fix**: Chunked concatenation (process in groups of 50)
- **Result**: Peak memory reduced to 2-3GB

**5. Clip Cache Too Large** ⚠️ MEDIUM
- **Problem**: Cache kept 5 prepared clips in memory
- **Memory Impact**: 500MB+ cache
- **Fix**: Reduced cache from 5 to 2 clips
- **Result**: 60% cache memory reduction

### Memory Usage Comparison

**Before Fixes (4K Video Processing)**:
- Load 4K video: ~4 GB
- Rotate at 4K: +3.75 GB (temporary spike)
- Crop at 4K: +1 GB (temporary)
- Resize to 1080p: +500 MB
- **Total peak: ~9 GB per clip**

**After Fixes**:
- Load 4K video metadata: ~1 MB (ffprobe)
- Downscale to 1920x1080: ~200 MB (one-time)
- Rotate at 1080p: +200 MB (temporary)
- Crop at 1080p: +50 MB (temporary)
- **Total peak: ~450 MB per clip**

**Memory reduction: ~95%**

### Additional Optimizations

1. **Beat Limiting**: Limits beats to 2.5 per second (prevents 144+ segments)
2. **Segment Combination**: Combines very short intervals (<0.3s)
3. **Adaptive Rendering**: Settings adjust based on segment count
4. **Process Priority**: Lowers process priority to prevent system overload
5. **Resource Monitoring**: Real-time monitoring with emergency abort
6. **Chunked Concatenation**: Processes segments in chunks of 50
7. **More Frequent GC**: Garbage collection every 5 segments instead of 10

### Configuration for Limited RAM

For systems with limited RAM, you can further reduce memory usage:

```env
# In .env file
MAX_CLIPS_FOR_PROCESSING=30  # Reduce from 50
RESOURCE_MEMORY_THRESHOLD=75.0  # Lower threshold
RESOURCE_CPU_THRESHOLD=70.0  # Lower threshold
```

### Summary

All critical memory issues have been fixed. The bot should now handle large clips without crashing the system. Key improvements:

- ✅ 95% memory reduction for 4K video processing
- ✅ No more loading entire large videos into memory
- ✅ Downscaling happens FIRST (before expensive operations)
- ✅ Real-time memory monitoring with emergency abort
- ✅ More aggressive cleanup and garbage collection
- ✅ Process priority management

The bot is now production-ready for large clip libraries.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This project is for educational purposes only. Make sure to comply with TikTok's terms of service and API usage guidelines. Use responsibly and respect copyright laws when using music and video content.

## Support

For support, please open an issue in the GitHub repository.

## Acknowledgments

- Uses [librosa](https://librosa.org/) for audio analysis
- Uses [MoviePy](https://zulko.github.io/moviepy/) for video processing
- Uses [undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver) for browser automation
