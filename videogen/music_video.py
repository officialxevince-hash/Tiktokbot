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
import time
import threading
import signal
import gc
import time
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
        
        # CRITICAL: Get video duration WITHOUT loading entire video into memory
        # Use ffprobe to get metadata instead of loading with MoviePy
        print(colored(f"[+] Analyzing video metadata (memory-efficient)...", "cyan"))
        total_duration = None
        actual_clip_path = clip_path
        
        try:
            # Try to get duration using ffprobe (lightweight, no frame loading)
            probe_cmd = [
                'ffprobe', '-v', 'error', '-show_entries',
                'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1',
                clip_path
            ]
            result = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            if result.returncode == 0:
                total_duration = float(result.stdout.decode().strip())
                print(colored(f"[+] Video duration: {total_duration:.1f}s (from metadata)", "green"))
            else:
                # Fallback: Load with MoviePy but close immediately after getting duration
                video = VideoFileClip(clip_path)
                total_duration = video.duration
                video.close()
                del video
                gc.collect()
        except Exception as e:
            error_msg = str(e)
            # Check if it's a duration/metadata error (corrupted file)
            if "duration" in error_msg.lower() or "failed to read" in error_msg.lower():
                # Try to fix the corrupted video
                fixed_path = try_fix_corrupted_video(clip_path, temp_dir=os.path.join(os.path.dirname(output_dir), "temp"))
                if fixed_path:
                    try:
                        # Try ffprobe on fixed video
                        result = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
                        if result.returncode == 0:
                            total_duration = float(result.stdout.decode().strip())
                            actual_clip_path = fixed_path
                            print(colored(f"[+] Using fixed version of {os.path.basename(clip_path)}", "green"))
                        else:
                            video = VideoFileClip(fixed_path)
                            total_duration = video.duration
                            video.close()
                            del video
                            actual_clip_path = fixed_path
                    except Exception as e2:
                        logger.warning(colored(f"[-] Fixed video still cannot be analyzed: {str(e2)[:100]}", "yellow"))
                        return [clip_path]
                else:
                    logger.warning(colored(f"[-] Cannot fix corrupted video {os.path.basename(clip_path)}. Skipping.", "yellow"))
                    return [clip_path]
            elif "timeout" in error_msg.lower() or "timed out" in error_msg.lower():
                logger.warning(colored(f"[-] Timeout analyzing {os.path.basename(clip_path)} - file may be on slow storage. Skipping.", "yellow"))
                return [clip_path]
            else:
                logger.warning(colored(f"[-] Error analyzing {os.path.basename(clip_path)}: {error_msg[:100]}. Skipping.", "yellow"))
                return [clip_path]
        
        if total_duration is None:
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
        
        # CRITICAL: Extract segments one at a time, loading video only when needed
        # This prevents keeping entire large video in memory
        for i, start_time in enumerate(segment_starts):
            segment_video = None
            try:
                # Ensure we don't go past the end
                end_time = min(start_time + segment_duration, total_duration - skip_end)
                
                if end_time - start_time < min_segment_duration:
                    continue
                
                # Output path
                output_path = os.path.join(output_dir, f"{base_name}_segment_{i+1:03d}.mp4")
                
                # CRITICAL: Load video ONLY for this segment, extract, then close immediately
                # This prevents keeping entire large video in memory
                print(colored(f"[+] Extracting segment {i+1}/{num_segments} ({start_time:.1f}s - {end_time:.1f}s)...", "cyan"))
                
                # Load video, extract segment, close video - all in one operation
                segment_video = VideoFileClip(actual_clip_path)
                segment = segment_video.subclip(start_time, end_time)
                segment = segment.without_audio()  # Remove audio to save space
                
                # CRITICAL: Downscale large videos during extraction to prevent memory issues
                # Check if video is large and needs downscaling
                try:
                    seg_w = segment.w
                    seg_h = segment.h
                    if seg_w > 1920 or seg_h > 1080:
                        # Downscale before writing to reduce memory usage
                        scale = min(1920 / seg_w, 1080 / seg_h)
                        new_w = int(seg_w * scale)
                        new_h = int(seg_h * scale)
                        new_w = new_w - (new_w % 2)  # Ensure even
                        new_h = new_h - (new_h % 2)
                        segment = segment.resize((new_w, new_h))
                except:
                    pass  # If we can't get dimensions, continue anyway
                
                # Write segment with ULTRA memory-efficient settings for large videos
                # Use fastest preset and lowest settings to prevent crashes
                segment.write_videofile(
                    output_path,
                    codec='libx264',
                    audio_codec='aac',
                    preset='ultrafast',  # Fastest preset to prevent memory issues
                    bitrate='3000k',  # Lower bitrate to reduce memory/CPU
                    threads=1,  # Single thread to prevent overload
                    logger=None,  # Suppress verbose output
                    write_logfile=False  # Don't write log file
                )
                
                # CRITICAL: Close segment and source video immediately
                segment.close()
                del segment
                segment_video.close()
                del segment_video
                
                extracted_segments.append(output_path)
                
                # Force garbage collection after each segment
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
        
        # Video was never loaded into memory (we used ffprobe), so no need to close
        # But ensure any remaining references are cleared
        gc.collect()
        
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
    NOTE: This function is deprecated - rotation is now done in prepare_clip after downscaling.
    Kept for backward compatibility but should not be used on large videos.
    
    Args:
        clip: VideoFileClip to check and correct
        target_size: Target video size (width, height)
    
    Returns:
        VideoFileClip: Corrected clip with proper orientation
    """
    # WARNING: Accessing .w and .h may trigger frame loading in MoviePy
    # This function should only be used on already-downscaled videos
    try:
        target_aspect = target_size[0] / target_size[1]  # width/height ratio
        clip_aspect = clip.w / clip.h  # width/height ratio
        
        # Determine if target is vertical (aspect < 1) or horizontal (aspect > 1)
        target_is_vertical = target_aspect < 1.0
        clip_is_horizontal = clip_aspect > 1.0
        
        # If target is vertical but clip is horizontal, rotate 90 degrees counter-clockwise
        if target_is_vertical and clip_is_horizontal:
            print(colored(f"[+] Rotating clip from horizontal ({clip.w}x{clip.h}) to vertical", "yellow"))
            clip = rotate(clip, -90)  # Counter-clockwise rotation
        
        # If target is horizontal but clip is vertical, rotate 90 degrees clockwise
        elif not target_is_vertical and not clip_is_horizontal:
            print(colored(f"[+] Rotating clip from vertical ({clip.w}x{clip.h}) to horizontal", "yellow"))
            clip = rotate(clip, 90)  # Clockwise rotation
    except:
        # If we can't determine orientation, skip rotation
        pass
    
    return clip


def prepare_clip(clip_path: str, target_size: Tuple[int, int] = (1080, 1920)) -> VideoFileClip:
    """
    Load and prepare a video clip for editing (crop, resize, remove audio).
    CRITICAL: Downscales large videos FIRST to prevent memory explosion.
    
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
        # Load with minimal memory usage - don't cache frames
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
    
    # CRITICAL FIX: Get dimensions WITHOUT loading frames (lightweight operation)
    # Accessing .w and .h may trigger frame loading, so we need to be careful
    try:
        original_w = clip.w
        original_h = clip.h
    except:
        # Fallback: get one frame to determine size (unavoidable but we'll resize immediately)
        try:
            test_frame = clip.get_frame(0)
            original_h, original_w = test_frame.shape[:2]
        except:
            raise ValueError(f"Cannot determine video dimensions: {clip_path}")
    
    # CRITICAL: For large videos (4K+), downscale FIRST before any other operations
    # This prevents memory explosion from processing full-resolution frames
    MAX_PROCESSING_WIDTH = 1920  # Don't process videos wider than 1920px
    MAX_PROCESSING_HEIGHT = 1080  # Don't process videos taller than 1080px
    
    needs_downscale = original_w > MAX_PROCESSING_WIDTH or original_h > MAX_PROCESSING_HEIGHT
    
    if needs_downscale:
        # Calculate intermediate size that maintains aspect but is manageable
        scale_w = MAX_PROCESSING_WIDTH / original_w
        scale_h = MAX_PROCESSING_HEIGHT / original_h
        scale = min(scale_w, scale_h)  # Use smaller scale to fit both dimensions
        
        intermediate_w = int(original_w * scale)
        intermediate_h = int(original_h * scale)
        
        # Ensure even dimensions (required by some codecs)
        intermediate_w = intermediate_w - (intermediate_w % 2)
        intermediate_h = intermediate_h - (intermediate_h % 2)
        
        print(colored(f"[+] Downscaling large video ({original_w}x{original_h} -> {intermediate_w}x{intermediate_h}) to prevent memory issues", "yellow"))
        
        # Resize FIRST before any other operations (much more memory efficient)
        clip = clip.resize((intermediate_w, intermediate_h))
        
        # Update dimensions after resize
        original_w = intermediate_w
        original_h = intermediate_h
    
    # Now determine if rotation is needed (on smaller video)
    target_aspect = target_size[0] / target_size[1]
    clip_aspect = original_w / original_h
    target_is_vertical = target_aspect < 1.0
    clip_is_horizontal = clip_aspect > 1.0
    
    # Rotate if needed (now on smaller video = much less memory)
    if target_is_vertical and clip_is_horizontal:
        print(colored(f"[+] Rotating clip from horizontal ({original_w}x{original_h}) to vertical", "yellow"))
        clip = rotate(clip, -90)
        # After rotation, dimensions are swapped
        original_w, original_h = original_h, original_w
        clip_aspect = original_w / original_h
    
    # Crop to match target aspect ratio (on smaller video)
    if clip_aspect < target_aspect:
        # Clip is narrower, crop height
        new_height = int(original_w / target_aspect)
        clip = crop(clip, 
                   width=original_w, 
                   height=new_height,
                   x_center=original_w / 2,
                   y_center=original_h / 2)
    else:
        # Clip is wider, crop width
        new_width = int(original_h * target_aspect)
        clip = crop(clip,
                   width=new_width,
                   height=original_h,
                   x_center=original_w / 2,
                   y_center=original_h / 2)
    
    # Final resize to exact target size (should be minimal work now)
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
        
        # OPTIMIZATION: Limit number of beats to prevent too many segments
        # Too many segments = very slow rendering and high memory usage
        max_beats = int(duration * 2.5)  # Max 2.5 beats per second (reasonable for most music)
        if len(beats) > max_beats:
            print(colored(f"[!] Too many beats ({len(beats)}), limiting to {max_beats} to prevent slow rendering", "yellow"))
            # Use every Nth beat to reduce count
            step = len(beats) // max_beats
            beats = beats[::step][:max_beats]
            print(colored(f"[+] Using {len(beats)} beats (every {step} beats)", "green"))
        
        # Get beat intervals
        intervals = get_beat_intervals(beats, duration)
        
        # OPTIMIZATION: Combine very short intervals to reduce segment count
        min_segment_duration = 0.3  # Minimum 0.3 seconds per segment
        combined_intervals = []
        current_start = None
        current_end = None
        
        for start, end in intervals:
            segment_duration = end - start
            if current_start is None:
                current_start = start
                current_end = end
            elif (current_end - current_start) < min_segment_duration:
                # Combine with previous if too short
                current_end = end
            else:
                # Save previous and start new
                combined_intervals.append((current_start, current_end))
                current_start = start
                current_end = end
        
        # Add last interval
        if current_start is not None:
            combined_intervals.append((current_start, current_end))
        
        if len(combined_intervals) < len(intervals):
            print(colored(f"[+] Combined intervals: {len(intervals)} -> {len(combined_intervals)} segments", "green"))
            intervals = combined_intervals
        
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
        
        # Cache for prepared clips (VERY limited to prevent memory issues with large clips)
        # Each cached clip is already downscaled to 1080x1920, but still uses memory
        MAX_CACHED_CLIPS = 2  # Reduced from 5 to 2 for large clip libraries
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
        
        clips_loaded_count = 0
        clips_failed_count = 0
        
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
                clips_failed_count += 1
                if clips_failed_count <= 3:  # Only log first few failures to avoid spam
                    logger.warning(colored(f"[-] Skipping segment {i+1}: Could not load clip {os.path.basename(selected_clip_path)}", "yellow"))
                continue
            
            clips_loaded_count += 1
            
            # Get a random portion of the clip
            # CRITICAL: Access duration property carefully (may trigger frame loading in some MoviePy versions)
            try:
                clip_duration = selected_clip.duration
            except:
                # Fallback: estimate from file or use default
                clip_duration = 5.0  # Default fallback
            
            if clip_duration > segment_duration:
                clip_start = random.uniform(0, clip_duration - segment_duration)
                segment = selected_clip.subclip(clip_start, clip_start + segment_duration)
            else:
                # Clip is shorter than needed, use it fully
                segment = selected_clip.subclip(0, min(clip_duration, segment_duration))
            
            # CRITICAL: Close parent clip immediately after creating subclip to free file handle
            # The subclip is independent and doesn't need the parent clip's file handle open
            try:
                selected_clip.close()
                del selected_clip
            except:
                pass
            
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
            # CRITICAL: Access duration carefully to avoid frame loading
            try:
                seg_duration = segment.duration
                if seg_duration != segment_duration:
                    segment = segment.subclip(0, min(seg_duration, segment_duration))
            except:
                # If we can't get duration, just use the segment as-is
                pass
            
            # CRITICAL: Append segment AFTER duration check (not inside try/except)
            video_segments.append(segment)
            current_video_time += segment_duration
            
            # Periodic cleanup to prevent memory and file descriptor buildup
            if i > 0 and i % 5 == 0:  # Every 5 segments (more frequent for large clips)
                gc.collect()  # Force garbage collection
                if len(video_segments) > 30:  # Lowered threshold for warning
                    print(colored(f"[!] Memory optimization: {len(video_segments)} segments in memory", "yellow"))
                    
                    # Check memory usage
                    try:
                        import psutil
                        memory = psutil.virtual_memory()
                        if memory.percent > 80:
                            print(colored(f"[!] Warning: Memory usage is {memory.percent:.1f}%", "yellow"))
                    except:
                        pass
        
        if not video_segments:
            error_msg = (
                f"No valid video segments could be created. "
                f"Clips loaded: {clips_loaded_count}, Clips failed: {clips_failed_count}, "
                f"Total intervals: {len(intervals)}, Total clips available: {len(clips)}"
            )
            logger.error(colored(f"[-] {error_msg}", "red"))
            cleanup_clip_cache()  # Clean up before raising error
            raise ValueError(error_msg)
        
        # Save segment count before cleanup (needed for later logging)
        num_segments_created = len(video_segments)
        
        print(colored(f"[+] Successfully created {num_segments_created} video segments from {clips_loaded_count} clips", "green"))
        
        # Clean up clip cache before concatenation (frees memory)
        cleanup_clip_cache()
        
        # CRITICAL: Try to increase file descriptor limit if possible
        try:
            import resource
            soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
            # Try to increase soft limit up to hard limit (or 1024, whichever is lower)
            new_soft = min(hard, 1024)
            if new_soft > soft:
                resource.setrlimit(resource.RLIMIT_NOFILE, (new_soft, hard))
                print(colored(f"[+] Increased file descriptor limit from {soft} to {new_soft}", "green"))
        except:
            pass  # Skip if not supported
        
        # CRITICAL: Write segments to temporary files to release file handles
        # This prevents "Too many open files" errors during rendering
        # Always write segments if we have many (>50) to prevent issues
        should_write_segments = num_segments_created > 50
        
        if should_write_segments:
            print(colored(f"[+] Writing {num_segments_created} segments to temporary files to release file handles", "cyan"))
            # Write all segments to temporary files and reload them
            # This ensures original video files are closed
            # Write in batches to avoid opening too many files at once
            batch_size = 20  # Write 20 segments at a time
            temp_segment_paths = []
            
            for batch_start in range(0, num_segments_created, batch_size):
                batch_end = min(batch_start + batch_size, num_segments_created)
                batch_segments = video_segments[batch_start:batch_end]
                
                # Write batch to disk
                for seg_idx, segment in enumerate(batch_segments):
                    i = batch_start + seg_idx
                    try:
                        temp_seg_path = os.path.join(temp_dir, f"segment_{i}_{uuid.uuid4().hex}.mp4")
                        # Write segment to temp file with fast settings
                        segment.write_videofile(temp_seg_path, codec='libx264', preset='ultrafast', 
                                               bitrate='2000k', audio=False, logger=None, threads=1)
                        # Close original segment immediately to release file handle
                        segment.close()
                        # Store path for reloading
                        temp_segment_paths.append(temp_seg_path)
                    except Exception as e:
                        # If writing fails, keep original segment (mark as None)
                        temp_segment_paths.append(None)
                        print(colored(f"[!] Warning: Failed to write segment {i} to disk: {e}", "yellow"))
                
                # Force cleanup after each batch
                gc.collect()
                
                # Progress update
                print(colored(f"[+] Written {batch_end}/{num_segments_created} segments to disk", "cyan"))
            
            # Reload segments from temporary files in batches
            print(colored(f"[+] Reloading segments from temporary files...", "cyan"))
            for i, temp_path in enumerate(temp_segment_paths):
                if temp_path and os.path.exists(temp_path):
                    try:
                        video_segments[i] = VideoFileClip(temp_path)
                    except Exception as e:
                        print(colored(f"[!] Warning: Failed to reload segment {i} from {temp_path}: {e}", "yellow"))
                # If temp_path is None, segment wasn't written, keep original (shouldn't happen)
            
            # Final cleanup
            gc.collect()
            print(colored(f"[+] Segments written to disk and reloaded - file handles released", "green"))
        
        # CRITICAL: Force aggressive garbage collection before concatenation
        gc.collect()
        gc.collect()  # Call twice to ensure cleanup
        
        # Concatenate all segments - use memory-efficient method for large videos
        print(colored(f"[+] Combining {num_segments_created} video segments", "cyan"))
        
        # For very large videos, concatenate in chunks to reduce memory
        if num_segments_created > 100:
            print(colored(f"[!] Large number of segments ({num_segments_created}), using chunked concatenation", "yellow"))
            # Concatenate in chunks of 50 segments
            chunk_size = 50
            chunked_videos = []
            
            for chunk_start in range(0, num_segments_created, chunk_size):
                chunk_end = min(chunk_start + chunk_size, num_segments_created)
                chunk = video_segments[chunk_start:chunk_end]
                
                print(colored(f"[+] Concatenating chunk {chunk_start//chunk_size + 1} ({len(chunk)} segments)...", "cyan"))
                chunk_video = concatenate_videoclips(chunk, method="compose")
                chunk_video = chunk_video.set_fps(30)
                chunked_videos.append(chunk_video)
                
                # Clean up chunk segments immediately
                for segment in chunk:
                    try:
                        segment.close()
                    except:
                        pass
                
                gc.collect()  # Force cleanup after each chunk
            
            # Concatenate the chunks
            print(colored(f"[+] Combining {len(chunked_videos)} video chunks...", "cyan"))
            final_video = concatenate_videoclips(chunked_videos, method="compose")
            final_video = final_video.set_fps(30)
            
            # CRITICAL: Aggressively clean up chunks and segments to free memory
            for chunk_video in chunked_videos:
                try:
                    chunk_video.close()
                except:
                    pass
            chunked_videos.clear()
            del chunked_videos
            
            # Also clear video_segments list (they're now in final_video)
            for seg in video_segments:
                try:
                    seg.close()
                except:
                    pass
            video_segments.clear()
            del video_segments
            
            # Force aggressive garbage collection
            gc.collect()
            gc.collect()
            time.sleep(1)  # Give system time to free memory
        else:
            # Normal concatenation for smaller videos
            final_video = concatenate_videoclips(video_segments, method="compose")
            final_video = final_video.set_fps(30)
            
            # CRITICAL: Aggressively clean up segments after concatenation
            for segment in video_segments:
                try:
                    segment.close()
                except:
                    pass
            video_segments.clear()
            del video_segments
            
            # Force aggressive garbage collection
            gc.collect()
            gc.collect()
            time.sleep(1)  # Give system time to free memory
        
        # Clean up clip cache after segment creation
        cleanup_clip_cache()
        
        # Create and prepend interesting thumbnail
        print(colored(f"[+] Creating interesting thumbnail...", "cyan"))
        thumbnail_clip = create_interesting_thumbnail(final_video, interesting_times=interesting_times, thumbnail_duration=0.2)
        # Prepend thumbnail to make it the first frame (TikTok uses first frame as thumbnail)
        # Store reference to old final_video so we can close it after rendering (not before!)
        # DO NOT close these clips yet - they're still referenced by the CompositeVideoClip
        # The CompositeVideoClip created by concatenate_videoclips will reference these clips
        # Closing them before rendering completes will cause 'NoneType' errors
        old_final_video_before_thumbnail = final_video
        final_video = concatenate_videoclips([thumbnail_clip, final_video], method="compose")
        
        # Get actual video duration
        actual_video_duration = final_video.duration
        
        # Use the minimum of video and audio duration to ensure they match
        final_duration = min(actual_video_duration, duration)
        
        # Trim both video and audio to match
        if actual_video_duration > final_duration:
            # Store reference to old final_video before subclip
            # Note: We can't close this immediately because subclips may reference the parent
            # We'll close it after rendering completes
            old_final_video_before_trim = final_video
            final_video = final_video.subclip(0, final_duration)
            # Don't close old_final_video_before_trim yet - subclip may reference it
            # Will be closed after rendering
        
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
        
        # Write video with audio - optimized for large videos and stability
        print(colored(f"[+] Rendering video to {output_path}", "cyan"))
        print(colored(f"[+] Video duration: {final_video.duration:.2f}s, Segments: {num_segments_created}", "cyan"))
        print(colored(f"[+] Temporary files will be saved in: {os.path.abspath(temp_dir)}", "cyan"))
        
        # AGGRESSIVE resource checks to prevent system crashes
        try:
            import psutil
            import os as os_module
            
            # Lower process priority to prevent system overload (Unix/macOS)
            try:
                if hasattr(os_module, 'nice'):
                    # Increase niceness (lower priority) - only works on Unix
                    current_nice = os_module.nice(0)
                    os_module.nice(5)  # Lower priority (higher niceness)
                    print(colored(f"[+] Lowered process priority to prevent system overload", "green"))
            except (AttributeError, OSError):
                pass  # Not supported on this system
            
            # Check available memory - try to free memory first, then check
            # Force aggressive garbage collection before checking
            gc.collect()
            gc.collect()
            time.sleep(2)  # Give system time to free memory
            
            memory = psutil.virtual_memory()
            available_gb = memory.available / (1024 ** 3)
            memory_percent = memory.percent
            print(colored(f"[+] System resources: {available_gb:.1f}GB RAM available ({memory_percent:.1f}% used)", "cyan"))
            
            # Adaptive memory requirement based on video complexity
            # Since we've already done heavy processing (segments created, concatenated),
            # rendering needs less memory. Use more lenient thresholds.
            if num_segments_created < 50:
                min_memory_required = 1.2  # Simple videos: 1.2GB minimum
            elif num_segments_created < 100:
                min_memory_required = 1.4  # Medium videos: 1.4GB minimum
            else:
                min_memory_required = 1.5  # Large videos: 1.5GB minimum (was 2.0GB)
            
            if available_gb < min_memory_required:
                # Try waiting for memory to free up (other processes might release memory)
                print(colored(f"[!] Low memory ({available_gb:.1f}GB), waiting up to 30s for memory to free...", "yellow"))
                for wait_attempt in range(6):  # 6 attempts × 5 seconds = 30 seconds
                    time.sleep(5)
                    memory = psutil.virtual_memory()
                    available_gb = memory.available / (1024 ** 3)
                    memory_percent = memory.percent
                    print(colored(f"[!] Memory check {wait_attempt + 1}/6: {available_gb:.1f}GB available ({memory_percent:.1f}% used)", "yellow"))
                    
                    if available_gb >= min_memory_required:
                        print(colored(f"[+] Memory freed! Proceeding with rendering...", "green"))
                        break
                    
                    # Force another GC attempt
                    gc.collect()
                    gc.collect()
                else:
                    # Still not enough memory after waiting - but allow rendering with even less if we're close
                    # Since segments are already created and concatenated, rendering is less memory-intensive
                    absolute_minimum = 1.0  # Absolute minimum: 1GB
                    if available_gb >= absolute_minimum:
                        print(colored(f"[!] Warning: Low memory ({available_gb:.1f}GB), but proceeding with ultra-conservative settings", "yellow"))
                        # Will use ultra-safe rendering settings automatically
                    else:
                        raise RuntimeError(f"Insufficient memory for rendering: {available_gb:.1f}GB available (need at least {absolute_minimum}GB)")
            
            if memory_percent > 85:
                print(colored(f"[!] Warning: Memory usage is {memory_percent:.1f}%, waiting...", "yellow"))
                time.sleep(15)  # Wait for memory to free up
                memory = psutil.virtual_memory()
                if memory.percent > 90:  # Only abort if very high (was 85)
                    raise RuntimeError(f"Memory too high: {memory.percent:.1f}% (system may crash)")
            
            # Check disk space - abort if less than 5GB free
            disk = psutil.disk_usage('/')
            free_gb = disk.free / (1024 ** 3)
            disk_percent = disk.percent
            print(colored(f"[+] Disk space: {free_gb:.1f}GB free ({disk_percent:.1f}% used)", "cyan"))
            
            if free_gb < 5.0:
                raise RuntimeError(f"Insufficient disk space for rendering: {free_gb:.1f}GB free (need at least 5GB)")
            
            # Check CPU - abort if already very high
            cpu_percent = psutil.cpu_percent(interval=1.0)
            print(colored(f"[+] CPU usage: {cpu_percent:.1f}%", "cyan"))
            
            if cpu_percent > 90:
                print(colored(f"[!] Warning: CPU usage is {cpu_percent:.1f}%, waiting...", "yellow"))
                time.sleep(15)  # Wait for CPU to cool down
                cpu_percent = psutil.cpu_percent(interval=1.0)
                if cpu_percent > 90:
                    raise RuntimeError(f"CPU usage too high: {cpu_percent:.1f}% (system may crash)")
        except ImportError:
            print(colored("[!] Warning: psutil not available, skipping resource checks", "yellow"))
        except Exception as e:
            raise RuntimeError(f"Resource check failed: {e}")
        
        # Check resources via resource manager
        try:
            from videogen.resource_manager import get_resource_manager
            resource_manager = get_resource_manager()
            if resource_manager:
                # Use more aggressive thresholds for rendering
                stats = resource_manager.monitor.get_stats()
                if stats['memory_percent'] > 80:
                    print(colored(f"[!] Memory usage high ({stats['memory_percent']:.1f}%), waiting...", "yellow"))
                    if not resource_manager.wait_for_resources(max_wait=180.0):
                        raise RuntimeError(f"Memory too high: {stats['memory_percent']:.1f}% (system may crash)")
                
                if stats['cpu_percent'] > 85:
                    print(colored(f"[!] CPU usage high ({stats['cpu_percent']:.1f}%), waiting...", "yellow"))
                    time.sleep(15)  # Wait for CPU to cool down
                
                resource_manager.memory_manager.force_garbage_collection()
        except:
            pass  # Resource manager not available, continue anyway
        
        # Detect GPU hardware acceleration availability
        def detect_gpu_codec():
            """Detect available GPU hardware encoder."""
            try:
                # Check for VideoToolbox (macOS)
                result = subprocess.run(
                    ['ffmpeg', '-hide_banner', '-encoders'],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=5
                )
                encoders_output = result.stdout.decode() + result.stderr.decode()
                
                if 'h264_videotoolbox' in encoders_output:
                    print(colored("[+] GPU acceleration available: VideoToolbox (macOS)", "green"))
                    return 'h264_videotoolbox'
                elif 'h264_nvenc' in encoders_output:
                    print(colored("[+] GPU acceleration available: NVENC (NVIDIA)", "green"))
                    return 'h264_nvenc'
                elif 'h264_qsv' in encoders_output:
                    print(colored("[+] GPU acceleration available: Quick Sync Video (Intel)", "green"))
                    return 'h264_qsv'
                elif 'h264_amf' in encoders_output:
                    print(colored("[+] GPU acceleration available: AMF (AMD)", "green"))
                    return 'h264_amf'
                else:
                    print(colored("[!] No GPU acceleration found, using CPU encoding", "yellow"))
                    return None
            except Exception as e:
                print(colored(f"[!] Could not detect GPU acceleration: {e}, using CPU encoding", "yellow"))
                return None
        
        # Detect GPU codec
        gpu_codec = detect_gpu_codec()
        
        # Use balanced settings: safe but not too slow
        # Too slow = appears frozen, too fast = crashes system
        video_duration = final_video.duration
        num_segments = num_segments_created
        is_large_video = video_duration > 30 or num_segments > 60
        
        # Adaptive settings based on video complexity
        # With GPU, we can use faster presets since GPU doesn't stress CPU
        if gpu_codec:
            # GPU encoding - can use faster settings
            if num_segments > 100:
                render_preset = 'medium'  # GPU can handle medium preset
                render_bitrate = '5000k'
                render_threads = 1  # GPU doesn't need many threads
                print(colored(f"[!] Many segments ({num_segments}), using GPU with medium preset", "yellow"))
            elif num_segments > 60 or is_large_video:
                render_preset = 'medium'
                render_bitrate = '6000k'
                render_threads = 1
                print(colored(f"[!] Moderate complexity ({num_segments} segments), using GPU with medium preset", "yellow"))
            else:
                render_preset = 'medium'
                render_bitrate = '7000k'
                render_threads = 1
                print(colored(f"[!] Lower complexity ({num_segments} segments), using GPU with medium preset", "yellow"))
        else:
            # CPU encoding - use conservative settings
            if num_segments > 100:
                # Very many segments - use safest settings
                render_preset = 'ultrafast'
                render_bitrate = '4000k'
                render_threads = 1
                print(colored(f"[!] Many segments ({num_segments}), using safest CPU settings", "yellow"))
            elif num_segments > 60 or is_large_video:
                # Many segments or long video - use safe settings
                render_preset = 'veryfast'
                render_bitrate = '5000k'
                render_threads = min(threads, 2)
                print(colored(f"[!] Moderate complexity ({num_segments} segments), using safe CPU settings", "yellow"))
            else:
                # Fewer segments - can use slightly faster settings
                render_preset = 'fast'
                render_bitrate = '6000k'
                render_threads = min(threads, 2)
                print(colored(f"[!] Lower complexity ({num_segments} segments), using balanced CPU settings", "yellow"))
        
        print(colored(f"[!] Rendering settings: Codec={gpu_codec or 'libx264'}, Preset={render_preset}, Bitrate={render_bitrate}, Threads={render_threads}", "cyan"))
        
        # Render with progress monitoring, timeout, and error handling
        max_retries = 2
        rendering_timeout = max(300, int(video_duration * 10))  # At least 5 min, or 10x video duration
        
        def render_with_progress_monitoring():
            """Render video with progress monitoring to detect freezes."""
            render_start_time = time.time()
            last_size = 0
            no_progress_count = 0
            max_no_progress_seconds = 90  # If no progress for 90 seconds, consider frozen
            check_interval = 10  # Check every 10 seconds
            # Capture render settings for progress calculation
            current_preset = render_preset
            current_bitrate = render_bitrate
            current_codec = gpu_codec if gpu_codec else 'libx264'  # Capture GPU codec
            
            # Start progress monitoring thread
            progress_monitor_active = threading.Event()
            progress_monitor_active.set()
            freeze_detected = threading.Event()
            
            def monitor_progress():
                """Monitor rendering progress and system resources to prevent crashes."""
                nonlocal last_size, no_progress_count
                # Check if we're using GPU (less RAM/CPU intensive)
                using_gpu = current_codec != 'libx264'
                
                # Log monitoring mode
                if using_gpu:
                    print(colored(f"[+] Resource monitoring: GPU mode (lenient thresholds)", "green"))
                else:
                    print(colored(f"[+] Resource monitoring: CPU mode (stricter thresholds)", "yellow"))
                
                # Track consecutive high CPU readings (only abort after sustained high usage)
                high_cpu_count = 0
                max_high_cpu_checks = 3 if using_gpu else 2  # Allow more spikes with GPU
                
                while progress_monitor_active.is_set() and not freeze_detected.is_set():
                    time.sleep(check_interval)
                    
                    # CRITICAL: Monitor system resources during rendering
                    try:
                        import psutil
                        memory = psutil.virtual_memory()
                        cpu_percent = psutil.cpu_percent(interval=0.5)
                        
                        # More lenient thresholds when using GPU (GPU uses less RAM/CPU)
                        if using_gpu:
                            # GPU rendering - very lenient thresholds (GPU handles most work)
                            memory_threshold = 97.0  # Allow up to 97% memory usage
                            min_free_gb = 0.3  # Only need 300MB free (GPU uses less RAM)
                            cpu_threshold = 99.0  # Warn at 99%
                            cpu_critical = 100.0  # Only abort if CPU stays at 100% for sustained period
                        else:
                            # CPU rendering - stricter thresholds
                            memory_threshold = 92.0
                            min_free_gb = 1.0
                            cpu_threshold = 95.0
                            cpu_critical = 98.0
                        
                        # Emergency abort if resources are critically high (prevent system crash)
                        if memory.percent > memory_threshold:
                            print(colored(f"[-] CRITICAL: Memory at {memory.percent:.1f}% (threshold: {memory_threshold}%) - ABORTING to prevent crash", "red"))
                            print(colored(f"    Using {'GPU' if using_gpu else 'CPU'} rendering thresholds", "yellow"))
                            freeze_detected.set()
                            raise RuntimeError(f"Memory critically high: {memory.percent:.1f}% (threshold: {memory_threshold}%) - aborting to prevent system crash")
                        
                        free_gb = memory.available / (1024 ** 3)
                        if free_gb < min_free_gb:
                            print(colored(f"[-] CRITICAL: Less than {min_free_gb}GB RAM free ({free_gb:.2f}GB available) - ABORTING", "red"))
                            print(colored(f"    Using {'GPU' if using_gpu else 'CPU'} rendering thresholds", "yellow"))
                            freeze_detected.set()
                            raise RuntimeError(f"Less than {min_free_gb}GB RAM available ({free_gb:.2f}GB free) - aborting to prevent system crash")
                        
                        # CPU monitoring: allow brief spikes, only abort on sustained high usage
                        if cpu_percent > cpu_threshold:
                            high_cpu_count += 1
                            if cpu_percent >= cpu_critical:
                                # CPU is at or above critical threshold - warn and potentially abort
                                print(colored(f"[-] WARNING: CPU at {cpu_percent:.1f}% ({high_cpu_count}/{max_high_cpu_checks} consecutive checks)", "yellow"))
                                print(colored(f"    Using {'GPU' if using_gpu else 'CPU'} rendering thresholds (critical: {cpu_critical}%)", "yellow"))
                                # Only abort if CPU stays critically high for multiple consecutive checks
                                if high_cpu_count >= max_high_cpu_checks:
                                    print(colored(f"[-] CRITICAL: CPU sustained at {cpu_percent:.1f}% for {high_cpu_count} checks - ABORTING", "red"))
                                    freeze_detected.set()
                                    raise RuntimeError(f"CPU critically high: {cpu_percent:.1f}% sustained for {high_cpu_count} checks - aborting to prevent system crash")
                            else:
                                # CPU is above warning threshold but below critical - just warn
                                if high_cpu_count == 1:  # Only print once when first detected
                                    print(colored(f"[!] CPU elevated at {cpu_percent:.1f}% (threshold: {cpu_threshold}%) - monitoring", "yellow"))
                                # Reset counter if CPU drops below critical (but still above threshold)
                                high_cpu_count = 0
                        else:
                            # CPU is normal, reset counter
                            if high_cpu_count > 0:
                                high_cpu_count = 0
                    except ImportError:
                        pass
                    except RuntimeError:
                        raise  # Re-raise abort signals
                    except:
                        pass  # Ignore other errors in monitoring
                    
                    # Check if output file exists and is growing
                    if os.path.exists(output_path):
                        try:
                            current_size = os.path.getsize(output_path)
                            if current_size > last_size:
                                # Progress detected
                                last_size = current_size
                                no_progress_count = 0
                                size_mb = current_size / (1024 ** 2)
                                elapsed = time.time() - render_start_time
                                # Better progress estimation based on expected file size
                                # Estimate: bitrate (kbps) * duration (s) / 8 = bytes
                                try:
                                    bitrate_kbps = int(current_bitrate.replace('k', ''))
                                    expected_size_bytes = (bitrate_kbps * 1000 * video_duration) / 8
                                    progress_pct = min(100, (current_size / max(1, expected_size_bytes)) * 100)
                                    remaining_estimate = (elapsed / max(0.01, progress_pct / 100)) - elapsed if progress_pct > 1 else 0
                                    print(colored(
                                        f"[!] Rendering: {size_mb:.1f} MB (~{progress_pct:.0f}%) - "
                                        f"{elapsed:.0f}s elapsed, ~{remaining_estimate:.0f}s remaining",
                                        "cyan"
                                    ))
                                except:
                                    # Fallback if calculation fails
                                    print(colored(f"[!] Rendering: {size_mb:.1f} MB - {elapsed:.0f}s elapsed", "cyan"))
                            else:
                                # No progress
                                no_progress_count += 1
                                if no_progress_count * check_interval >= max_no_progress_seconds:
                                    print(colored(f"[-] FREEZE DETECTED: No progress for {no_progress_count * check_interval} seconds", "red"))
                                    freeze_detected.set()
                        except OSError:
                            # File might be locked, that's okay
                            pass
                    else:
                        # File doesn't exist yet, that's normal at start
                        elapsed = time.time() - render_start_time
                        if elapsed > 30:  # If no file after 30 seconds, might be an issue
                            no_progress_count += 1
            
            progress_thread = threading.Thread(target=monitor_progress, daemon=True)
            progress_thread.start()
            
            try:
                # Render with optimized settings
                # Use GPU codec if available, otherwise fall back to CPU
                render_codec = gpu_codec if gpu_codec else 'libx264'
                
                # Build write_videofile parameters
                # Note: output_path is the first positional argument, not a keyword
                write_params = {
                    'threads': render_threads,
                    'codec': render_codec,
                    'audio_codec': 'aac',
                    'bitrate': render_bitrate,
                    'fps': 30,
                    'audio_bitrate': '192k',
                    'audio_fps': 44100,
                    'temp_audiofile': temp_audio_path,
                    'remove_temp': True,
                    'logger': None,  # Suppress verbose output to reduce memory
                    'write_logfile': False  # Don't write log file
                }
                
                # Configure codec-specific parameters
                if render_codec == 'libx264':
                    # CPU encoding - use preset
                    write_params['preset'] = render_preset
                elif render_codec == 'h264_videotoolbox':
                    # VideoToolbox (macOS) - use FFmpeg parameters for quality control
                    # VideoToolbox uses -allow_sw 1 and -realtime 1 for faster encoding
                    write_params['ffmpeg_params'] = [
                        '-allow_sw', '1',  # Allow software fallback
                        '-realtime', '1',  # Real-time encoding (faster)
                        '-pix_fmt', 'yuv420p'  # Ensure compatibility
                    ]
                elif render_codec == 'h264_nvenc':
                    # NVENC (NVIDIA) - use preset
                    write_params['preset'] = 'p4'  # Balanced preset for NVENC
                elif render_codec in ['h264_qsv', 'h264_amf']:
                    # Intel QSV or AMD AMF - use preset
                    write_params['preset'] = 'medium'
                
                # output_path is the first positional argument
                final_video.write_videofile(output_path, **write_params)
                
                # Check if freeze was detected
                if freeze_detected.is_set():
                    raise RuntimeError("Rendering appears to have frozen (no progress detected)")
                    
            finally:
                progress_monitor_active.clear()
                progress_thread.join(timeout=2.0)
        
        for attempt in range(max_retries):
            try:
                # Force garbage collection before rendering
                gc.collect()
                
                print(colored(f"[+] Starting render (timeout: {rendering_timeout}s, attempt {attempt + 1}/{max_retries})", "cyan"))
                render_start = time.time()
                
                # Use threading to add timeout capability
                render_result = [None]  # Use list to allow modification from nested function
                render_exception = [None]
                
                def render_worker():
                    try:
                        render_with_progress_monitoring()
                        render_result[0] = True
                    except Exception as e:
                        render_exception[0] = e
                
                render_thread = threading.Thread(target=render_worker, daemon=False)
                render_thread.start()
                render_thread.join(timeout=rendering_timeout)
                
                if render_thread.is_alive():
                    # Rendering timed out - try to interrupt
                    print(colored(f"[-] Rendering timed out after {rendering_timeout}s, attempting to interrupt...", "red"))
                    # Note: We can't easily kill the thread, but we can raise an exception
                    # The thread will continue but we'll treat it as failed
                    raise TimeoutError(f"Rendering exceeded timeout of {rendering_timeout} seconds")
                
                if render_exception[0]:
                    raise render_exception[0]
                
                if render_result[0] is None:
                    raise RuntimeError("Rendering completed but result is unknown")
                
                render_elapsed = time.time() - render_start
                print(colored(f"[+] Rendering completed in {render_elapsed:.1f}s", "green"))
                
                # Verify output file was created and is valid
                if not os.path.exists(output_path):
                    raise RuntimeError("Output file was not created")
                
                output_size = os.path.getsize(output_path)
                if output_size < 1024:  # Less than 1KB is likely corrupted
                    raise RuntimeError(f"Output file too small ({output_size} bytes), likely corrupted")
                
                print(colored(f"[+] Rendering completed successfully ({output_size / (1024**2):.1f} MB)", "green"))
                break  # Success, exit retry loop
                
            except (TimeoutError, subprocess.TimeoutExpired) as e:
                print(colored(f"[-] Rendering timeout (attempt {attempt + 1}/{max_retries}): {e}", "red"))
                # Clean up any partial output
                if os.path.exists(output_path):
                    try:
                        partial_size = os.path.getsize(output_path)
                        if partial_size < 1024 * 1024:  # Less than 1MB, likely incomplete
                            os.remove(output_path)
                            print(colored("[+] Removed incomplete output file", "yellow"))
                    except:
                        pass
                
                if attempt < max_retries - 1:
                    # Already using safest settings, but reduce timeout further
                    rendering_timeout = max(120, int(video_duration * 6))  # Even shorter timeout
                    gc.collect()
                    
                    # Check resources again before retry
                    try:
                        import psutil
                        memory = psutil.virtual_memory()
                        if memory.percent > 85:
                            print(colored(f"[!] Memory still high ({memory.percent:.1f}%), waiting longer...", "yellow"))
                            time.sleep(10)
                    except:
                        pass
                    
                    print(colored("[!] Retrying with shorter timeout...", "yellow"))
                    time.sleep(5)  # Longer wait to let system recover
                else:
                    raise RuntimeError(f"Rendering timed out after {max_retries} attempts. System may be overloaded. Try reducing video duration, number of clips, or effects.")
            
            except MemoryError as e:
                print(colored(f"[-] Memory error during rendering (attempt {attempt + 1}/{max_retries}): {e}", "red"))
                if attempt < max_retries - 1:
                    # Try with even more conservative settings
                    render_preset = 'ultrafast'
                    render_bitrate = '4000k'
                    render_threads = 1
                    gc.collect()
                    print(colored("[!] Retrying with ultra-low memory settings...", "yellow"))
                    time.sleep(2)  # Wait before retry
                else:
                    raise RuntimeError("Rendering failed due to memory constraints. Try reducing video duration or number of clips.")
            
            except Exception as e:
                error_msg = str(e)
                if "crash" in error_msg.lower() or "killed" in error_msg.lower() or "signal" in error_msg.lower() or "frozen" in error_msg.lower() or "freeze" in error_msg.lower():
                    print(colored(f"[-] Rendering issue detected (attempt {attempt + 1}/{max_retries}): {e}", "red"))
                    # Clean up any partial output
                    if os.path.exists(output_path):
                        try:
                            partial_size = os.path.getsize(output_path)
                            if partial_size < 1024 * 1024:  # Less than 1MB, likely incomplete
                                os.remove(output_path)
                                print(colored("[+] Removed incomplete output file", "yellow"))
                        except:
                            pass
                    
                    if attempt < max_retries - 1:
                        # Try with more conservative settings
                        render_preset = 'ultrafast'
                        render_bitrate = '4000k'
                        render_threads = 1
                        rendering_timeout = max(180, int(video_duration * 8))  # Shorter timeout
                        gc.collect()
                        print(colored("[!] Retrying with safer settings...", "yellow"))
                        time.sleep(3)  # Wait before retry to let system recover
                    else:
                        raise RuntimeError(f"Rendering failed after {max_retries} attempts: {e}")
                else:
                    # Other errors, don't retry
                    raise
        
        # Clean up immediately after rendering
        # Now safe to close clips that were used in CompositeVideoClip
        try:
            final_video.close()
        except:
            pass
        try:
            audio.close()
        except:
            pass
        # Clean up intermediate clips that were used in concatenation/subclipping
        # These can now be safely closed since rendering is complete
        try:
            thumbnail_clip.close()
        except:
            pass
        try:
            if 'old_final_video_before_thumbnail' in locals():
                old_final_video_before_thumbnail.close()
        except:
            pass
        try:
            if 'old_final_video_before_trim' in locals():
                old_final_video_before_trim.close()
        except:
            pass
        
        # Force garbage collection after cleanup
        gc.collect()
        
        # Final resource cleanup
        try:
            from videogen.resource_manager import get_resource_manager
            resource_manager = get_resource_manager()
            if resource_manager:
                resource_manager.memory_manager.force_garbage_collection()
                resource_manager.memory_manager.cleanup_temp_files(temp_dir=temp_dir, max_age_hours=1.0)
        except:
            pass
        
        # Verify final output
        if os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            file_size_mb = file_size / (1024 ** 2)
            print(colored(f"[+] Music video created successfully: {output_path} ({file_size_mb:.1f} MB)", "green"))
        else:
            raise RuntimeError(f"Output file not found after rendering: {output_path}")
        
        return output_path
    
    except Exception as e:
        logger.error(colored(f"[-] Error creating music video: {e}", "red"))
        raise







