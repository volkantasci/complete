# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from lxml import etree
from odoo import _, fields, models

_TL_RANGES = ('day', 'week', 'month', 'quarter', 'year')
_TL_SCALES = ('day', 'week', 'week_2', 'month', 'month_3', 'year')
_TL_MODES = ('dense', 'sparse')

_TL_ROOT_OPTIONS = (
    '__validate__',  # ir.ui.view implementation detail
    'date_start', 'date_stop', 'string', 'default_range', 'default_scale',
    'scales', 'precision', 'color', 'progress', 'pill_label', 'thumbnails',
    'display_mode', 'total_row', 'progress_bar', 'display_unavailability',
    'groups_limit', 'default_group_by', 'sample', 'create', 'edit', 'delete',
    'form_view_id', 'on_create', 'cell_create', 'plan', 'multi_create_view',
    'disable_drag_drop', 'dependency_field', 'dependency_inverted_field',
    'buffer_start', 'buffer_stop', 'schedule', 'class', 'js_class',
    'collapse_first_level', 'dynamic_range', 'offset',
    'decoration-danger', 'decoration-warning', 'decoration-success',
    'decoration-info', 'decoration-secondary',
)
_TL_POPOVER_OPTIONS = ('__validate__', 'card_id')


class IrUiView(models.Model):
    _inherit = 'ir.ui.view'

    type = fields.Selection(selection_add=[('gantt', "Gantt")])

    def _is_qweb_based_view(self, view_type):
        return super()._is_qweb_based_view(view_type) or view_type == 'gantt'

    def _get_view_info(self):
        return {'gantt': {'icon': 'view_timeline'}} | super()._get_view_info()

    def _validate_tag_gantt(self, node, name_manager, node_info):
        if not node_info['validate']:
            return
        self._tl_check_root_children(node)
        self._tl_check_root_options(node)

    def _tl_check_root_children(self, node):
        popovers = 0
        for child in node.iterchildren(tag=etree.Element):
            if child.tag == 'popover':
                popovers += 1
                if popovers > 1:
                    self._raise_view_error(_("A Gantt view accepts a single popover."), child)
                self._tl_check_popover(child)
            elif child.tag != 'field':
                self._raise_view_error(
                    _(
                        "A Gantt view may only contain field and popover elements, not <%s>.",
                        child.tag,
                    ),
                    child,
                )

    def _tl_check_popover(self, popover):
        holders = 0
        for child in popover.iterchildren(tag=etree.Element):
            if child.tag == 'templates':
                holders += 1
                if holders > 1:
                    self._raise_view_error(
                        _("A popover accepts a single templates element."), child)
            elif child.tag != 'field':
                self._raise_view_error(
                    _(
                        "A popover may only contain field elements and one templates element, "
                        "not <%s>.",
                        child.tag,
                    ),
                    child,
                )
        unknown = set(popover.attrib) - set(_TL_POPOVER_OPTIONS)
        if unknown:
            unknown = ', '.join(sorted(unknown))
            self._raise_view_error(
                _(
                    "Unknown attributes on the popover element: %s. Only card_id is accepted.",
                    unknown,
                ),
                popover,
            )

    def _tl_check_root_options(self, node):
        if not node.get('date_start'):
            self._raise_view_error(
                _("The Gantt view needs a start field (date_start)."), node)
        if not node.get('date_stop'):
            self._raise_view_error(
                _("The Gantt view needs a stop field (date_stop)."), node)
        unknown = set(node.attrib) - set(_TL_ROOT_OPTIONS)
        if unknown:
            self._raise_view_error(
                _(
                    "Unknown attributes on the gantt element: %s. Accepted attributes: %s.",
                    ', '.join(sorted(unknown)),
                    ', '.join(sorted(n for n in _TL_ROOT_OPTIONS if n != '__validate__')),
                ),
                node,
            )
        value = node.get('default_range')
        if value is not None and value not in _TL_RANGES:
            self._raise_view_error(
                _(
                    'Unsupported default_range value "%s"; use day, week, month, quarter or year.',
                    value,
                ),
                node,
            )
        value = node.get('default_scale')
        if value is not None and value not in _TL_SCALES:
            self._raise_view_error(_('Unsupported default_scale value "%s".', value), node)
        value = node.get('display_mode')
        if value is not None and value not in _TL_MODES:
            self._raise_view_error(
                _('Unsupported display_mode value "%s"; use dense or sparse.', value), node)
        if node.get('dependency_field') and not node.get('dependency_inverted_field'):
            self._raise_view_error(
                _("dependency_field needs dependency_inverted_field as well."), node)
