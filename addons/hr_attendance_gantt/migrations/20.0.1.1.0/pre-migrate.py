# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.hr_attendance_gantt.hooks import rename_attendance_view


def migrate(cr, version):
    """The attendance Gantt view is named ``hr_attendance_gantt_view`` from this version on."""
    rename_attendance_view(cr)
