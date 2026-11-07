# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import math


def round_time_spent(minutes_spent, minimum, rounding):
    """Return the minutes to record for a time spent.

    The time is raised to ``minimum`` first, then, when ``rounding`` is not
    zero, rounded up to the next multiple of ``rounding``.
    """
    minutes = max(minutes_spent, minimum)
    if rounding:
        minutes = math.ceil(minutes / rounding) * rounding
    return minutes
