# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import json
import logging
from collections.abc import Mapping

from odoo import models
from odoo.http import request
from odoo.tools import html_sanitize

_logger = logging.getLogger(__name__)

SCHEMES = ('light', 'dark')
AUDIENCES = ('user', 'admin')
MESSAGE_PARAMETER = 'sysadmin.message'

CHROME_COLOURS = {'light': '#71639e', 'dark': '#25262b'}


def _expire_scheme_cookie(response):
    """Ask the browser to drop the colour scheme cookie."""
    response.set_cookie('color_scheme', '', max_age=0)


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
        _expire_scheme_cookie(request.future_response)

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
        if not (
            isinstance(value, Mapping)
            and isinstance(value.get('message'), str)
            and value.get('warning_type') in AUDIENCES
        ):
            _logger.error(
                "The parameter %s does not hold a message with a text and an audience"
                " ('user' or 'admin'); ignored.", MESSAGE_PARAMETER,
            )
            return None
        return {
            'message': html_sanitize(value['message']),
            'warning_type': value['warning_type'],
        }

    def _cws_browser_chrome_colour(self, scheme):
        """Colour the browser paints its own chrome with for the given scheme."""
        return CHROME_COLOURS['dark' if scheme == 'dark' else 'light']
