"""
Resource Management Module for TikTok Bot
Prevents system overload and crashes by monitoring and controlling resource usage.
"""

import os
import sys
import time
import psutil
import threading
import queue
from typing import Optional, Dict, Callable, Any
from datetime import datetime, timedelta
from termcolor import colored
import logging
import gc
import signal

logger = logging.getLogger(__name__)


class ResourceMonitor:
    """Monitors system resources (CPU, memory, disk) in real-time."""
    
    def __init__(self, check_interval: float = 1.0):
        """
        Initialize resource monitor.
        
        Args:
            check_interval: How often to check resources (seconds)
        """
        self.check_interval = check_interval
        self.monitoring = False
        self.monitor_thread = None
        self.current_stats = {
            'cpu_percent': 0.0,
            'memory_percent': 0.0,
            'memory_used_gb': 0.0,
            'memory_available_gb': 0.0,
            'disk_percent': 0.0,
            'disk_free_gb': 0.0,
            'timestamp': None
        }
        self.lock = threading.Lock()
    
    def start_monitoring(self):
        """Start background monitoring thread."""
        if self.monitoring:
            return
        
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        print(colored("[+] Resource monitoring started", "green"))
    
    def stop_monitoring(self):
        """Stop background monitoring thread."""
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=2.0)
        print(colored("[+] Resource monitoring stopped", "yellow"))
    
    def _monitor_loop(self):
        """Background monitoring loop."""
        while self.monitoring:
            try:
                # Get CPU usage (non-blocking)
                cpu_percent = psutil.cpu_percent(interval=None)
                
                # Get memory usage
                memory = psutil.virtual_memory()
                memory_percent = memory.percent
                memory_used_gb = memory.used / (1024 ** 3)
                memory_available_gb = memory.available / (1024 ** 3)
                
                # Get disk usage (for temp directory)
                try:
                    disk = psutil.disk_usage('/')
                    disk_percent = disk.percent
                    disk_free_gb = disk.free / (1024 ** 3)
                except:
                    disk_percent = 0.0
                    disk_free_gb = 0.0
                
                with self.lock:
                    self.current_stats = {
                        'cpu_percent': cpu_percent,
                        'memory_percent': memory_percent,
                        'memory_used_gb': memory_used_gb,
                        'memory_available_gb': memory_available_gb,
                        'disk_percent': disk_percent,
                        'disk_free_gb': disk_free_gb,
                        'timestamp': datetime.now()
                    }
                
                time.sleep(self.check_interval)
            except Exception as e:
                logger.error(f"Error in resource monitoring: {e}")
                time.sleep(self.check_interval)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current resource statistics."""
        with self.lock:
            return self.current_stats.copy()
    
    def is_resource_high(self, 
                        cpu_threshold: float = 85.0,
                        memory_threshold: float = 85.0,
                        disk_threshold: float = 90.0) -> bool:
        """
        Check if any resource is above threshold.
        
        Args:
            cpu_threshold: CPU usage threshold (%)
            memory_threshold: Memory usage threshold (%)
            disk_threshold: Disk usage threshold (%)
        
        Returns:
            True if any resource is above threshold
        """
        stats = self.get_stats()
        return (stats['cpu_percent'] > cpu_threshold or
                stats['memory_percent'] > memory_threshold or
                stats['disk_percent'] > disk_threshold)
    
    def wait_for_resources(self,
                          cpu_threshold: float = 70.0,
                          memory_threshold: float = 75.0,
                          disk_threshold: float = 85.0,
                          max_wait: float = 300.0,
                          check_interval: float = 5.0) -> bool:
        """
        Wait until resources are below threshold.
        
        Args:
            cpu_threshold: Target CPU usage (%)
            memory_threshold: Target memory usage (%)
            disk_threshold: Target disk usage (%)
            max_wait: Maximum time to wait (seconds)
            check_interval: How often to check (seconds)
        
        Returns:
            True if resources became available, False if timeout
        """
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            stats = self.get_stats()
            
            if (stats['cpu_percent'] < cpu_threshold and
                stats['memory_percent'] < memory_threshold and
                stats['disk_percent'] < disk_threshold):
                return True
            
            # Show progress
            elapsed = time.time() - start_time
            print(colored(
                f"[!] Waiting for resources... CPU: {stats['cpu_percent']:.1f}%, "
                f"Memory: {stats['memory_percent']:.1f}%, Disk: {stats['disk_percent']:.1f}% "
                f"({elapsed:.0f}s/{max_wait:.0f}s)",
                "yellow"
            ))
            
            time.sleep(check_interval)
        
        return False
    
    def print_stats(self):
        """Print current resource statistics."""
        stats = self.get_stats()
        print(colored(
            f"[Resource Monitor] CPU: {stats['cpu_percent']:.1f}%, "
            f"Memory: {stats['memory_percent']:.1f}% ({stats['memory_used_gb']:.2f}GB used, "
            f"{stats['memory_available_gb']:.2f}GB available), "
            f"Disk: {stats['disk_percent']:.1f}% ({stats['disk_free_gb']:.2f}GB free)",
            "cyan"
        ))


class ProcessQueue:
    """Manages a queue of resource-intensive operations to prevent overload."""
    
    def __init__(self, max_concurrent: int = 1):
        """
        Initialize process queue.
        
        Args:
            max_concurrent: Maximum concurrent heavy operations
        """
        self.max_concurrent = max_concurrent
        self.active_count = 0
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        self.worker_threads = []
    
    def add_task(self, task_func: Callable, *args, **kwargs) -> Any:
        """
        Add a task to the queue and wait for it to complete.
        
        Args:
            task_func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
        
        Returns:
            Result of task_func
        """
        result_queue = queue.Queue()
        exception_queue = queue.Queue()
        
        def task_wrapper():
            try:
                result = task_func(*args, **kwargs)
                result_queue.put(result)
            except Exception as e:
                exception_queue.put(e)
            finally:
                with self.lock:
                    self.active_count -= 1
        
        # Wait for slot to become available
        while True:
            with self.lock:
                if self.active_count < self.max_concurrent:
                    self.active_count += 1
                    break
            
            # Wait a bit before checking again
            time.sleep(0.5)
        
        # Execute task
        thread = threading.Thread(target=task_wrapper, daemon=True)
        thread.start()
        thread.join()  # Wait for completion
        
        # Check for exceptions
        if not exception_queue.empty():
            raise exception_queue.get()
        
        return result_queue.get()
    
    def get_active_count(self) -> int:
        """Get number of currently active tasks."""
        with self.lock:
            return self.active_count


class RateLimiter:
    """Rate limits operations to prevent system overload."""
    
    def __init__(self, max_operations: int, time_window: float):
        """
        Initialize rate limiter.
        
        Args:
            max_operations: Maximum operations allowed
            time_window: Time window in seconds
        """
        self.max_operations = max_operations
        self.time_window = time_window
        self.operations = []
        self.lock = threading.Lock()
    
    def can_proceed(self) -> bool:
        """Check if operation can proceed."""
        with self.lock:
            now = time.time()
            # Remove old operations outside time window
            self.operations = [op_time for op_time in self.operations 
                             if now - op_time < self.time_window]
            if self.operations and self.max_operations > 0:
                return len(self.operations) < self.max_operations
            return True
    
    def wait_if_needed(self, max_wait: float = 60.0):
        """
        Wait if rate limit would be exceeded.
        
        Args:
            max_wait: Maximum time to wait (seconds)
        
        Returns:
            True if can proceed, False if would exceed limit after waiting
        """
        start_time = time.time()
        
        while not self.can_proceed():
            if time.time() - start_time > max_wait:
                return False
            
            # Calculate wait time
            with self.lock:
                if self.operations:
                    oldest_op = min(self.operations)
                    wait_time = self.time_window - (time.time() - oldest_op)
                    if wait_time > 0:
                        print(colored(
                            f"[!] Rate limit reached. Waiting {wait_time:.1f}s...",
                            "yellow"
                        ))
                        time.sleep(min(wait_time, 5.0))
                else:
                    time.sleep(1.0)
        
        # Record operation
        with self.lock:
            self.operations.append(time.time())
        
        return True


class MemoryManager:
    """Manages memory usage and cleanup."""
    
    @staticmethod
    def force_garbage_collection():
        """Force Python garbage collection."""
        collected = gc.collect()
        if collected > 0:
            print(colored(f"[+] Garbage collected {collected} objects", "green"))
    
    @staticmethod
    def cleanup_temp_files(temp_dir: str = "./temp", max_age_hours: float = 24.0):
        """
        Clean up old temporary files.
        
        Args:
            temp_dir: Directory containing temp files
            max_age_hours: Maximum age of files to keep (hours)
        """
        if not os.path.exists(temp_dir):
            return
        
        try:
            now = time.time()
            max_age_seconds = max_age_hours * 3600
            cleaned_count = 0
            cleaned_size = 0
            
            for filename in os.listdir(temp_dir):
                filepath = os.path.join(temp_dir, filename)
                try:
                    if os.path.isfile(filepath):
                        file_age = now - os.path.getmtime(filepath)
                        if file_age > max_age_seconds:
                            file_size = os.path.getsize(filepath)
                            os.remove(filepath)
                            cleaned_count += 1
                            cleaned_size += file_size
                except Exception as e:
                    logger.warning(f"Error cleaning temp file {filename}: {e}")
            
            if cleaned_count > 0:
                cleaned_size_mb = cleaned_size / (1024 ** 2)
                print(colored(
                    f"[+] Cleaned {cleaned_count} temp files ({cleaned_size_mb:.1f} MB)",
                    "green"
                ))
        except Exception as e:
            logger.warning(f"Error cleaning temp directory: {e}")


class ResourceManager:
    """Main resource management coordinator."""
    
    def __init__(self,
                 cpu_threshold: float = None,
                 memory_threshold: float = None,
                 disk_threshold: float = None,
                 max_concurrent_operations: int = None,
                 video_processing_rate_limit: int = None,
                 video_processing_window: float = None):
        """
        Initialize resource manager.
        
        Args:
            cpu_threshold: CPU usage threshold (%) - defaults from env or 85.0
            memory_threshold: Memory usage threshold (%) - defaults from env or 85.0
            disk_threshold: Disk usage threshold (%) - defaults from env or 90.0
            max_concurrent_operations: Max concurrent heavy operations - defaults from env or 1
            video_processing_rate_limit: Max video processing operations per window - defaults from env or 2
            video_processing_window: Time window for rate limiting (seconds) - defaults from env or 3600.0
        """
        # Load from environment variables with CONSERVATIVE defaults to prevent crashes
        # Thresholds set to allow normal system operation while preventing overload
        self.cpu_threshold = float(os.getenv('RESOURCE_CPU_THRESHOLD', cpu_threshold or 85.0))
        self.memory_threshold = float(os.getenv('RESOURCE_MEMORY_THRESHOLD', memory_threshold or 90.0))  # Increased from 80 to allow normal idle usage
        self.disk_threshold = float(os.getenv('RESOURCE_DISK_THRESHOLD', disk_threshold or 90.0))
        self.max_concurrent_operations = int(os.getenv('RESOURCE_MAX_CONCURRENT', max_concurrent_operations or 1))
        # Default to 3 operations per hour for scheduled posting (was 1, too restrictive)
        # This allows posting at multiple optimal times throughout the day
        self.video_processing_rate_limit = int(os.getenv('RESOURCE_RATE_LIMIT', video_processing_rate_limit or 3))
        self.video_processing_window = float(os.getenv('RESOURCE_RATE_WINDOW', video_processing_window or 3600.0))
        
        # Initialize components
        self.monitor = ResourceMonitor(check_interval=2.0)
        self.process_queue = ProcessQueue(max_concurrent=self.max_concurrent_operations)
        self.video_rate_limiter = RateLimiter(
            max_operations=self.video_processing_rate_limit,
            time_window=self.video_processing_window
        )
        self.memory_manager = MemoryManager()
        
        # Start monitoring
        self.monitor.start_monitoring()
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        print(colored("\n[!] Shutdown signal received. Cleaning up...", "yellow"))
        self.cleanup()
        sys.exit(0)
    
    def check_resources(self) -> bool:
        """
        Check if resources are available for heavy operations.
        
        Returns:
            True if resources are available
        """
        return not self.monitor.is_resource_high(
            cpu_threshold=self.cpu_threshold,
            memory_threshold=self.memory_threshold,
            disk_threshold=self.disk_threshold
        )
    
    def wait_for_resources(self, max_wait: float = 300.0) -> bool:
        """
        Wait for resources to become available.
        
        Args:
            max_wait: Maximum time to wait (seconds)
        
        Returns:
            True if resources became available
        """
        # Use less aggressive wait thresholds - only wait if resources are critically high
        # This prevents waiting forever when system has normal idle usage
        return self.monitor.wait_for_resources(
            cpu_threshold=self.cpu_threshold - 5.0,  # Wait for slightly lower threshold
            memory_threshold=self.memory_threshold - 5.0,  # Less aggressive wait
            disk_threshold=self.disk_threshold - 5.0,
            max_wait=max_wait
        )
    
    def execute_with_resource_management(self, func: Callable, *args, **kwargs) -> Any:
        """
        Execute a function with resource management.
        
        Args:
            func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments
        
        Returns:
            Result of function
        """
        # Check rate limiting
        # For scheduled posts, allow waiting up to 30 minutes (or full window if shorter)
        # This ensures scheduled posts aren't blocked by recent operations
        max_wait_time = min(self.video_processing_window * 0.5, 1800.0)  # Max 30 minutes or half the window
        if not self.video_rate_limiter.wait_if_needed(max_wait=max_wait_time):
            # If we timed out waiting, check one more time if we can proceed now
            # (operations may have aged out during the wait)
            if not self.video_rate_limiter.can_proceed():
                raise RuntimeError("Rate limit exceeded. Too many operations.")
            # If we can proceed now, record the operation manually
            with self.video_rate_limiter.lock:
                self.video_rate_limiter.operations.append(time.time())
        
        # Wait for resources if needed
        if not self.check_resources():
            print(colored("[!] Resources high, waiting...", "yellow"))
            if not self.wait_for_resources(max_wait=300.0):
                raise RuntimeError("Resources unavailable. System overloaded.")
        
        # Force garbage collection before heavy operation
        self.memory_manager.force_garbage_collection()
        
        # Execute through process queue
        try:
            result = self.process_queue.add_task(func, *args, **kwargs)
            
            # Cleanup after operation
            self.memory_manager.force_garbage_collection()
            self.memory_manager.cleanup_temp_files()
            
            return result
        except Exception as e:
            # Cleanup on error
            self.memory_manager.force_garbage_collection()
            raise
    
    def get_status(self) -> Dict[str, Any]:
        """Get current resource management status."""
        stats = self.monitor.get_stats()
        return {
            'resources': stats,
            'active_operations': self.process_queue.get_active_count(),
            'rate_limit_ok': self.video_rate_limiter.can_proceed(),
            'resources_available': self.check_resources()
        }
    
    def print_status(self):
        """Print current status."""
        status = self.get_status()
        self.monitor.print_stats()
        print(colored(
            f"[Resource Manager] Active operations: {status['active_operations']}, "
            f"Rate limit OK: {status['rate_limit_ok']}, "
            f"Resources available: {status['resources_available']}",
            "cyan"
        ))
    
    def cleanup(self):
        """Clean up resources."""
        print(colored("[+] Cleaning up resource manager...", "yellow"))
        self.monitor.stop_monitoring()
        self.memory_manager.cleanup_temp_files()
        self.memory_manager.force_garbage_collection()
        print(colored("[+] Resource manager cleanup complete", "green"))


# Global resource manager instance
_resource_manager: Optional[ResourceManager] = None


def get_resource_manager() -> ResourceManager:
    """Get or create global resource manager instance."""
    global _resource_manager
    if _resource_manager is None:
        _resource_manager = ResourceManager()
    return _resource_manager


def cleanup_resource_manager():
    """Cleanup global resource manager."""
    global _resource_manager
    if _resource_manager is not None:
        _resource_manager.cleanup()
        _resource_manager = None

