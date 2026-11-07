# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import logging

from odoo import models
from odoo.http import request
from odoo.tools import html_sanitize

_logger = logging.getLogger(__name__)

SCHEMES = ('light', 'dark')
MESSAGE_PARAMETER = 'sysadmin.message'
CHROME_COLOURS = {'light': '#71639e', 'dark': '#25262b'}


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def color_scheme(self):
        """Return the scheme the page is rendered with: 'light' or 'dark'."""
        user = self.env.user
        if user._is_public():
            return 'light'
        settings = user.sudo().res_users_settings_ids[:1]
        if settings.color_scheme in SCHEMES:
            return settings.color_scheme
        cookie = request.httprequest.cookies.get('color_scheme') if request else None
        return cookie if cookie in SCHEMES else 'light'

    @classmethod
    def _post_logout(cls):
        super()._post_logout()
        request.future_response.set_cookie('color_scheme', max_age=0)

    def session_info(self):
        info = super().session_info()
        if self.env.user._is_internal():
            message = self._cws_admin_message()
            if message:
                info['sysadmin_message'] = message
        return info

    def _cws_admin_message(self):
        """Return the administrator message with sanitized text, or None."""
        raw = self.env['ir.config_parameter'].sudo().get_str(MESSAGE_PARAMETER)
        if not raw:
            return None
        try:
            value = json.loads(raw)
        except ValueError:
            value = None
        if not isinstance(value, dict):
            _logger.error(
                "The parameter %s does not hold a JSON object; ignored.", MESSAGE_PARAMETER,
            )
            return None
        return {
            'message': html_sanitize(value.get('message') or ''),
            'warning_type': value.get('warning_type'),
        }

    def _cws_browser_chrome_colour(self, scheme):
        """Colour the browser paints its own chrome with for the given scheme."""
        return CHROME_COLOURS['dark' if scheme == 'dark' else 'light']
