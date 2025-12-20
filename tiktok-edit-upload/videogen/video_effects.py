# Fix for Pillow 10.0.0+ compatibility (ANTIALIAS was removed)
# MUST be applied BEFORE any MoviePy imports
try:
    from PIL import Image
    if not hasattr(Image, 'ANTIALIAS'):
        # Pillow 10.0.0+ removed ANTIALIAS, use LANCZOS instead
        Image.ANTIALIAS = Image.LANCZOS
except ImportError:
    pass

import numpy as np
from moviepy.editor import VideoClip
import random

def apply_zoom_effect(clip: VideoClip, zoom_factor: float = 1.2, duration: float = 0.1) -> VideoClip:
    """
    Apply a zoom effect to a video clip.
    NOTE: Clip should already be downscaled to target resolution (1080x1920) before applying effects.
    
    Args:
        clip: VideoClip to apply effect to (should be 1080x1920 or smaller)
        zoom_factor: How much to zoom (1.0 = no zoom, 1.5 = 50% zoom)
        duration: Duration of the zoom effect
    
    Returns:
        Modified VideoClip with zoom effect
    """
    def zoom_func(t):
        if t < duration:
            # Smooth zoom in
            scale = 1.0 + (zoom_factor - 1.0) * (t / duration)
        else:
            scale = zoom_factor
        return scale
    
    def make_frame(get_frame, t):
        scale = zoom_func(t)
        # Get frame first (lightweight if clip is already downscaled)
        frame = get_frame(t)
        h, w = frame.shape[:2]  # Get dimensions from frame, not clip (avoids property access)
        
        new_w = int(w * scale)
        new_h = int(h * scale)
        
        # Resize the frame using PIL
        from PIL import Image
        
        # Convert numpy array to PIL Image
        pil_image = Image.fromarray(frame)
        resized_image = pil_image.resize((new_w, new_h), Image.LANCZOS)
        resized_frame = np.array(resized_image)
        
        # Crop to center (maintain original size)
        start_x = (new_w - w) // 2
        start_y = (new_h - h) // 2
        cropped = resized_frame[start_y:start_y+h, start_x:start_x+w]
        
        return cropped
    
    return clip.fl(make_frame, apply_to=['video'])


def apply_flash_effect(clip: VideoClip, flash_duration: float = 0.05) -> VideoClip:
    """
    Apply a flash/white screen effect at the start of a clip.
    
    Args:
        clip: VideoClip to apply effect to
        flash_duration: Duration of the flash in seconds
    
    Returns:
        Modified VideoClip with flash effect
    """
    from moviepy.editor import ColorClip
    
    def make_frame(get_frame, t):
        # Get frame first to determine dimensions (avoids accessing clip.w/clip.h)
        frame = get_frame(t)
        h, w = frame.shape[:2]
        
        if t < flash_duration:
            # White flash
            return np.full((h, w, 3), 255, dtype=np.uint8)
        else:
            # Normal video with slight brightness boost
            if t < flash_duration * 2:
                # Gradual fade from white
                fade_factor = (t - flash_duration) / flash_duration
                frame = frame * fade_factor + (1 - fade_factor) * 255
            return np.clip(frame, 0, 255).astype(np.uint8)
    
    return clip.fl(make_frame, apply_to=['video'])


def apply_rgb_shift(clip: VideoClip, shift_amount: int = 5) -> VideoClip:
    """
    Apply RGB channel shifting effect (chromatic aberration).
    
    Args:
        clip: VideoClip to apply effect to
        shift_amount: Pixels to shift RGB channels
    
    Returns:
        Modified VideoClip with RGB shift
    """
    def make_frame(get_frame, t):
        frame = get_frame(t)
        h, w = frame.shape[:2]
        
        # Shift RGB channels
        r_channel = frame[:, :, 0]
        g_channel = frame[:, :, 1]
        b_channel = frame[:, :, 2]
        
        # Create shifted versions
        r_shifted = np.roll(r_channel, shift_amount, axis=1)
        g_shifted = g_channel  # Keep green centered
        b_shifted = np.roll(b_channel, -shift_amount, axis=1)
        
        # Combine channels
        shifted_frame = np.stack([r_shifted, g_shifted, b_shifted], axis=2)
        return shifted_frame
    
    return clip.fl(make_frame, apply_to=['video'])


def apply_hue_rotation(clip: VideoClip, rotation_speed: float = 0.5) -> VideoClip:
    """
    Apply hue rotation effect (color cycling).
    
    Args:
        clip: VideoClip to apply effect to
        rotation_speed: Speed of hue rotation (rotations per second)
    
    Returns:
        Modified VideoClip with hue rotation
    """
    def make_frame(get_frame, t):
        frame = get_frame(t)
        
        # Convert RGB to HSV
        from colorsys import rgb_to_hsv, hsv_to_rgb
        
        h, w = frame.shape[:2]
        rotated = np.zeros_like(frame)
        
        for i in range(h):
            for j in range(w):
                r, g, b = frame[i, j] / 255.0
                h_val, s_val, v_val = rgb_to_hsv(r, g, b)
                
                # Rotate hue
                h_val = (h_val + rotation_speed * t) % 1.0
                
                r_new, g_new, b_new = hsv_to_rgb(h_val, s_val, v_val)
                rotated[i, j] = [r_new * 255, g_new * 255, b_new * 255]
        
        return rotated.astype(np.uint8)
    
    return clip.fl(make_frame, apply_to=['video'])


def apply_prism_effect(clip: VideoClip, intensity: float = 0.3) -> VideoClip:
    """
    Apply a prism/glitch effect combining RGB shift and distortion.
    
    Args:
        clip: VideoClip to apply effect to
        intensity: Intensity of the effect (0.0 to 1.0)
    
    Returns:
        Modified VideoClip with prism effect
    """
    def make_frame(get_frame, t):
        frame = get_frame(t)
        h, w = frame.shape[:2]
        
        # RGB shift with varying intensity
        shift = int(10 * intensity * (1 + 0.5 * np.sin(t * 10)))
        
        r_channel = np.roll(frame[:, :, 0], shift, axis=1)
        g_channel = frame[:, :, 1]
        b_channel = np.roll(frame[:, :, 2], -shift, axis=1)
        
        # Add slight vertical distortion
        distortion = int(3 * intensity * np.sin(t * 15))
        r_channel = np.roll(r_channel, distortion, axis=0)
        b_channel = np.roll(b_channel, -distortion, axis=0)
        
        prism_frame = np.stack([r_channel, g_channel, b_channel], axis=2)
        
        # Blend with original for intensity control
        blended = frame * (1 - intensity) + prism_frame * intensity
        return np.clip(blended, 0, 255).astype(np.uint8)
    
    return clip.fl(make_frame, apply_to=['video'])


def apply_jump_cut(clip: VideoClip, jump_duration: float = 0.1) -> VideoClip:
    """
    Apply a jump cut effect (rapid cuts with slight time skips).
    
    Args:
        clip: VideoClip to apply effect to
        jump_duration: Duration of each jump segment
    
    Returns:
        Modified VideoClip with jump cuts
    """
    # This is more of an editing technique, so we'll create micro-segments
    segments = []
    current_time = 0
    
    while current_time < clip.duration:
        segment_end = min(current_time + jump_duration, clip.duration)
        segment = clip.subclip(current_time, segment_end)
        segments.append(segment)
        # Skip forward slightly for jump effect
        current_time += jump_duration * 0.9
    
    from moviepy.editor import concatenate_videoclips
    return concatenate_videoclips(segments)


def apply_fast_cut(clip: VideoClip, cut_duration: float = 0.05) -> VideoClip:
    """
    Apply fast cutting effect (very short clips).
    
    Args:
        clip: VideoClip to apply effect to
        cut_duration: Duration of each cut
    
    Returns:
        Modified VideoClip with fast cuts
    """
    segments = []
    current_time = 0
    
    while current_time < clip.duration:
        segment_end = min(current_time + cut_duration, clip.duration)
        segment = clip.subclip(current_time, segment_end)
        segments.append(segment)
        current_time += cut_duration
    
    from moviepy.editor import concatenate_videoclips
    return concatenate_videoclips(segments)


def apply_random_effect(clip: VideoClip, effects: list = None) -> VideoClip:
    """
    Apply a random visual effect to a clip.
    
    Args:
        clip: VideoClip to apply effect to
        effects: List of effect functions to choose from
    
    Returns:
        Modified VideoClip with random effect
    """
    if effects is None:
        effects = [
            lambda c: apply_zoom_effect(c, zoom_factor=1.3),
            lambda c: apply_flash_effect(c),
            lambda c: apply_rgb_shift(c, shift_amount=8),
            lambda c: apply_prism_effect(c, intensity=0.4),
        ]
    
    effect = random.choice(effects)
    return effect(clip)







