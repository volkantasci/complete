# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.web.controllers.home import Home
from odoo.http import request, route

COOKIE_LIFETIME = 60 * 60 * 24 * 365  # seconds


class WebClientHome(Home):
    @route()
    def web_client(self, s_action=None, **kw):
        response = super().web_client(s_action=s_action, **kw)
        if response.status_code == 200:
            # Lasts one year, like the cookie the browser writes (R22b).
            response.set_cookie(
                'color_scheme',
                request.env['ir.http'].color_scheme(),
                max_age=COOKIE_LIFETIME,
                path='/',
            )
        return response
