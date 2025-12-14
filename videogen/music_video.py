# Fix for Pillow 10.0.0+ compatibility (ANTIALIAS was removed)
# MUST be applied BEFORE any MoviePy imports
try:
    from PIL import Image
    if not hasattr(Image, 'ANTIALIAS'):
        # Pillow 10.0.0+ removed ANTIALIAS, use LANCZOS instead
        Image.ANTIALIAS = Image.LANCZOS
except ImportError:
    pass

import os
import random
import uuid
import subprocess
import tempfile
import gc
from typing import List, Optional, Tuple
from moviepy.editor import VideoFileClip, AudioFileClip, CompositeVideoClip, concatenate_videoclips, VideoClip
from moviepy.video.fx.all import crop, resize, rotate
from termcolor import colored
import logging

from videogen.beat_detection import detect_beats, get_beat_intervals
from videogen.video_effects import (
    apply_zoom_effect,
    apply_flash_effect,
    apply_rgb_shift,
    apply_hue_rotation,
    apply_prism_effect,
    apply_jump_cut,
    apply_fast_cut,
    apply_random_effect
)

logger = logging.getLogger(__name__)


def create_interesting_thumbnail(video: VideoClip, interesting_times: List[float] = None, thumbnail_duration: float = 0.2) -> VideoClip:
    """
    Create an interesting thumbnail by selecting a visually striking frame from the video.
    Prefers frames with effects or from interesting moments.
    
    Args:
        video: VideoClip to extract thumbnail from
        interesting_times: List of timestamps where effects occur (preferred for thumbnails)
        thumbnail_duration: Duration of thumbnail clip in seconds
    
    Returns:
        VideoClip: A short clip suitable as thumbnail
    """
    try:
        video_duration = video.duration
        
        # If we have interesting times (from effects), prefer those
        if interesting_times:
            # Filter to valid times within video duration
            valid_times = [t for t in interesting_times if 0.1 < t < video_duration - 0.1]
            if valid_times:
                # Select from interesting times, prefer earlier ones (first 30% of video)
                early_times = [t for t in valid_times if t < video_duration * 0.3]
                if early_times:
                    selected_time = random.choice(early_times)
                else:
                    selected_time = random.choice(valid_times)
            else:
                # Fallback to default logic
                selected_time = None
        else:
            selected_time = None
        
        # Fallback: find interesting moments (avoid first frame, prefer first 30%)
        if selected_time is None:
            candidate_times = [
                min(0.5, video_duration * 0.1),  # 10% into video
                video_duration * 0.15,  # 15% into video
                video_duration * 0.25,  # 25% into video
                video_duration * 0.3,   # 30% into video
            ]
            
            # Filter to valid times
            candidate_times = [t for t in candidate_times if t < video_duration - 0.1]
            
            if not candidate_times:
                # Fallback: use a frame from the middle
                selected_time = video_duration * 0.3
            else:
                selected_time = random.choice(candidate_times)
        
        # Extract frame at selected time
        frame = video.get_frame(selected_time)
        
        # Create a short clip from this frame (hold it for thumbnail_duration)
        from moviepy.editor import ImageClip
        
        # Convert frame to ImageClip
        thumbnail_clip = ImageClip(frame).set_duration(thumbnail_duration)
        thumbnail_clip = thumbnail_clip.set_fps(video.fps)
        
        return thumbnail_clip
        
    except Exception as e:
        logger.warning(colored(f"[-] Error creating thumbnail: {e}, using first frame", "yellow"))
        # Fallback: use first frame
        frame = video.get_frame(0)
        from moviepy.editor import ImageClip
        thumbnail_clip = ImageClip(frame).set_duration(thumbnail_duration)
        thumbnail_clip = thumbnail_clip.set_fps(video.fps)
        return thumbnail_clip


def load_local_clips(
    clips_directory: str = "./clips",
    preprocess_large_files: bool = True,
    max_file_size_gb: float = 1.0,
    segment_duration: float = 5.0,
    num_segments: int = 10
) -> List[str]:
    """
    Load all video clips from a local directory.
    Optionally pre-process large files to extract segments.
    
    Args:
        clips_directory (str): Path to directory containing video clips
        preprocess_large_files (bool): Whether to pre-process large files (>1GB)
        max_file_size_gb (float): Maximum file size in GB before pre-processing
        segment_duration (float): Duration of each extracted segment in seconds
        num_segments (int): Number of segments to extract from large files
    
    Returns:
        List[str]: List of paths to video files (processed segments + small original files)
    """
    try:
        if not os.path.exists(clips_directory):
            logger.warning(colored(f"Clips directory not found: {clips_directory}", "yellow"))
            return []
        
        if preprocess_large_files:
            # Use pre-processing for large files
            processed_dir = os.path.join(clips_directory, "processed")
            clips = preprocess_clips_directory(
                clips_directory=clips_directory,
                processed_directory=processed_dir,
                max_file_size_gb=max_file_size_gb,
                segment_duration=segment_duration,
                num_segments=num_segments
            )
            
            # Also include small files that weren't processed (from main directory)
            video_extensions = ('.mp4', '.mov', '.avi', '.mkv', '.MOV', '.MP4')
            small_clips = []
            for f in os.listdir(clips_directory):
                if f.lower().endswith(video_extensions) and f != 'processed':
                    clip_path = os.path.join(clips_directory, f)
                    if os.path.isfile(clip_path):  # Make sure it's a file, not a directory
                        file_size_gb = os.path.getsize(clip_path) / (1024 ** 3)
                        if file_size_gb < max_file_size_gb and '_segment_' not in f:
                            small_clips.append(clip_path)
            
            clips.extend(small_clips)
            print(colored(f"[+] Loaded {len(clips)} video clips (including processed segments)", "green"))
        else:
            # Original behavior: just list all video files
            video_extensions = ('.mp4', '.mov', '.avi', '.mkv', '.MOV', '.MP4')
            clips = [
                os.path.join(clips_directory, f) 
                for f in os.listdir(clips_directory)
                if f.lower().endswith(video_extensions)
            ]
            print(colored(f"[+] Found {len(clips)} video clips in {clips_directory}", "green"))
        
        return clips
    
    except Exception as e:
        logger.error(colored(f"[-] Error loading clips: {e}", "red"))
        return []


def preprocess_large_clip(
    clip_path: str,
    output_dir: str = "./clips/processed",
    max_file_size_gb: float = 1.0,
    segment_duration: float = 5.0,
    num_segments: int = 10,
    min_segment_duration: float = 3.0
) -> List[str]:
    """
    Pre-process large video clips by extracting interesting segments.
    
    Args:
        clip_path (str): Path to the large video file
        output_dir (str): Directory to save processed segments
        max_file_size_gb (float): Maximum file size in GB to trigger preprocessing
        segment_duration (float): Target duration for each segment in seconds
        num_segments (int): Number of segments to extract
        min_segment_duration (float): Minimum segment duration in seconds
    
    Returns:
        List[str]: List of paths to extracted segments, or original path if no processing needed
    """
    try:
        # Check file size
        file_size_gb = os.path.getsize(clip_path) / (1024 ** 3)
        
        if file_size_gb < max_file_size_gb:
            # File is small enough, return original
            return [clip_path]
        
        print(colored(f"[+] Pre-processing large clip: {os.path.basename(clip_path)} ({file_size_gb:.2f} GB)", "cyan"))
        
        # Create output directory
        os.makedirs(output_dir, exist_ok=True)
        
        # Generate base name for output files
        base_name = os.path.splitext(os.path.basename(clip_path))[0]
        
        # Check if already processed
        existing_segments = [
            os.path.join(output_dir, f) 
            for f in os.listdir(output_dir)
            if f.startswith(f"{base_name}_segment_") and f.endswith('.mp4')
        ]
        
        if len(existing_segments) >= num_segments:
            print(colored(f"[+] Found {len(existing_segments)} existing segments, skipping processing", "green"))
            return sorted(existing_segments)[:num_segments]
        
        # Load video to get duration with error handling
        print(colored(f"[+] Loading video to analyze...", "cyan"))
        video = None
        actual_clip_path = clip_path
        
        try:
            video = VideoFileClip(clip_path)
        except Exception as e:
            error_msg = str(e)
            # Check if it's a duration/metadata error (corrupted file)
            if "duration" in error_msg.lower() or "failed to read" in error_msg.lower():
                # Try to fix the corrupted video
                fixed_path = try_fix_corrupted_video(clip_path, temp_dir=os.path.join(os.path.dirname(output_dir), "temp"))
                if fixed_path:
                    try:
                        video = VideoFileClip(fixed_path)
                        actual_clip_path = fixed_path
                        print(colored(f"[+] Using fixed version of {os.path.basename(clip_path)}", "green"))
                    except Exception as e2:
                        logger.warning(colored(f"[-] Fixed video still cannot be loaded: {str(e2)[:100]}", "yellow"))
                        return [clip_path]
                else:
                    logger.warning(colored(f"[-] Cannot fix corrupted video {os.path.basename(clip_path)}. Skipping.", "yellow"))
                    return [clip_path]
            elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                logger.warning(colored(f"[-] Timeout loading {os.path.basename(clip_path)} - file may be on slow storage. Skipping.", "yellow"))
                return [clip_path]
            else:
                logger.warning(colored(f"[-] Error loading {os.path.basename(clip_path)}: {error_msg[:100]}. Skipping.", "yellow"))
                return [clip_path]
        
        if video is None:
            return [clip_path]
        
        try:
            # Correct orientation if needed (for vertical target: 1080x1920)
            target_size = (1080, 1920)  # Standard vertical TikTok format
            video = correct_video_orientation(video, target_size)
            
            total_duration = video.duration
        except Exception as e:
            logger.warning(colored(f"[-] Error analyzing {os.path.basename(clip_path)}: {str(e)[:100]}. Skipping.", "yellow"))
            video.close()
            return [clip_path]
        
        if total_duration < min_segment_duration:
            # Video is too short, return original
            try:
                video.close()
            except:
                pass
            return [clip_path]
        
        # Calculate segment intervals
        # Distribute segments throughout the video, avoiding the very beginning/end
        skip_start = min(5.0, total_duration * 0.05)  # Skip first 5 seconds or 5%
        skip_end = min(5.0, total_duration * 0.05)    # Skip last 5 seconds or 5%
        usable_duration = total_duration - skip_start - skip_end
        
        if usable_duration < min_segment_duration:
            # Not enough usable duration
            try:
                video.close()
            except:
                pass
            return [clip_path]
        
        # Calculate spacing between segments
        if num_segments == 1:
            segment_starts = [skip_start + (usable_duration - segment_duration) / 2]
        else:
            spacing = (usable_duration - segment_duration) / (num_segments - 1) if num_segments > 1 else 0
            segment_starts = [skip_start + i * spacing for i in range(num_segments)]
        
        extracted_segments = []
        
        print(colored(f"[+] Extracting {num_segments} segments from {total_duration:.1f}s video...", "cyan"))
        
        for i, start_time in enumerate(segment_starts):
            try:
                # Ensure we don't go past the end
                end_time = min(start_time + segment_duration, total_duration - skip_end)
                
                if end_time - start_time < min_segment_duration:
                    continue
                
                # Extract segment
                segment = video.subclip(start_time, end_time)
                segment = segment.without_audio()  # Remove audio to save space
                
                # Output path
                output_path = os.path.join(output_dir, f"{base_name}_segment_{i+1:03d}.mp4")
                
                # Write segment
                print(colored(f"[+] Extracting segment {i+1}/{num_segments} ({start_time:.1f}s - {end_time:.1f}s)...", "cyan"))
                segment.write_videofile(
                    output_path,
                    codec='libx264',
                    audio_codec='aac',
                    preset='medium',
                    bitrate='5000k',
                    threads=2,
                    logger=None  # Suppress verbose output
                )
                
                segment.close()
                extracted_segments.append(output_path)
                
                # Periodic cleanup to prevent memory buildup
                if (i + 1) % 3 == 0:
                    gc.collect()
                
                # Check output file size and display appropriately
                output_size_bytes = os.path.getsize(output_path)
                output_size_mb = output_size_bytes / (1024 ** 2)
                if output_size_mb < 100:
                    print(colored(f"[+] Segment {i+1} saved: {output_size_mb:.1f} MB", "green"))
                else:
                    output_size_gb = output_size_bytes / (1024 ** 3)
                    print(colored(f"[+] Segment {i+1} saved: {output_size_gb:.2f} GB", "green"))
                
            except Exception as e:
                logger.warning(colored(f"[-] Error extracting segment {i+1}: {e}", "yellow"))
                continue
        
        try:
            video.close()
        except:
            pass
        
        if not extracted_segments:
            print(colored(f"[-] No segments extracted, returning original file", "yellow"))
            return [clip_path]
        
        print(colored(f"[+] Successfully extracted {len(extracted_segments)} segments", "green"))
        return extracted_segments
        
    except Exception as e:
        error_msg = str(e)
        if "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
            logger.warning(colored(f"[-] Timeout pre-processing {os.path.basename(clip_path)} - file may be corrupted or inaccessible. Will skip this file.", "yellow"))
        else:
            logger.warning(colored(f"[-] Error pre-processing {os.path.basename(clip_path)}: {error_msg[:150]}. Will skip this file.", "yellow"))
        return [clip_path]  # Return original on error, but it will likely fail later too


def preprocess_clips_directory(
    clips_directory: str = "./clips",
    processed_directory: str = "./clips/processed",
    max_file_size_gb: float = 1.0,
    segment_duration: float = 5.0,
    num_segments: int = 10
) -> List[str]:
    """
    Pre-process all large clips in a directory.
    Optimized to handle large numbers of clips without memory issues.
    
    Args:
        clips_directory (str): Directory containing video clips
        processed_directory (str): Directory to save processed segments
        max_file_size_gb (float): Maximum file size in GB to trigger preprocessing
        segment_duration (float): Target duration for each segment in seconds
        num_segments (int): Number of segments to extract per large file
    
    Returns:
        List[str]: List of all clip paths (processed segments + small original files)
    """
    all_clips = []
    video_extensions = ('.mp4', '.mov', '.avi', '.mkv', '.MOV', '.MP4')
    
    if not os.path.exists(clips_directory):
        return []
    
    print(colored(f"[+] Pre-processing large clips in {clips_directory}...", "cyan"))
    
    # Get list of files first
    files_to_process = []
    for filename in os.listdir(clips_directory):
        if not filename.lower().endswith(video_extensions):
            continue
        
        clip_path = os.path.join(clips_directory, filename)
        
        # Skip already processed segments
        if '_segment_' in filename and 'processed' in clip_path:
            continue
        
        files_to_process.append(clip_path)
    
    print(colored(f"[+] Found {len(files_to_process)} files to process", "cyan"))
    
    # Process files one at a time to prevent memory buildup
    for i, clip_path in enumerate(files_to_process):
        try:
            print(colored(f"[+] Processing file {i+1}/{len(files_to_process)}: {os.path.basename(clip_path)}", "cyan"))
            
            # Pre-process if needed
            processed_clips = preprocess_large_clip(
                clip_path,
                output_dir=processed_directory,
                max_file_size_gb=max_file_size_gb,
                segment_duration=segment_duration,
                num_segments=num_segments
            )
            
            all_clips.extend(processed_clips)
            
            # Periodic garbage collection to prevent memory buildup
            if (i + 1) % 5 == 0:
                gc.collect()
                print(colored(f"[+] Processed {i+1}/{len(files_to_process)} files, {len(all_clips)} clips total", "green"))
        except Exception as e:
            logger.warning(colored(f"[-] Error processing {clip_path}: {e}", "yellow"))
            continue
    
    print(colored(f"[+] Total clips available after pre-processing: {len(all_clips)}", "green"))
    return all_clips


def load_local_music(music_directory: str = "./downloads") -> List[str]:
    """
    Load all music files from a local directory.
    
    Args:
        music_directory (str): Path to directory containing music files
    
    Returns:
        List[str]: List of paths to music files
    """
    try:
        if not os.path.exists(music_directory):
            logger.warning(colored(f"Music directory not found: {music_directory}", "yellow"))
            return []
        
        audio_extensions = ('.mp3', '.wav', '.m4a', '.ogg', '.flac')
        music_files = [
            os.path.join(music_directory, f)
            for f in os.listdir(music_directory)
            if f.lower().endswith(audio_extensions)
        ]
        
        print(colored(f"[+] Found {len(music_files)} music files in {music_directory}", "green"))
        return music_files
    
    except Exception as e:
        logger.error(colored(f"[-] Error loading music: {e}", "red"))
        return []


def try_fix_corrupted_video(clip_path: str, temp_dir: str = "./temp") -> Optional[str]:
    """
    Attempt to fix a corrupted video file that MoviePy can't read.
    Uses ffmpeg to re-encode the video, which often fixes missing duration metadata.
    
    Args:
        clip_path (str): Path to corrupted video file
        temp_dir (str): Directory for temporary fixed file
    
    Returns:
        Optional[str]: Path to fixed video file, or None if fixing failed
    """
    try:
        os.makedirs(temp_dir, exist_ok=True)
        
        # Generate temp file path
        base_name = os.path.splitext(os.path.basename(clip_path))[0]
        fixed_path = os.path.join(temp_dir, f"{base_name}_fixed.mp4")
        
        # Check if already fixed
        if os.path.exists(fixed_path):
            return fixed_path
        
        print(colored(f"[+] Attempting to fix corrupted video: {os.path.basename(clip_path)}", "yellow"))
        
        # Use ffmpeg to re-encode the video, which fixes missing duration metadata
        # -c:v copy: Copy video stream (fast, but might not fix all issues)
        # -c:a copy: Copy audio stream
        # -movflags +faststart: Optimize for streaming
        cmd = [
            'ffmpeg',
            '-i', clip_path,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-movflags', '+faststart',
            '-y',  # Overwrite output file
            fixed_path
        ]
        
        # Run ffmpeg with timeout
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode == 0 and os.path.exists(fixed_path):
            file_size = os.path.getsize(fixed_path)
            if file_size > 1024:  # At least 1KB
                print(colored(f"[+] Successfully fixed video: {os.path.basename(clip_path)}", "green"))
                return fixed_path
        
        # If fixing failed, clean up
        if os.path.exists(fixed_path):
            try:
                os.remove(fixed_path)
            except:
                pass
        
        return None
        
    except subprocess.TimeoutExpired:
        logger.warning(colored(f"[-] Timeout fixing {os.path.basename(clip_path)}", "yellow"))
        return None
    except Exception as e:
        logger.warning(colored(f"[-] Error fixing {os.path.basename(clip_path)}: {str(e)[:100]}", "yellow"))
        return None


def correct_video_orientation(clip: VideoFileClip, target_size: Tuple[int, int] = (1080, 1920)) -> VideoFileClip:
    """
    Detect and correct video orientation if needed.
    Rotates horizontal videos that should be vertical (or vice versa).
    
    Args:
        clip: VideoFileClip to check and correct
        target_size: Target video size (width, height)
    
    Returns:
        VideoFileClip: Corrected clip with proper orientation
    """
    target_aspect = target_size[0] / target_size[1]  # width/height ratio
    clip_aspect = clip.w / clip.h  # width/height ratio
    
    # Determine if target is vertical (aspect < 1) or horizontal (aspect > 1)
    target_is_vertical = target_aspect < 1.0
    clip_is_horizontal = clip_aspect > 1.0
    
    # If target is vertical but clip is horizontal, rotate 90 degrees counter-clockwise
    # This handles the case where video was recorded horizontally but content is vertical
    if target_is_vertical and clip_is_horizontal:
        print(colored(f"[+] Rotating clip from horizontal ({clip.w}x{clip.h}) to vertical", "yellow"))
        clip = rotate(clip, -90)  # Counter-clockwise rotation
        # After rotation, width and height are swapped automatically by MoviePy
    
    # If target is horizontal but clip is vertical, rotate 90 degrees clockwise
    elif not target_is_vertical and not clip_is_horizontal:
        print(colored(f"[+] Rotating clip from vertical ({clip.w}x{clip.h}) to horizontal", "yellow"))
        clip = rotate(clip, 90)  # Clockwise rotation
    
    return clip


def prepare_clip(clip_path: str, target_size: Tuple[int, int] = (1080, 1920)) -> VideoFileClip:
    """
    Load and prepare a video clip for editing (crop, resize, remove audio).
    
    Args:
        clip_path (str): Path to video file
        target_size (Tuple[int, int]): Target video size (width, height)
    
    Returns:
        VideoFileClip: Prepared clip
    """
    # Quick validation: check if file exists and is readable
    if not os.path.exists(clip_path):
        raise FileNotFoundError(f"Clip file not found: {clip_path}")
    
    if not os.access(clip_path, os.R_OK):
        raise PermissionError(f"Cannot read clip file: {clip_path}")
    
    # Check file size (skip empty or very small files)
    file_size = os.path.getsize(clip_path)
    if file_size < 1024:  # Less than 1KB is likely corrupted
        raise ValueError(f"Clip file too small (likely corrupted): {clip_path}")
    
    # Try to load the clip, with fallback to fixing corrupted files
    video_path = clip_path
    try:
        clip = VideoFileClip(clip_path)
    except Exception as e:
        error_msg = str(e)
        # Check if it's a duration/metadata error (corrupted file)
        if "duration" in error_msg.lower() or "failed to read" in error_msg.lower():
            # Try to fix the corrupted video
            fixed_path = try_fix_corrupted_video(clip_path, temp_dir="./temp")
            if fixed_path:
                try:
                    clip = VideoFileClip(fixed_path)
                    video_path = fixed_path
                    print(colored(f"[+] Using fixed version of {os.path.basename(clip_path)}", "green"))
                except Exception as e2:
                    raise ValueError(f"Cannot load video even after fixing: {str(e2)[:100]}")
            else:
                raise ValueError(f"Cannot fix corrupted video: {error_msg[:100]}")
        else:
            raise
    
    clip = clip.without_audio()
    
    # Correct orientation if needed (rotate horizontal videos that should be vertical)
    clip = correct_video_orientation(clip, target_size)
    
    # Calculate aspect ratio
    clip_aspect = clip.w / clip.h
    target_aspect = target_size[0] / target_size[1]
    
    # Crop to match target aspect ratio
    if clip_aspect < target_aspect:
        # Clip is narrower, crop height
        new_height = int(clip.w / target_aspect)
        clip = crop(clip, 
                   width=clip.w, 
                   height=new_height,
                   x_center=clip.w / 2,
                   y_center=clip.h / 2)
    else:
        # Clip is wider, crop width
        new_width = int(clip.h * target_aspect)
        clip = crop(clip,
                   width=new_width,
                   height=clip.h,
                   x_center=clip.w / 2,
                   y_center=clip.h / 2)
    
    # Resize to target size
    clip = clip.resize(target_size)
    clip = clip.set_fps(30)
    
    return clip


def create_beat_synced_video(
    music_path: str,
    clips: List[str],
    output_path: str,
    max_duration: Optional[float] = None,
    effect_intensity: float = 0.5,
    threads: int = 2,
    temp_dir: str = "./temp",
    max_clips_to_use: Optional[int] = None
) -> str:
    """
    Create a music video with clips synced to beats.
    Optimized for large numbers of clips with memory management.
    
    Args:
        music_path (str): Path to music file
        clips (List[str]): List of paths to video clips
        output_path (str): Path to save output video
        max_duration (Optional[float]): Maximum video duration in seconds
        effect_intensity (float): Intensity of effects (0.0 to 1.0)
        threads (int): Number of threads for rendering
        temp_dir (str): Directory for temporary files
        max_clips_to_use (Optional[int]): Maximum number of clips to use (None = use all)
    
    Returns:
        str: Path to created video
    """
    try:
        print(colored(f"[+] Creating beat-synced music video", "cyan"))
        
        # Limit number of clips if specified (prevents memory issues)
        if max_clips_to_use and len(clips) > max_clips_to_use:
            print(colored(f"[!] Limiting clips from {len(clips)} to {max_clips_to_use} to prevent memory issues", "yellow"))
            clips = clips[:max_clips_to_use]
        
        # Ensure temp directory exists
        os.makedirs(temp_dir, exist_ok=True)
        
        # Set MoviePy temp directory via environment variable
        os.environ['TMPDIR'] = os.path.abspath(temp_dir)
        os.environ['TMP'] = os.path.abspath(temp_dir)
        os.environ['TEMP'] = os.path.abspath(temp_dir)
        
        # Force garbage collection before starting
        gc.collect()
        
        # Load music
        audio = AudioFileClip(music_path)
        duration = audio.duration
        
        if max_duration:
            duration = min(duration, max_duration)
            audio = audio.subclip(0, duration)
        
        print(colored(f"[+] Music duration: {duration:.2f} seconds", "green"))
        
        # Detect beats
        beats = detect_beats(music_path)
        # Filter beats within duration
        beats = [b for b in beats if b < duration]
        
        if not beats:
            print(colored("[!] No beats detected, using regular intervals", "yellow"))
            beats = [i * 0.5 for i in range(int(duration / 0.5))]
        
        print(colored(f"[+] Using {len(beats)} beats for synchronization", "green"))
        
        # Get beat intervals
        intervals = get_beat_intervals(beats, duration)
        
        # Validate clips
        if not clips:
            raise ValueError("No clips available")
        
        print(colored(f"[+] Processing {len(clips)} video clips (lazy loading enabled)", "cyan"))
        
        # OPTIMIZATION: Use lazy loading - don't load all clips into memory at once
        # Instead, load clips on-demand and close them immediately after use
        # This prevents memory exhaustion with large numbers of clips
        
        # Create video segments synced to beats
        video_segments = []
        interesting_times = []  # Track times with effects for thumbnail selection
        clip_index = 0
        current_video_time = 0  # Track cumulative video time for hook optimization
        
        # Hook optimization: First 3 seconds need maximum impact
        HOOK_DURATION = 3.0
        
        # Cache for prepared clips (limited size to prevent memory issues)
        MAX_CACHED_CLIPS = 5  # Only keep 5 clips in memory at a time
        clip_cache = {}  # Maps clip_path -> prepared_clip
        cache_access_order = []  # Track access order for LRU eviction
        
        def get_prepared_clip(clip_path: str) -> Optional[VideoFileClip]:
            """Get a prepared clip, using cache if available, loading if not."""
            # Check cache first
            if clip_path in clip_cache:
                # Move to end (most recently used)
                cache_access_order.remove(clip_path)
                cache_access_order.append(clip_path)
                return clip_cache[clip_path]
            
            # Load clip
            try:
                clip = prepare_clip(clip_path)
                
                # If cache is full, evict least recently used
                if len(clip_cache) >= MAX_CACHED_CLIPS and cache_access_order:
                    lru_path = cache_access_order.pop(0)
                    if lru_path in clip_cache:
                        try:
                            clip_cache[lru_path].close()
                        except:
                            pass
                        del clip_cache[lru_path]
                
                # Add to cache
                clip_cache[clip_path] = clip
                cache_access_order.append(clip_path)
                return clip
            except Exception as e:
                logger.warning(colored(f"[-] Error preparing clip {clip_path}: {e}", "yellow"))
                return None
        
        def cleanup_clip_cache():
            """Close all cached clips."""
            for clip_path, clip in clip_cache.items():
                try:
                    clip.close()
                except:
                    pass
            clip_cache.clear()
            cache_access_order.clear()
            gc.collect()  # Force garbage collection
        
        try:
            for i, (start_time, end_time) in enumerate(intervals):
                if start_time >= duration:
                    break
                
                segment_duration = end_time - start_time
                
                # Select a clip path (cycle through available clips)
                selected_clip_path = clips[clip_index % len(clips)]
                clip_index += 1
                
                # Load clip on-demand
                selected_clip = get_prepared_clip(selected_clip_path)
                if selected_clip is None:
                    # Skip this segment if clip couldn't be loaded
                    continue
                
                # Get a random portion of the clip
                if selected_clip.duration > segment_duration:
                    clip_start = random.uniform(0, selected_clip.duration - segment_duration)
                    segment = selected_clip.subclip(clip_start, clip_start + segment_duration)
                else:
                    # Clip is shorter than needed, use it fully
                    segment = selected_clip.subclip(0, min(selected_clip.duration, segment_duration))
            
            # Determine if we're in hook phase (first 3 seconds)
            is_hook_phase = current_video_time < HOOK_DURATION
            is_finish_phase = current_video_time >= duration * 0.9
            
            # Adjust effect intensity based on phase
            if is_hook_phase:
                # Hook phase: Maximum intensity, prefer flash and zoom
                phase_intensity = min(1.0, effect_intensity * 1.5)
                effect_choices = ['flash', 'zoom', 'prism', 'zoom', 'flash']  # Weighted towards flash/zoom
            elif is_finish_phase:
                # Finish phase: High intensity for strong ending
                phase_intensity = min(1.0, effect_intensity * 1.2)
                effect_choices = ['zoom', 'flash', 'prism', 'rgb', 'jump_cut', 'none']
            else:
                # Middle phase: Normal intensity
                phase_intensity = effect_intensity
                effect_choices = ['zoom', 'flash', 'rgb', 'prism', 'jump_cut', 'fast_cut', 'none']
            
            # Apply effects based on beat position and phase
            effect_type = random.choice(effect_choices)
            
            has_effect = False
            if effect_type == 'zoom' and random.random() < phase_intensity:
                zoom_factor = 1.3 if is_hook_phase else (1.2 + random.uniform(0, 0.3))
                segment = apply_zoom_effect(segment, zoom_factor=zoom_factor)
                has_effect = True
            elif effect_type == 'flash' and random.random() < phase_intensity:
                flash_duration = 0.08 if is_hook_phase else 0.05  # Longer flash in hook
                segment = apply_flash_effect(segment, flash_duration=flash_duration)
                has_effect = True
            elif effect_type == 'rgb' and random.random() < phase_intensity:
                segment = apply_rgb_shift(segment, shift_amount=random.randint(3, 10))
                has_effect = True
            elif effect_type == 'prism' and random.random() < phase_intensity:
                prism_intensity = 0.5 if is_hook_phase else (0.3 + random.uniform(0, 0.4))
                segment = apply_prism_effect(segment, intensity=prism_intensity)
                has_effect = True
            elif effect_type == 'jump_cut' and random.random() < phase_intensity * 0.5:
                segment = apply_jump_cut(segment, jump_duration=0.1)
                has_effect = True
            elif effect_type == 'fast_cut' and random.random() < phase_intensity * 0.3:
                segment = apply_fast_cut(segment, cut_duration=0.05)
                has_effect = True
            
            # Track interesting moments (prefer flash and zoom effects for thumbnails)
            if has_effect and (effect_type == 'flash' or effect_type == 'zoom' or effect_type == 'prism'):
                # Store the time when this effect segment starts (relative to final video)
                segment_start_in_video = current_video_time
                # Add time at 10% into the effect segment for best visual
                interesting_times.append(segment_start_in_video + segment_duration * 0.1)
            
                # Ensure segment matches exact duration
                if segment.duration != segment_duration:
                    segment = segment.subclip(0, min(segment.duration, segment_duration))
                
                video_segments.append(segment)
                current_video_time += segment_duration
                
                # Periodic cleanup to prevent memory buildup
                if i > 0 and i % 10 == 0:  # Every 10 segments
                    gc.collect()  # Force garbage collection
                    if len(video_segments) > 50:  # If we have many segments, warn
                        print(colored(f"[!] Memory optimization: {len(video_segments)} segments in memory", "yellow"))
            
            if not video_segments:
                raise ValueError("No valid video segments could be created")
            
            # Clean up clip cache before concatenation (frees memory)
            cleanup_clip_cache()
            
            # Concatenate all segments
            print(colored(f"[+] Combining {len(video_segments)} video segments", "cyan"))
            final_video = concatenate_videoclips(video_segments, method="compose")
            final_video = final_video.set_fps(30)
            
            # Clean up segments after concatenation (they're now in final_video)
            for segment in video_segments:
                try:
                    segment.close()
                except:
                    pass
            video_segments.clear()
            gc.collect()  # Force cleanup
        finally:
            # Ensure cleanup even on error
            cleanup_clip_cache()
        
        # Create and prepend interesting thumbnail
        print(colored(f"[+] Creating interesting thumbnail...", "cyan"))
        thumbnail_clip = create_interesting_thumbnail(final_video, interesting_times=interesting_times, thumbnail_duration=0.2)
        # Prepend thumbnail to make it the first frame (TikTok uses first frame as thumbnail)
        final_video = concatenate_videoclips([thumbnail_clip, final_video], method="compose")
        
        # Get actual video duration
        actual_video_duration = final_video.duration
        
        # Use the minimum of video and audio duration to ensure they match
        final_duration = min(actual_video_duration, duration)
        
        # Trim both video and audio to match
        if actual_video_duration > final_duration:
            final_video = final_video.subclip(0, final_duration)
        
        # Trim audio to match video duration and set proper audio properties
        audio = audio.subclip(0, final_duration)
        audio = audio.set_fps(44100)  # Standard audio sample rate
        audio = audio.set_duration(final_duration)  # Ensure exact duration match
        
        # Set video duration
        final_video = final_video.set_duration(final_duration)
        
        # Add audio to video - ensure it's properly attached
        final_video = final_video.set_audio(audio)
        
        # Verify audio is attached
        if final_video.audio is None:
            raise ValueError("Failed to attach audio to video")
        
        print(colored(f"[+] Video duration: {final_video.duration:.2f}s, Audio duration: {final_video.audio.duration:.2f}s", "cyan"))
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Generate temp audio file path in temp directory
        temp_audio_filename = f"temp_audio_{uuid.uuid4().hex}.mp4"
        temp_audio_path = os.path.join(temp_dir, temp_audio_filename)
        
        # Write video with audio
        print(colored(f"[+] Rendering video to {output_path}", "cyan"))
        print(colored(f"[+] Temporary files will be saved in: {os.path.abspath(temp_dir)}", "cyan"))
        final_video.write_videofile(
            output_path,
            threads=threads,
            codec='libx264',
            audio_codec='aac',
            preset='medium',
            bitrate='8000k',
            fps=30,
            audio_bitrate='192k',
            audio_fps=44100,
            temp_audiofile=temp_audio_path,
            remove_temp=True
        )
        
        # Clean up
        try:
            final_video.close()
        except:
            pass
        try:
            audio.close()
        except:
            pass
        
        # Force garbage collection after cleanup
        gc.collect()
        
        print(colored(f"[+] Music video created successfully: {output_path}", "green"))
        return output_path
    
    except Exception as e:
        logger.error(colored(f"[-] Error creating music video: {e}", "red"))
        raise







