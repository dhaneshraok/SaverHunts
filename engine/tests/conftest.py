"""
Pytest configuration and shared fixtures for SaverHunt tests.

Sets up sys.path so imports work from the engine/ directory,
and provides common mock fixtures.
"""

import sys
import os

# Ensure engine/ is on the Python path so `from routers.social import ...` works
engine_dir = os.path.join(os.path.dirname(__file__), "..")
if engine_dir not in sys.path:
    sys.path.insert(0, os.path.abspath(engine_dir))
