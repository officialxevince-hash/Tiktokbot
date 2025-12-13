# Fix for Pillow 10.0.0+ compatibility (ANTIALIAS was removed)
# MUST be applied BEFORE any imports
try:
    from PIL import Image
    if not hasattr(Image, 'ANTIALIAS'):
        # Pillow 10.0.0+ removed ANTIALIAS, use LANCZOS instead
        Image.ANTIALIAS = Image.LANCZOS
except ImportError:
    pass

import os
import time
import schedule
import random
from datetime import datetime, timedelta
from uuid import uuid4
from dotenv import load_dotenv
from termcolor import colored

from tiktok_uploader import tiktok
from tiktok_uploader.Config import Config
from videogen.music_video import (
    load_local_clips,
    load_local_music,
    create_beat_synced_video
)
from videogen.gpt import generate_metadata
from videogen.viral_optimizer import get_viral_optimizer

# Load environment variables
load_dotenv()

# Initialize Config
_ = Config.load("./config.txt")

# Constants
CLIPS_DIRECTORY = "./clips"
MUSIC_DIRECTORY = "./music"  # Also check ./music
MAX_VIDEO_DURATION = 60  # Maximum video duration in seconds (TikTok limit)
EFFECT_INTENSITY = 0.6  # Intensity of visual effects (0.0 to 1.0)
TIKTOK_USERNAME = os.getenv('TIKTOK_USERNAME')
USE_VIRAL_OPTIMIZATION = os.getenv('USE_VIRAL_OPTIMIZATION', 'true').lower() == 'true'  # Enable viral optimization
OPTIMAL_POSTING_TIME = os.getenv('OPTIMAL_POSTING_TIME', 'true').lower() == 'true'  # Schedule for optimal times
IMMEDIATE_POST_FOR_TESTING = os.getenv('IMMEDIATE_POST_FOR_TESTING', 'false').lower() == 'true'  # Bypass schedule and post immediately for testing

# Check required environment variables
required_env_vars = ['TIKTOK_USERNAME']
for var in required_env_vars:
    if not os.getenv(var):
        raise EnvironmentError(f"Missing required environment variable: {var}")


def generate_music_video():
    """
    Generate a music video using local clips and music, then upload to TikTok.
    """
    try:
        print(colored(f"[+] Starting music video generation at {datetime.now()}", "cyan"))
        
        # Create necessary directories
        for dir_path in ["./temp", "./output"]:
            os.makedirs(dir_path, exist_ok=True)
            print(colored(f"[+] Directory verified: {os.path.abspath(dir_path)}", "green"))
        
        # Load local clips
        print(colored("[+] Loading local video clips...", "cyan"))
        clips = load_local_clips(CLIPS_DIRECTORY)
        
        if not clips:
            raise ValueError(f"No video clips found in {CLIPS_DIRECTORY}")
        
        print(colored(f"[+] Loaded {len(clips)} video clips", "green"))
        
        # Load local music - ONLY from music folder
        print(colored(f"[+] Loading local music files from {MUSIC_DIRECTORY}...", "cyan"))
        music_files = load_local_music(MUSIC_DIRECTORY)
        
        if not music_files:
            raise ValueError(f"No music files found in {MUSIC_DIRECTORY}. Please add music files to the ./music folder.")
        
        print(colored(f"[+] Loaded {len(music_files)} music files", "green"))
        
        # Select random music file
        selected_music = random.choice(music_files)
        print(colored(f"[+] Selected music: {os.path.basename(selected_music)}", "green"))
        
        # Generate output path
        output_filename = f"music_video_{uuid4()}.mp4"
        output_path = os.path.join("./output", output_filename)
        
        # Create beat-synced music video
        print(colored("[+] Creating beat-synced music video...", "cyan"))
        video_path = create_beat_synced_video(
            music_path=selected_music,
            clips=clips,
            output_path=output_path,
            max_duration=MAX_VIDEO_DURATION,
            effect_intensity=EFFECT_INTENSITY,
            threads=2,
            temp_dir="./temp"
        )
        
        print(colored(f"[+] Video created: {video_path}", "green"))
        
        # Generate optimized metadata for TikTok
        print(colored("[+] Generating viral-optimized TikTok metadata...", "cyan"))
        music_name = os.path.splitext(os.path.basename(selected_music))[0]
        
        # Initialize viral optimizer
        optimizer = get_viral_optimizer()
        
        # Generate metadata using viral optimization strategies
        if USE_VIRAL_OPTIMIZATION:
            try:
                # Try AI-optimized metadata first (if API keys available)
                if os.getenv('OPENAI_API_KEY') or os.getenv('GOOGLE_API_KEY'):
                    ai_model = "g4f" if os.getenv('OPENAI_API_KEY') else "gemmini"
                    print(colored("[+] Using AI for viral-optimized metadata...", "cyan"))
                    title, description, keywords = optimizer.generate_ai_optimized_metadata(
                        music_name=music_name,
                        ai_model=ai_model,
                        use_viral_strategies=True
                    )
                else:
                    # Use non-AI viral optimization
                    print(colored("[+] Using viral optimization strategies (no AI)...", "cyan"))
                    title = optimizer.generate_viral_title(music_name)
                    description = optimizer.generate_viral_description(title, music_name)
                    keywords = optimizer.generate_viral_hashtags(music_name, num_hashtags=15)
            except Exception as e:
                print(colored(f"[!] Viral optimization failed: {e}", "yellow"))
                print(colored("[!] Falling back to standard metadata...", "yellow"))
                # Fallback to standard generation
                title = f"{music_name} 🎵"
                description = f"Beat-synced music video 🎬✨"
                keywords = "#musicvideo #beatsync #viral #fyp #trending #music #edit"
        else:
            # Standard metadata generation (original behavior)
            title = f"{music_name} 🎵"
            description = f"Beat-synced music video 🎬✨"
            keywords = "#musicvideo #beatsync #viral #fyp #trending #music #edit"
            
            # Optionally use GPT for better metadata (requires API key)
            try:
                if os.getenv('OPENAI_API_KEY') or os.getenv('GOOGLE_API_KEY'):
                    ai_model = "g4f" if os.getenv('OPENAI_API_KEY') else "gemmini"
                    gpt_title, gpt_description, gpt_keywords = generate_metadata(
                        video_subject=f"Music video for {music_name}",
                        script=f"A beat-synced music video featuring {music_name}",
                        ai_model=ai_model,
                        num_keywords=5
                    )
                    if gpt_title:
                        title = gpt_title
                    if gpt_description:
                        description = gpt_description
                    if gpt_keywords:
                        keywords = ' '.join([f'#{k.strip()}' for k in gpt_keywords])
            except Exception as e:
                print(colored(f"[!] Could not generate GPT metadata: {e}", "yellow"))
                print(colored("[!] Using default metadata", "yellow"))
        
        # Validate and truncate text if needed (TikTok limit is ~2200 chars for combined text)
        full_text = title + " " + description + " " + keywords
        max_text_length = 2200
        
        if len(full_text) > max_text_length:
            print(colored(f"[!] Warning: Combined text length ({len(full_text)} chars) exceeds TikTok limit ({max_text_length})", "yellow"))
            excess = len(full_text) - max_text_length
            
            # Truncate keywords first (they're less important)
            if len(keywords) > excess + 50:  # Leave some buffer
                keywords = keywords[:len(keywords) - excess - 50]
                print(colored(f"[+] Truncated keywords to fit limit", "yellow"))
            else:
                # If keywords aren't enough, truncate description too
                keywords = ""
                excess -= len(keywords)
                if len(description) > excess + 50:
                    description = description[:len(description) - excess - 50]
                    print(colored(f"[+] Truncated description to fit limit", "yellow"))
                else:
                    # Last resort: truncate title
                    description = ""
                    excess -= len(description)
                    if len(title) > excess + 20:
                        title = title[:len(title) - excess - 20]
                        print(colored(f"[+] Truncated title to fit limit", "yellow"))
            
            full_text = title + " " + description + " " + keywords
            print(colored(f"[+] Final text length: {len(full_text)} chars", "green"))
        
        print(colored(f"[+] Title: {title}", "cyan"))
        print(colored(f"[+] Description: {description}", "cyan"))
        print(colored(f"[+] Keywords: {keywords}", "cyan"))
        
        # Optimize engagement settings
        engagement_settings = optimizer.optimize_engagement_settings(
            allow_comment=1,
            allow_duet=1,  # Enable duets for viral potential
            allow_stitch=1  # Enable stitches for viral potential
        )
        
        # Post immediately (bot is already scheduled to run at optimal times)
        # No need to use TikTok's unreliable scheduling API
        schedule_time = 0
        print(colored("[+] Posting immediately (bot runs at optimal times)", "cyan"))
        
        # Upload to TikTok
        print(colored("[+] Uploading to TikTok...", "cyan"))
        print(colored(f"[+] Using username: {TIKTOK_USERNAME}", "cyan"))
        print(colored(f"[+] Video path: {os.path.abspath(video_path)}", "cyan"))
        
        success = tiktok.upload_video(
            TIKTOK_USERNAME,
            video_path,
            title,
            description,
            keywords,
            schedule_time=schedule_time,
            allow_comment=engagement_settings['allow_comment'],
            allow_duet=engagement_settings['allow_duet'],
            allow_stitch=engagement_settings['allow_stitch'],
            visibility_type=0
        )
        
        if success:
            print(colored(f"[+] Successfully uploaded video at {datetime.now()}", "green"))
            
            # Delete video from output folder after successful upload
            try:
                if os.path.exists(video_path):
                    os.remove(video_path)
                    print(colored(f"[+] Deleted uploaded video: {video_path}", "green"))
                else:
                    print(colored(f"[!] Video file not found: {video_path}", "yellow"))
            except Exception as e:
                print(colored(f"[!] Warning: Could not delete video file: {e}", "yellow"))
        else:
            print(colored(f"[-] Failed to upload video at {datetime.now()}", "red"))
            print(colored(f"[!] Video file kept in output folder for debugging: {video_path}", "yellow"))
        
        # Clean up temp files
        print(colored("[+] Cleanup complete", "green"))
        
    except Exception as e:
        print(colored(f"[-] Error in music video generation/upload process: {e}", "red"))
        print(colored(f"[-] Error type: {type(e)}", "red"))
        import traceback
        traceback.print_exc()


def schedule_optimal_posting_times():
    """
    Schedule video generation at all optimal posting times throughout the week.
    This replaces hourly scheduling with optimal time-based scheduling.
    """
    from videogen.viral_optimizer import OPTIMAL_POSTING_HOURS
    
    # Clear any existing schedules
    schedule.clear()
    
    # Schedule for each optimal hour of each day
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    
    scheduled_count = 0
    for day in days:
        optimal_hours = OPTIMAL_POSTING_HOURS.get(day, [])
        for hour in optimal_hours:
            # Schedule at random minutes (0-30) to avoid pattern detection
            minute = random.randint(0, 30)
            time_str = f"{hour:02d}:{minute:02d}"
            
            # Schedule for specific day of week
            if day == 'monday':
                schedule.every().monday.at(time_str).do(generate_music_video)
            elif day == 'tuesday':
                schedule.every().tuesday.at(time_str).do(generate_music_video)
            elif day == 'wednesday':
                schedule.every().wednesday.at(time_str).do(generate_music_video)
            elif day == 'thursday':
                schedule.every().thursday.at(time_str).do(generate_music_video)
            elif day == 'friday':
                schedule.every().friday.at(time_str).do(generate_music_video)
            elif day == 'saturday':
                schedule.every().saturday.at(time_str).do(generate_music_video)
            elif day == 'sunday':
                schedule.every().sunday.at(time_str).do(generate_music_video)
            
            scheduled_count += 1
    
    print(colored(f"[+] Scheduled {scheduled_count} optimal posting times throughout the week", "green"))
    return scheduled_count


def main():
    """
    Main function to run the music video bot.
    """
    print(colored("[+] Starting Music Video TikTok Bot", "cyan"))
    print(colored("[+] This bot creates beat-synced music videos from local clips and music", "cyan"))
    
    # Check if immediate post for testing is enabled
    if IMMEDIATE_POST_FOR_TESTING:
        print(colored("[!] TESTING MODE: Immediate post enabled - bypassing schedule", "yellow"))
        print(colored("[!] Generating and uploading video immediately...", "yellow"))
        generate_music_video()
        print(colored("[+] Test upload complete. Exiting.", "green"))
        return  # Exit after test upload
    
    # Check if we should use optimal timing
    if OPTIMAL_POSTING_TIME:
        current_time = datetime.now()
        current_hour = current_time.hour
        day_name = current_time.strftime('%A').lower()
        from videogen.viral_optimizer import OPTIMAL_POSTING_HOURS
        optimal_hours = OPTIMAL_POSTING_HOURS.get(day_name, OPTIMAL_POSTING_HOURS['monday'])
        
        # Schedule all optimal posting times for the week
        scheduled_count = schedule_optimal_posting_times()
        
        # Check if current time is optimal
        if current_hour in optimal_hours:
            # Current time is optimal, post immediately
            print(colored("[+] Current time is optimal, generating first video now...", "cyan"))
            generate_music_video()
        else:
            # Find next optimal time
            optimizer = get_viral_optimizer()
            next_optimal_time = optimizer.get_next_optimal_datetime(current_time)
            time_until = (next_optimal_time - current_time).total_seconds()
            hours = int(time_until // 3600)
            minutes = int((time_until % 3600) // 60)
            print(colored(f"[+] Current time is not optimal", "cyan"))
            print(colored(f"[+] Next optimal time: {next_optimal_time.strftime('%Y-%m-%d %H:%M:%S')}", "cyan"))
            print(colored(f"[+] Waiting {hours}h {minutes}m until next post...", "cyan"))
    else:
        # Use hourly scheduling (original behavior)
        print(colored("[+] Using hourly scheduling (optimal timing disabled)", "yellow"))
        schedule.every().hour.at(":00").do(generate_music_video)
        # Run immediately on start
        print(colored("[+] Generating first video...", "cyan"))
        generate_music_video()
    
    # Keep the script running
    print(colored("[+] Bot is running. Videos will be generated at optimal posting times.", "green"))
    print(colored("[+] Checking for scheduled posts every minute...", "cyan"))
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute


if __name__ == "__main__":
    main()







