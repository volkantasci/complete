# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.web.controllers.home import Home
from odoo.http import request, route


class WebClientHome(Home):
    @route()
    def web_client(self, s_action=None, **kw):
        response = super().web_client(s_action=s_action, **kw)
        if response.status_code == 200:
            # A session cookie (no expiry): the browser replaces it when the
            # user picks a scheme there.
            response.set_cookie(
                'color_scheme', request.env['ir.http'].color_scheme(), expires=None,
            )
        return response
