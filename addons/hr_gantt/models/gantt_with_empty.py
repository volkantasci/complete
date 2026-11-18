# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.fields import Domain
from odoo.orm.domains import DomainAnd, DomainBool, DomainCondition, DomainNot, DomainOr

# operators that compare a many2one with a name rather than with ids
_NAME_OPERATORS = frozenset((
    'like', 'not like', 'ilike', 'not ilike', '=like', '=ilike', 'not =like', 'not =ilike',
))


class Base(models.AbstractModel):
    _inherit = 'base'

    @api.model
    def _hrg_relation_leaf(self, condition, field_name):
        """The leaf of ``condition`` on the related model, or ``None`` when it is not about it."""
        head, _dot, rest = condition.field_expr.partition('.')
        operator, value = condition.operator, condition.value
        if head == field_name:
            if rest:
                return Domain(rest, operator, value)
            if operator in ('any', 'not any'):
                inner = Domain(value)
                return inner if operator == 'any' else ~inner
            if operator in _NAME_OPERATORS:
                return Domain('display_name', operator, value)
            return Domain('id', operator, value)
        field = self._fields.get(head)
        related = getattr(field, 'related', None)
        if isinstance(related, str) and related.startswith(field_name + '.'):
            path = related[len(field_name) + 1:]
            return Domain(f'{path}.{rest}' if rest else path, operator, value)
        return None

    @api.model
    def _hrg_convert(self, node, field_name):
        """``(domain on the related model, whether a leaf was dropped)`` for ``node``."""
        if isinstance(node, DomainBool):
            return node, False
        if isinstance(node, DomainCondition):
            leaf = self._hrg_relation_leaf(node, field_name)
            return (Domain.TRUE, True) if leaf is None else (leaf, False)
        if isinstance(node, DomainNot):
            child, dropped = self._hrg_convert(node.child, field_name)
            # a dropped leaf under a negation cannot be replaced by TRUE inside it
            return (Domain.TRUE, True) if dropped else (~child, False)
        if isinstance(node, (DomainAnd, DomainOr)):
            parts = [self._hrg_convert(child, field_name) for child in node.children]
            combine = Domain.AND if isinstance(node, DomainAnd) else Domain.OR
            return combine([part for part, _dropped in parts]), any(d for _part, d in parts)
        return Domain.TRUE, True

    @api.model
    def _hrg_related_domain(self, domain, field_name):
        """``domain`` turned into a domain of the model that ``field_name`` points to."""
        converted, _dropped = self._hrg_convert(Domain(domain or []), field_name)
        return list(converted)

    @api.model
    def _hrg_concerns_only(self, domain, field_name):
        """Whether every leaf of ``domain`` is about the related record of ``field_name``."""
        return not self._hrg_convert(Domain(domain or []), field_name)[1]

    @api.model
    def _get_gantt_data_with_empty(
        self, domain, groupby, read_specification, limit=None, offset=0,
        unavailability_fields=None, progress_bar_fields=None,
        start_date=None, stop_date=None, scale=None,
    ):
        """Like ``get_gantt_data``, with a group for every matching related record."""
        groupby = list(groupby or [])
        if len(groupby) != 1:
            raise UserError(_("The helper needs exactly one grouping field."))
        field_name = groupby[0]
        field = self._fields.get(field_name)
        if field is None or field.type != 'many2one':
            raise UserError(_("The grouping field must be a relation to another model."))
        self.check_access('read')

        wanted = Domain(domain or []) & self._access_domain('read')
        converted, _dropped = self._hrg_convert(wanted, field_name)
        related = self.env[field.comodel_name]
        if not any(c.field_expr.split('.')[0] == 'active' for c in converted.iter_conditions()):
            related = related.with_context(active_test=True)
        else:
            related = related.with_context(active_test=False)
        page = related.search(converted, offset=offset or 0, limit=limit)
        length = related.search_count(converted)

        records = self.search(Domain(domain or []) & Domain(field_name, 'in', page.ids))
        by_related = {}
        for record in records:
            by_related.setdefault(record[field_name].id, []).append(record.id)
        groups = [
            {field_name: (item.id, item.display_name), '__record_ids': by_related.get(item.id, [])}
            for item in page
        ]

        start = fields.Datetime.to_datetime(start_date)
        stop = fields.Datetime.to_datetime(stop_date)
        return {
            'groups': groups,
            'records': records.with_context(active_test=False).web_read(read_specification),
            'length': length,
            'unavailabilities': {
                name: self._gantt_unavailability(
                    name, self._tl_group_value_ids(groups, name), start, stop, scale)
                for name in unavailability_fields or ()
            },
            'progress_bars': {
                name: self._gantt_progress_bar(
                    name, self._tl_group_value_ids(groups, name), start, stop)
                for name in progress_bar_fields or ()
            },
        }
