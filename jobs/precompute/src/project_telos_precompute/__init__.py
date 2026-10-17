"""Offline precompute worker.

Generates segment maps for the demo corpus ahead of time so the runtime is a
cache lookup rather than a model call. Populated by tasks T2.4 through T2.13.
"""

__version__ = "0.1.0"
