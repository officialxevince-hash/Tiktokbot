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
# him
# Tiktokbot
