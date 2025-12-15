#!/usr/bin/env python3
"""
Quick script to check if Node.js runtime (bun/node) is available
and test the bot_utils detection function.
"""
import sys
import shutil
from pathlib import Path

# Add project to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from tiktok_uploader.bot_utils import _find_node_executable, subprocess_jsvmp
    
    print("=" * 60)
    print("Node.js Runtime Check")
    print("=" * 60)
    
    # Check bun
    bun_path = shutil.which('bun')
    if bun_path:
        print(f"✓ bun found: {bun_path}")
    else:
        print("✗ bun not found")
    
    # Check node
    node_path = shutil.which('node')
    if node_path:
        print(f"✓ node found: {node_path}")
    else:
        print("✗ node not found")
    
    # Test detection function
    detected = _find_node_executable()
    if detected:
        print(f"\n✓ Runtime detection: {detected}")
        print("✓ Bot should work correctly!")
    else:
        print("\n✗ No Node.js runtime detected!")
        print("\nPlease install one of the following:")
        print("  - bun (recommended): curl -fsSL https://bun.sh/install | bash")
        print("  - node: https://nodejs.org/")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    
except ImportError as e:
    print(f"✗ Error importing bot_utils: {e}")
    print("Make sure you're running this from the project root directory.")
    sys.exit(1)
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)


