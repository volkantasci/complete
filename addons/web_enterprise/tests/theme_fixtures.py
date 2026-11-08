# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Views and actions on Community base models that show every theme component.

The probe tests cannot rely on CRM or Sales, so the components a scenario names are
built here on ``res.partner`` and ``ir.module.module``. Everything is created with
inline architectures; the dict returned maps a key to an action id (``*_action``) or
a URL (``*_url``).
"""
import json

MARK = 'cws_theme_fixture'
PROGRESS = {'contact': 'success', 'invoice': 'warning', 'delivery': 'danger', 'other': '200'}

KANBAN = f"""
<kanban highlight_color="color" default_group_by="{{group}}">
    <progressbar field="type" colors='{json.dumps(PROGRESS)}'/>
    <field name="color"/>
    <templates>
        <t t-name="card">
            <field name="name" class="fw-bold"/>
            <field name="category_id" widget="many2many_tags" options="{{'color_field': 'color'}}"/>
            <div><span class="badge text-bg-primary"><field name="type"/></span></div>
            <div>
                <span class="badge text-bg-light o_cws_b_light"><field name="type"/></span>
                <span class="badge text-bg-dark o_cws_b_dark"><field name="type"/></span>
            </div>
        </t>
    </templates>
</kanban>
"""

LIST = """
<list string="Fixture" multi_edit="1">
    <field name="name"/>
    <field name="type" widget="badge"
        decoration-success="type == 'contact'" decoration-warning="type == 'invoice'"
        decoration-danger="type == 'delivery'" decoration-info="type == 'other'"/>
    <field name="category_id" widget="many2many_tags" options="{'color_field': 'color'}"/>
    <field name="color"/>
</list>
"""

VARIANTS = ('primary', 'secondary', 'light', 'danger', 'outline-secondary',
            'outline-primary', 'outline-danger', 'outline-light')
VARIANT_BUTTONS = '<div class="d-flex gap-2 o_cws_variants">' + ''.join(
    f'<button name="action_archive" type="object" string="B{n}"'
    f' class="btn-{name} o_cws_v_{name.replace("-", "_")}"/>'
    for n, name in enumerate(VARIANTS)
) + '</div>'

FORM = """
<form string="Fixture">
    <header>
        <button name="action_archive" type="object" string="Archive" class="btn-primary"/>
        <button name="action_unarchive" type="object" string="Restore"/>
        <field name="type" widget="statusbar" options="{'clickable': '1'}"/>
    </header>
    <sheet>
        <field name="active" invisible="1"/>
        <widget name="web_ribbon" title="Dormant" bg_color="text-bg-danger" invisible="active"/>
        <!--variants-->
        <div class="btn-group o_cws_group">
            <button name="action_archive" type="object" string="Ii" class="btn-secondary"/>
            <button name="action_archive" type="object" string="Jj" class="btn-secondary"/>
        </div>
        <div class="oe_button_box" name="button_box">
            <button name="action_archive" type="object" class="oe_stat_button" icon="fa-star">
                <field name="color" widget="statinfo" string="Colour"/>
            </button>
        </div>
        <group>
            <group>
                <field name="name"/>
                <field name="create_date"/>
            </group>
            <group>
                <field name="category_id" widget="many2many_tags"/>
                <field name="color"/>
            </group>
        </group>
        <notebook>
            <page string="First"><field name="comment"/></page>
            <page string="Second"><field name="function"/></page>
        </notebook>
    </sheet>
</form>
"""

DATE_FORM = """
<form string="Fixture">
    <sheet>
        <group>
            <field name="name" readonly="0"/>
            <field name="rate"/>
            <field name="currency_id" readonly="0" options="{'no_create': True, 'no_open': True}"/>
        </group>
    </sheet>
</form>
"""

CALENDAR = """
<calendar string="Fixture" date_start="create_date" mode="month" color="color">
    <field name="name"/>
</calendar>
"""

PIVOT = """
<pivot string="Fixture">
    <field name="type" type="row"/>
    <field name="color" type="measure"/>
</pivot>
"""

GRAPH = """
<graph string="Fixture">
    <field name="type"/>
    <field name="color" type="measure"/>
</graph>
"""


def _action(env, name, views, group_by=None, mode=None, model='res.partner', domain=None):
    """Create views and an action showing only the fixture records of ``model``."""
    view_records = []
    for index, (kind, arch) in enumerate(views):
        view = env['ir.ui.view'].create({
            'name': f'{MARK}.{name}.{kind}',
            'model': model,
            'type': kind,
            'arch': arch,
        })
        view_records.append((0, 0, {'sequence': index, 'view_mode': kind, 'view_id': view.id}))
    context = {'group_by': [group_by]} if group_by else {}
    return env['ir.actions.act_window'].create({
        'name': f'{MARK} {name}',
        'res_model': model,
        'view_mode': mode or ','.join(kind for kind, _arch in views),
        'domain': domain or [('ref', '=', MARK)],
        'context': context,
        'view_ids': view_records,
    })


def build_theme_fixtures(env):
    """Create the fixture records, views and actions; return the keys the tests use."""
    tags = env['res.partner.category'].create([
        {'name': f'{MARK} {n}', 'color': n} for n in (1, 2, 3)
    ])
    # four contacts (a populated column), one invoice (a single card), two deliveries
    spec = [('contact', 4), ('invoice', 1), ('delivery', 2)]
    partners = env['res.partner']
    for kind, count in spec:
        for number in range(count):
            partners |= env['res.partner'].create({
                'name': f'{MARK} {kind} {number + 1}',
                'ref': MARK,
                'type': kind,
                'color': (number % 3) + 1,
                'category_id': [(6, 0, tags[: number % 3 + 1].ids)],
            })
    kanban = KANBAN.replace('{group}', 'type')
    ungrouped = KANBAN.replace(' default_group_by="{group}"', '')
    fixtures = {
        'kanban_action': _action(env, 'kanban', [('kanban', kanban)], 'type').id,
        'kanban_ungrouped_action': _action(
            env, 'kanban_ungrouped', [('kanban', ungrouped)],
        ).id,
        'list_action': _action(env, 'list', [('list', LIST)]).id,
        'list_grouped_action': _action(env, 'list_grouped', [('list', LIST)], 'type').id,
        'calendar_action': _action(env, 'calendar', [('calendar', CALENDAR)]).id,
        'pivot_action': _action(env, 'pivot', [('pivot', PIVOT)]).id,
        'graph_action': _action(env, 'graph', [('graph', GRAPH)]).id,
    }
    form_action = _action(
        env, 'form', [('list', LIST), ('form', FORM.replace('<!--variants-->', VARIANT_BUTTONS))],
    )
    fixtures['form_action'] = form_action.id
    fixtures['form_record_url'] = f'/odoo/action-{form_action.id}/{partners[0].id}'
    # an editable Date field on a Community base model (the date picker scenarios)
    currency = env['res.currency'].with_context(active_test=False).search([], limit=1)
    rate = env['res.currency.rate'].create({
        'name': '2026-01-15', 'currency_id': currency.id, 'rate': 1.5,
    })
    date_action = _action(
        env, 'date_form', [('form', DATE_FORM)], model='res.currency.rate',
        domain=[('id', '=', rate.id)],
    )
    fixtures['date_form_url'] = f'/odoo/action-{date_action.id}/{rate.id}'
    fixtures['apps_kanban_url'] = '/odoo/action-base.open_module_tree?view_type=kanban'
    fixtures['apps_list_url'] = '/odoo/action-base.open_module_tree?view_type=list'
    fixtures['settings_url'] = '/odoo/action-base_setup.action_general_configuration'
    return fixtures
